/**
 * game.js — Mahjong Matching Game
 *
 * Features:
 *   • Start screen: player name + tile count selector
 *   • Game timer starts on first action, stops on win
 *   • Best times per player stored in localStorage
 *   • ~10 % of tiles start face-DOWN; the rest face-up
 *   • Tiles that started face-up are permanently face-up (gold border,
 *     cannot be flipped over by single-click)
 *   • Tiles clipping fixed: board height includes tile H + depth shadow pad
 */

// ── Audio ─────────────────────────────────────────────────────────────────────

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playClick() {
  const ctx = audioCtx;
  const bufSize = ctx.sampleRate * 0.06;
  const buf  = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++)
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 6);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.55, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
  src.connect(bp); bp.connect(gain); gain.connect(ctx.destination);
  src.start(); src.stop(ctx.currentTime + 0.08);
}

function playChime() {
  const ctx = audioCtx;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    osc.type   = 'sine'; osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t    = now + i * 0.08;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.6);
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE_W      = 68;
const TILE_H      = 84;
const BOX_MAX     = 4;
const CLEAR_DELAY = 1500;
const LS_KEY      = 'mahjong_best_times'; // localStorage key

// ── Session state ─────────────────────────────────────────────────────────────

let playerName    = '';
let activeTileCount = 84;  // total tiles in this game (from selector)

let boardTiles    = [];
let boxTiles      = [];
let selectedTile  = null;
let matchCount    = 0;
let score         = 0;

// Timer
let timerInterval = null;
let timerSeconds  = 0;
let timerRunning  = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const boardEl          = document.getElementById('board');
const tileBoxEl        = document.getElementById('tile-box');
const matchCountEl     = document.getElementById('match-count');
const scoreEl          = document.getElementById('score');
const playerDisplayEl  = document.getElementById('player-display');
const timerEl          = document.getElementById('timer');
const bestTimeEl       = document.getElementById('best-time-display');
const overlayEl        = document.getElementById('overlay');
const overlayMsg       = document.getElementById('overlay-msg');
const overlayBtn       = document.getElementById('overlay-btn');
const startScreenEl    = document.getElementById('start-screen');
const startBtn         = document.getElementById('start-btn');
const playerNameInput  = document.getElementById('player-name-input');
const tileCountSelect  = document.getElementById('tile-count-select');
const bestScoresPreview = document.getElementById('best-scores-preview');

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadBestTimes() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

function saveBestTime(name, tileCount, seconds) {
  const data = loadBestTimes();
  const key  = `${name}__${tileCount}`;
  if (!data[key] || seconds < data[key]) {
    data[key] = seconds;
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    return true; // new record
  }
  return false;
}

function getBestTime(name, tileCount) {
  const data = loadBestTimes();
  return data[`${name}__${tileCount}`] ?? null;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function updateBestTimeDisplay() {
  const best = getBestTime(playerName, activeTileCount);
  bestTimeEl.textContent = best !== null
    ? `🏆 ${playerName}'s best: ${formatTime(best)}`
    : '';
}

// ── Start screen ──────────────────────────────────────────────────────────────

function renderScoresPreview() {
  const data = loadBestTimes();
  const name = playerNameInput.value.trim() || null;
  const count = parseInt(tileCountSelect.value);
  const lines = [];
  // Show top 3 entries for the selected tile count
  Object.entries(data)
    .filter(([k]) => k.endsWith(`__${count}`))
    .map(([k, v]) => ({ name: k.replace(`__${count}`, ''), time: v }))
    .sort((a, b) => a.time - b.time)
    .slice(0, 5)
    .forEach((e, i) => lines.push(`${i + 1}. ${e.name} — ${formatTime(e.time)}`));
  bestScoresPreview.textContent = lines.length
    ? '🏆 Best times:\n' + lines.join('\n')
    : 'No records yet for this difficulty.';
}

playerNameInput.addEventListener('input', renderScoresPreview);
tileCountSelect.addEventListener('change', renderScoresPreview);

startBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) { playerNameInput.focus(); playerNameInput.style.borderColor = '#e53935'; return; }
  playerNameInput.style.borderColor = '';
  playerName      = name;
  activeTileCount = parseInt(tileCountSelect.value);
  startScreenEl.classList.add('hidden');
  init();
});

// Show start screen immediately; populate scores
renderScoresPreview();

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerInterval = setInterval(() => {
    timerSeconds++;
    timerEl.textContent = formatTime(timerSeconds);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
}

function resetTimer() {
  stopTimer();
  timerSeconds = 0;
  timerEl.textContent = '0:00';
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  boardTiles    = [];
  boxTiles      = [];
  selectedTile  = null;
  matchCount    = 0;
  score         = 0;

  resetTimer();

  matchCountEl.textContent = '0';
  scoreEl.textContent      = '0';
  playerDisplayEl.textContent = playerName ? `👤 ${playerName}` : '';
  overlayEl.classList.add('hidden');
  boardEl.innerHTML   = '';
  tileBoxEl.innerHTML = '';

  updateBestTimeDisplay();
  buildBoard();
}

// ── Mound layout ──────────────────────────────────────────────────────────────

function buildMoundSlots(total) {
  const N_MOUNDS  = 5;
  const MAX_LAYER = 4;

  // Distribute `total` tiles across mounds (each share even)
  const moundSizes = [];
  let remaining = total;
  for (let m = 0; m < N_MOUNDS; m++) {
    if (m === N_MOUNDS - 1) {
      // Last mound gets whatever is left; ensure even
      let last = remaining;
      if (last % 2 !== 0) last++;   // shouldn't happen but safety
      moundSizes.push(last);
    } else {
      let base  = Math.round(remaining / (N_MOUNDS - m));
      base = base % 2 === 0 ? base : base + 1;
      const nudge = (Math.floor(Math.random() * 3) - 1) * 2;
      let size = Math.max(2, Math.min(base + nudge, remaining - (N_MOUNDS - m - 1) * 2));
      size = size % 2 === 0 ? size : size + 1;
      moundSizes.push(size);
      remaining -= size;
    }
  }

  // Anchors are in board-content coordinates (0,0 = top-left of #board).
  // Keep them well inside a 500×520 canvas so jitter never pushes tiles negative.
  const anchors = [
    { x: 30,  y: 20  },
    { x: 300, y: 20  },
    { x: 160, y: 175 },
    { x: 30,  y: 335 },
    { x: 300, y: 335 },
  ];

  const BOARD_CONTENT_W = 500; // tiles will be clamped to this range
  const slots = [];

  moundSizes.forEach((size, mound) => {
    if (size <= 0) return;
    const { x: ax, y: ay } = anchors[mound];
    const layerCounts = pyramidSplit(size, MAX_LAYER + 1);

    let prevCx = ax, prevCy = ay;

    layerCounts.forEach((count, layer) => {
      if (count === 0) return;
      const cols   = Math.ceil(Math.sqrt(count));
      const rows   = Math.ceil(count / cols);
      const stepX  = TILE_W * 0.72;
      const stepY  = TILE_H * 0.65;
      const startX = prevCx - (cols - 1) * stepX / 2;
      const startY = prevCy - (rows - 1) * stepY / 2;

      // Most of this level's tiles sit flush edge-to-edge against a neighbor
      // (no gap, no jitter); the rest keep the looser overlapping/jittered
      // spacing for a bit of natural variety.
      const EDGE_RATIO = 0.7;
      const edgeCount  = Math.round(count * EDGE_RATIO);
      const edgeIdx    = new Set(
        shuffle(Array.from({ length: count }, (_, i) => i)).slice(0, edgeCount)
      );

      const grid = []; // grid[r][c] -> already-placed slot, for neighbor lookups
      let placed = 0;
      for (let r = 0; r < rows && placed < count; r++) {
        grid.push([]);
        for (let c = 0; c < cols && placed < count; c++) {
          const leftSlot  = c > 0 ? grid[r][c - 1]     : null;
          const aboveSlot = r > 0 ? grid[r - 1][c]     : null;
          let x, y;

          const slotIdx = slots.length; // index this slot will occupy once pushed
          const slot    = { x: 0, y: 0, layer, mound, idx: slotIdx };

          if (edgeIdx.has(placed) && (leftSlot || aboveSlot)) {
            if (leftSlot) {
              // Flush against the tile to its left — edge to edge, no gap.
              // Record the left/right relationship so we can later tell
              // which tiles end up flanked on both sides.
              x = leftSlot.x + TILE_W;
              y = leftSlot.y;
              slot.leftIdx     = leftSlot.idx;
              leftSlot.rightIdx = slotIdx;
            } else {
              // No left neighbor in this row — sit flush under the tile above.
              // (Vertical adjacency isn't a left/right relationship, so no
              // leftIdx/rightIdx is recorded here.)
              x = aboveSlot.x;
              y = aboveSlot.y + TILE_H;
            }
          } else {
            const rawX = startX + c * stepX + (Math.random() - 0.5) * 12;
            const rawY = startY + r * stepY + (Math.random() - 0.5) * 10;
            // Clamp so x >= 0 and tile never starts past right edge
            x = Math.max(0, Math.round(rawX));
            y = Math.max(0, Math.round(rawY));
          }

          slot.x = x;
          slot.y = y;
          slots.push(slot);
          grid[r][c] = slot;
          placed++;
        }
      }
      prevCx += (Math.random() - 0.5) * 8;
      prevCy += (Math.random() - 0.5) * 6;
    });
  });

  return slots;
}

function pyramidSplit(total, maxLayers) {
  const weights = Array.from({ length: maxLayers }, (_, i) => maxLayers - i);
  const wSum    = weights.reduce((a, b) => a + b, 0);
  const counts  = [];
  let assigned  = 0;
  for (let i = 0; i < maxLayers; i++) {
    if (assigned >= total) { counts.push(0); continue; }
    let c = Math.round((weights[i] / wSum) * total);
    c = c % 2 === 0 ? c : c + 1;
    c = Math.min(c, total - assigned);
    if (i === maxLayers - 1) c = total - assigned;
    c = c % 2 === 0 ? c : c + 1;
    counts.push(Math.max(0, c));
    assigned += c;
  }
  const diff = counts.reduce((a, b) => a + b, 0) - total;
  if (diff !== 0) counts[counts.length - 1] = Math.max(0, counts[counts.length - 1] - diff);
  return counts;
}

// ── Board build ───────────────────────────────────────────────────────────────

function buildBoard() {
  // Select a subset of tile types matching the chosen tile count
  const pairCount = activeTileCount / 2;
  const types     = shuffle([...TILE_TYPES]).slice(0, pairCount);
  const total     = types.length * 2;

  const slots = buildMoundSlots(total);

  // Safety pad
  while (slots.length < total) {
    const i = slots.length;
    slots.push({ x: (i % 8) * 44, y: 500 + Math.floor(i / 8) * 58, layer: 0, mound: 0 });
  }

  // Solvability-safe pairing: group slots by layer, pair within same layer
  const byLayer = {};
  slots.forEach((s, i) => {
    if (!byLayer[s.layer]) byLayer[s.layer] = [];
    byLayer[s.layer].push(i);
  });
  const layers = Object.keys(byLayer).map(Number).sort((a, b) => a - b);
  layers.forEach(l => shuffle(byLayer[l]));

  const slotPairs = [];
  let carry = null;
  layers.forEach(l => {
    const pool = byLayer[l];
    if (carry !== null) { slotPairs.push([carry, pool.shift()]); carry = null; }
    while (pool.length >= 2) slotPairs.push([pool.shift(), pool.shift()]);
    if (pool.length === 1) carry = pool.shift();
  });
  if (carry !== null) slotPairs.push([carry, carry]);

  const shuffledTypes = shuffle([...types]);
  boardTiles = [];
  const slotIndexToTile = [];
  shuffledTypes.forEach((type, i) => {
    const [idxA, idxB] = slotPairs[i];
    const tileA = { ...type, uid: `${type.id}_a`, ...slots[idxA], location: 'board' };
    const tileB = { ...type, uid: `${type.id}_b`, ...slots[idxB], location: 'board' };
    boardTiles.push(tileA, tileB);
    slotIndexToTile[idxA] = tileA;
    slotIndexToTile[idxB] = tileB;
  });

  // Resolve the left/right slot-index links recorded during layout into
  // actual tile references, so we can tell which tiles are flanked on both
  // sides (and therefore unclickable) once the game is running.
  boardTiles.forEach(t => {
    t.leftTile  = (t.leftIdx  != null) ? (slotIndexToTile[t.leftIdx]  || null) : null;
    t.rightTile = (t.rightIdx != null) ? (slotIndexToTile[t.rightIdx] || null) : null;
  });

  // ~10 % face-DOWN; prefer lower layers (most buried tiles)
  const faceDownCount = Math.max(2, Math.round(total * 0.1));
  // Ensure faceDownCount is even (pairs)
  const faceDownEven = faceDownCount % 2 === 0 ? faceDownCount : faceDownCount + 1;
  const sortedLow    = [...boardTiles].sort((a, b) => a.layer - b.layer);
  const faceDownUids = new Set(sortedLow.slice(0, faceDownEven).map(t => t.uid));

  // Size #board to exactly contain all tiles + shadow clearance (14px each side).
  // This makes #board-area's background always cover every tile.
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  boardTiles.forEach(t => {
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.x + TILE_W > maxX) maxX = t.x + TILE_W;
    if (t.y + TILE_H > maxY) maxY = t.y + TILE_H;
  });
  // Shift all tiles so the leftmost is at x=0, topmost at y=0
  if (minX > 0 || minY > 0) {
    boardTiles.forEach(t => { t.x -= minX; t.y -= minY; });
    maxX -= minX; maxY -= minY;
  }
  // Add shadow/depth clearance
  boardEl.style.width  = (maxX + 14) + 'px';
  boardEl.style.height = (maxY + 14) + 'px';

  // Render
  boardTiles.forEach(tile => {
    const el = makeTileElement(tile);
    tile.el  = el;
    el.style.left   = tile.x + 'px';
    el.style.top    = tile.y + 'px';
    el.style.zIndex = tile.layer * 20 + Math.floor((tile.x + tile.y) / 10);

    const isFaceDown = faceDownUids.has(tile.uid);
    tile.startedFaceUp = !isFaceDown; // remember original state

    if (!isFaceDown) {
      el.classList.add('flipped', 'permanent-face-up');
    }
    // face-down tiles have no extra classes — they show their back

    boardEl.appendChild(el);
  });

  refreshBuriedState();
  boardTiles.forEach(tile => attachTileEvents(tile));
}

// ── Buried / flanked state ──────────────────────────────────────────────────────

function refreshBuriedState() {
  const live    = boardTiles.filter(t => t.location === 'board');
  const liveSet = new Set(live);
  live.forEach(t => {
    const covered = live.some(other =>
      other !== t &&
      other.layer > t.layer &&
      rectsOverlap(t.x, t.y, TILE_W, TILE_H, other.x, other.y, TILE_W, TILE_H, 10)
    );
    t.el.classList.toggle('buried', covered);

    // Flanked: a same-level neighbor sitting edge-to-edge on BOTH the left
    // and right sides blocks the tile from being clicked, same as classic
    // mahjong solitaire's "open long side" rule. Once either neighbor is
    // cleared from the board, the tile opens up again.
    const hasLeft  = t.leftTile  && liveSet.has(t.leftTile);
    const hasRight = t.rightTile && liveSet.has(t.rightTile);
    t.el.classList.toggle('flanked', !!(hasLeft && hasRight));
  });
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh, margin) {
  return ax + margin < bx + bw &&
         ax + aw     > bx + margin &&
         ay + margin < by + bh &&
         ay + ah     > by + margin;
}

// ── Tile element factory ──────────────────────────────────────────────────────

const MOUND_COLORS = [
  { bg: 'linear-gradient(145deg,#7b3f9e 0%,#4a1a6e 55%,#2d0d45 100%)', border: '#b06fd4', shadow: '#1a0830' },
  { bg: 'linear-gradient(145deg,#c0392b 0%,#7d1a14 55%,#4a0e0b 100%)', border: '#e06050', shadow: '#2d0808' },
  { bg: 'linear-gradient(145deg,#1a6a8a 0%,#0d3d52 55%,#061e2a 100%)', border: '#3a9abf', shadow: '#03111a' },
  { bg: 'linear-gradient(145deg,#b8860b 0%,#7a5800 55%,#4a3400 100%)', border: '#e0b030', shadow: '#2a1a00' },
  { bg: 'linear-gradient(145deg,#1a5c34 0%,#0d3320 55%,#061a10 100%)', border: '#3a9a60', shadow: '#030f08' },
];

function makeTileElement(tile) {
  const div = document.createElement('div');
  div.className   = 'tile';
  div.dataset.uid = tile.uid;

  const inner = document.createElement('div');
  inner.className = 'tile-inner';

  const back = document.createElement('div');
  back.className = 'tile-back';
  const col = MOUND_COLORS[(tile.mound ?? 0) % MOUND_COLORS.length];
  back.style.background  = col.bg;
  back.style.borderColor = col.border;
  back.style.boxShadow   = `4px 4px 0 ${col.shadow}, 3px 3px 0 ${col.shadow}cc, 0 0 8px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.18)`;

  const front = document.createElement('div');
  front.className = 'tile-front';
  front.innerHTML = tile.svg;

  inner.appendChild(back);
  inner.appendChild(front);
  div.appendChild(inner);
  return div;
}

// ── Events ────────────────────────────────────────────────────────────────────
/*
 * Use native dblclick so single-click fires immediately with no delay.
 * We suppress the single-click handler when a dblclick is detected by
 * tracking a flag that dblclick sets before the second click's handler runs.
 */

function attachTileEvents(tile) {
  let suppressNext = false;

  tile.el.addEventListener('click', () => {
    if (tile.location !== 'board') return;
    startTimer();
    if (suppressNext) { suppressNext = false; return; }
    onSingleClick(tile);
  });

  tile.el.addEventListener('dblclick', () => {
    if (tile.location !== 'board') return;
    suppressNext = true; // suppress the click that fires after dblclick
    onDoubleClick(tile);
  });
}

// ── Single-click ──────────────────────────────────────────────────────────────

function onSingleClick(tile) {
  if (tile.location !== 'board') return;

  // If a matching tile is already waiting in the top box, this tile can go
  // straight there — no double-click needed.
  const boxMatch = boxTiles.find(t => t.id === tile.id);
  if (boxMatch) {
    if (selectedTile === tile) selectedTile = null;
    tile.el.classList.remove('selected');
    tile.el.classList.add('flipped');
    tile.location = 'flying';
    refreshBuriedState();
    setTimeout(() => { flyTileToBox(tile); }, 220);
    return;
  }

  const isFlipped = tile.el.classList.contains('flipped');

  // Permanently face-up tiles can still be used as the "first" or "second"
  // of a pair — they just can't be flipped BACK over.
  if (!isFlipped) {
    // Face-down tile: flip it up
    tile.el.classList.add('flipped');
  }

  if (!selectedTile) {
    tile.el.classList.add('selected');
    selectedTile = tile;
    return;
  }

  if (selectedTile === tile) {
    tile.el.classList.remove('selected');
    // Only flip back if it wasn't originally face-up
    if (!tile.startedFaceUp) tile.el.classList.remove('flipped');
    selectedTile = null;
    return;
  }

  const first  = selectedTile;
  const second = tile;
  first.el.classList.remove('selected');

  if (first.id === second.id) {
    selectedTile = null;
    // Mark just this pair as no longer clickable while they animate away —
    // the rest of the board stays fully interactive in the meantime.
    first.location  = 'flying';
    second.location = 'flying';
    refreshBuriedState();
    setTimeout(() => {
      flyTileToBox(first);
      flyTileToBox(second);
      score += 10;
      scoreEl.textContent = score;
    }, 350);
  } else {
    // No match: flip the first tile back down immediately (unless it started
    // face-up), and immediately select the newly-clicked tile — no lock/delay.
    if (!first.startedFaceUp) first.el.classList.remove('flipped');
    second.el.classList.add('selected');
    selectedTile = second;
  }
}

// ── Double-click ──────────────────────────────────────────────────────────────

function onDoubleClick(tile) {
  if (tile.location !== 'board') return;

  if (selectedTile && selectedTile !== tile) {
    const sel = selectedTile;
    sel.el.classList.remove('selected');
    if (!sel.startedFaceUp) sel.el.classList.remove('flipped');
    selectedTile = null;
  }
  if (selectedTile === tile) selectedTile = null;

  tile.el.classList.remove('selected');
  tile.el.classList.add('flipped');

  // Mark just this tile as no longer clickable while it animates away.
  tile.location = 'flying';
  refreshBuriedState();
  setTimeout(() => {
    flyTileToBox(tile);
  }, 220);
}

// ── Fly-to-box animation ──────────────────────────────────────────────────────

function flyTileToBox(tile) {
  const tileRect = tile.el.getBoundingClientRect();
  const destSlot = boxTiles.length;
  const boxRect  = tileBoxEl.getBoundingClientRect();
  const destX    = boxRect.left + 10 + destSlot * 72;
  const destY    = boxRect.top  + 11;

  const fly   = document.createElement('div');
  fly.className = 'fly-tile';
  fly.style.left = tileRect.left + 'px';
  fly.style.top  = tileRect.top  + 'px';

  const inner = document.createElement('div');
  inner.className = 'tile-inner';
  const back  = document.createElement('div');
  back.className  = 'tile-back';
  const col = MOUND_COLORS[(tile.mound ?? 0) % MOUND_COLORS.length];
  back.style.background  = col.bg;
  back.style.borderColor = col.border;
  back.style.boxShadow   = `3px 3px 0 ${col.shadow}`;
  const front = document.createElement('div');
  front.className = 'tile-front';
  front.innerHTML = tile.svg;
  inner.appendChild(back);
  inner.appendChild(front);
  fly.appendChild(inner);
  document.body.appendChild(fly);

  fly.style.setProperty('--fly-dx', (destX - tileRect.left) + 'px');
  fly.style.setProperty('--fly-dy', (destY - tileRect.top)  + 'px');

  playClick();

  requestAnimationFrame(() => fly.classList.add('flying'));

  fly.addEventListener('animationend', () => {
    fly.remove();
    addTileToBox(tile);
  }, { once: true });

  tile.location = 'box';
  tile.el.classList.remove('flipped', 'selected', 'permanent-face-up');
  tile.el.classList.add('matched');
  refreshBuriedState();
}

// ── Add to box ────────────────────────────────────────────────────────────────

function addTileToBox(tile) {
  const boxEl = makeTileElement(tile);
  boxEl.classList.add('flipped', 'box-entry');
  tile.boxEl = boxEl;
  boxTiles.push(tile);
  tileBoxEl.appendChild(boxEl);
  boxEl.addEventListener('animationend', () => boxEl.classList.remove('box-entry'), { once: true });
  checkBoxForMatches();
}

// ── Box match logic ───────────────────────────────────────────────────────────

function checkBoxForMatches() {
  const seen = {};
  let hasPending = false;
  for (const t of boxTiles) {
    if (t.pendingClear) { hasPending = true; continue; } // already scheduled — don't reschedule, don't let it block new pairs
    if (seen[t.id] !== undefined) { scheduleBoxClear(seen[t.id], t); return; }
    seen[t.id] = t;
  }
  if (boxTiles.length >= BOX_MAX && !hasPending) {
    stopTimer();
    showOverlay('😔 The box is full with no matching pair!\nYou must restart.', 'Restart');
    return;
  }
  checkWin();
}

function scheduleBoxClear(a, b) {
  a.pendingClear = true;
  b.pendingClear = true;
  [a, b].forEach(t => t.boxEl.classList.add('pair-glow'));
  setTimeout(() => clearBoxPair(a, b), CLEAR_DELAY);
}

function clearBoxPair(a, b) {
  playChime();
  [a, b].forEach(t => {
    t.boxEl.classList.remove('pair-glow');
    t.boxEl.classList.add('clearing');
    t.boxEl.addEventListener('animationend', () => t.boxEl.remove(), { once: true });
    t.location = 'gone';
  });
  boxTiles = boxTiles.filter(t => t !== a && t !== b);
  matchCount++;
  matchCountEl.textContent = matchCount;
  score += 20;
  scoreEl.textContent = score;
  setTimeout(() => { checkBoxForMatches(); }, 500);
}

// ── Win ───────────────────────────────────────────────────────────────────────

function checkWin() {
  if (!boardTiles.every(t => t.location === 'gone') || boxTiles.length !== 0) return;

  stopTimer();
  const elapsed   = timerSeconds;
  const isRecord  = saveBestTime(playerName, activeTileCount, elapsed);
  const pairCount = activeTileCount / 2;

  let msg = `🎉 You matched all ${pairCount} pairs!\nTime: ${formatTime(elapsed)}  ·  Score: ${score}`;
  if (isRecord) msg += '\n🏆 New personal best!';

  showOverlay(msg, 'Play Again');
  updateBestTimeDisplay();
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function showOverlay(msg, btnLabel) {
  overlayMsg.textContent = msg;
  overlayBtn.textContent = btnLabel;
  overlayEl.classList.remove('hidden');
}

overlayBtn.addEventListener('click', () => {
  overlayEl.classList.add('hidden');
  // Return to start screen so player can change settings
  startScreenEl.classList.remove('hidden');
  renderScoresPreview();
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
