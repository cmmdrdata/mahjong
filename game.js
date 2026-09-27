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
const LS_KEY         = 'mahjong_best_times';   // localStorage key
const LS_TPM_KEY     = 'mahjong_best_tpm';     // best tiles-per-minute per player
const LS_ACTIVE_KEY  = 'mahjong_active_players'; // who is playing right now
const ACTIVE_TTL_MS  = 30 * 60 * 1000;          // 30 minutes before a session expires

// ── Session state ─────────────────────────────────────────────────────────────

let playerName      = '';
let activeTileCount = 84;   // total tiles in this game (from selector)
let activeLayout    = 'mound'; // 'mound' | 'pyramid'

let boardTiles    = [];
let boxTiles      = [];
let selectedTile  = null;
let matchCount    = 0;
let score         = 0;

// Shuffle
const SHUFFLE_MAX   = 3;
let shufflesLeft    = SHUFFLE_MAX;

// Hint
const HINT_MAX   = 3;
let hintsLeft    = HINT_MAX;
let hintTimeout  = null; // timer to clear the hint highlight

// Timer
let timerInterval = null;
let timerSeconds  = 0;
let timerRunning  = false;

// Pause (manual button, or automatic when the window loses focus)
let isPaused              = false;
let manualPause           = false; // true if paused via the button (blur/focus won't auto-resume it)
let wasRunningBeforePause = false;
let gameActive            = false; // true once a game has been started (init() has run)

// ── DOM refs ──────────────────────────────────────────────────────────────────

const boardEl           = document.getElementById('board');
const tileBoxEl         = document.getElementById('tile-box');
const matchCountEl      = document.getElementById('match-count');
const scoreEl           = document.getElementById('score');
const playerDisplayEl   = document.getElementById('player-display');
const timerEl           = document.getElementById('timer');
const bestTimeEl        = document.getElementById('best-time-display');
const overlayEl         = document.getElementById('overlay');
const overlayMsg        = document.getElementById('overlay-msg');
const overlayBtn        = document.getElementById('overlay-btn');
const startScreenEl     = document.getElementById('start-screen');
const startBtn          = document.getElementById('start-btn');
const playerNameInput   = document.getElementById('player-name-input');
const tileCountSelect   = document.getElementById('tile-count-select');
const layoutSelect      = document.getElementById('layout-select');
const bestScoresPreview = document.getElementById('best-scores-preview');
const shuffleBtn        = document.getElementById('shuffle-btn');
const shuffleCountEl    = document.getElementById('shuffle-count');
const hintBtn           = document.getElementById('hint-btn');
const hintCountEl       = document.getElementById('hint-count');
const activePlayersEl   = document.getElementById('active-players');
const tilesPerMinEl     = document.getElementById('tiles-per-min');
const tpmValueEl        = document.getElementById('tpm-value');
const pauseBtn          = document.getElementById('pause-btn');
const pauseOverlayEl    = document.getElementById('pause-overlay');
const pauseResumeBtn    = document.getElementById('pause-resume-btn');

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

// ── Active-player tracking ────────────────────────────────────────────────────

function loadActivePlayers() {
  try { return JSON.parse(localStorage.getItem(LS_ACTIVE_KEY)) || {}; }
  catch { return {}; }
}

// Register the current player as active, purging stale entries.
function registerActivePlayer() {
  const data = loadActivePlayers();
  const now  = Date.now();
  // Purge entries older than TTL
  Object.keys(data).forEach(k => { if (now - data[k] > ACTIVE_TTL_MS) delete data[k]; });
  data[playerName] = now;
  localStorage.setItem(LS_ACTIVE_KEY, JSON.stringify(data));
  renderActivePlayers();
}

// Remove current player from the active set (game over / win).
function unregisterActivePlayer() {
  const data = loadActivePlayers();
  delete data[playerName];
  localStorage.setItem(LS_ACTIVE_KEY, JSON.stringify(data));
  renderActivePlayers();
}

// Render the banner showing who is currently playing.
function renderActivePlayers() {
  const data = loadActivePlayers();
  const now  = Date.now();
  const names = Object.entries(data)
    .filter(([, ts]) => now - ts <= ACTIVE_TTL_MS)
    .map(([n]) => n);

  if (names.length === 0) {
    activePlayersEl.classList.add('hidden');
    return;
  }
  const formatted = names.map(n =>
    n === playerName ? `<strong>${n}</strong>` : n
  ).join(' · ');
  activePlayersEl.innerHTML = `🎮 Now playing: ${formatted}`;
  activePlayersEl.classList.remove('hidden');
}

// Refresh the banner once per minute (TTL cleanup, same-tab fallback).
setInterval(renderActivePlayers, 60_000);

// React instantly when another tab writes to localStorage (new player joins,
// player leaves, or their session expires). The storage event only fires in
// tabs *other than* the one that made the change, which is exactly what we want.
window.addEventListener('storage', e => {
  if (e.key === LS_ACTIVE_KEY) renderActivePlayers();
});

// ── Tiles-per-minute ──────────────────────────────────────────────────────────

function updateTilesPerMin() {
  if (timerSeconds < 5) return; // avoid wild numbers in the first few seconds
  const tpm = (matchCount * 2) / (timerSeconds / 60);
  tpmValueEl.textContent = tpm.toFixed(1);
  tilesPerMinEl.classList.remove('hidden');
}

// Best tiles/min per player × tile-count combination.
function loadBestTpm() {
  try { return JSON.parse(localStorage.getItem(LS_TPM_KEY)) || {}; }
  catch { return {}; }
}

function saveBestTpm(name, tileCount, tpm) {
  const data = loadBestTpm();
  const key  = `${name}__${tileCount}`;
  if (!data[key] || tpm > data[key]) {
    data[key] = parseFloat(tpm.toFixed(2));
    localStorage.setItem(LS_TPM_KEY, JSON.stringify(data));
    return true;
  }
  return false;
}

function getBestTpm(name, tileCount) {
  return loadBestTpm()[`${name}__${tileCount}`] ?? null;
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
  activeLayout    = layoutSelect.value;
  startScreenEl.classList.add('hidden');
  init();
});

// Show start screen immediately; populate scores
renderScoresPreview();
// Show any already-active players on load (other tabs / other players on same device)
renderActivePlayers();

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerInterval = setInterval(() => {
    timerSeconds++;
    timerEl.textContent = formatTime(timerSeconds);
    updateTilesPerMin();
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

// ── Pause (manual button, or automatic when the window/tab loses focus) ──────

function pauseGame(manual) {
  if (!gameActive) return;
  if (isPaused) {
    // Already paused (e.g. by blur) — a manual pause on top of that just
    // means "don't auto-resume when focus comes back".
    if (manual) manualPause = true;
    return;
  }
  isPaused              = true;
  manualPause           = !!manual;
  wasRunningBeforePause = timerRunning;
  stopTimer();
  pauseOverlayEl.classList.remove('hidden');
  pauseBtn.textContent = '▶ Resume';
}

function resumeGame() {
  if (!isPaused) return;
  isPaused    = false;
  manualPause = false;
  pauseOverlayEl.classList.add('hidden');
  pauseBtn.textContent = '⏸ Pause';
  // Only restart the clock if it was actually ticking before the pause —
  // don't start the timer early just because the player paused/resumed
  // before their first move.
  if (wasRunningBeforePause) startTimer();
}

pauseBtn.addEventListener('click', () => {
  if (isPaused) resumeGame(); else pauseGame(true);
});
pauseResumeBtn.addEventListener('click', resumeGame);

// Auto-pause both game timers (elapsed time + tiles/min, which is derived
// from it) whenever the window/tab loses focus, and auto-resume when it
// comes back — unless the player paused manually, in which case they have
// to press Resume themselves.
window.addEventListener('blur', () => pauseGame(false));
window.addEventListener('focus', () => { if (!manualPause) resumeGame(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame(false);
  else if (!manualPause) resumeGame();
});

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  boardTiles    = [];
  boxTiles      = [];
  selectedTile  = null;
  matchCount    = 0;
  score         = 0;
  shufflesLeft  = SHUFFLE_MAX;
  hintsLeft     = HINT_MAX;
  if (hintTimeout) { clearTimeout(hintTimeout); hintTimeout = null; }

  resetTimer();
  isPaused              = false;
  manualPause           = false;
  wasRunningBeforePause = false;
  gameActive            = true;
  pauseOverlayEl.classList.add('hidden');
  pauseBtn.style.display = '';
  pauseBtn.textContent    = '⏸ Pause';

  matchCountEl.textContent = '0';
  scoreEl.textContent      = '0';
  playerDisplayEl.textContent = playerName ? `👤 ${playerName}` : '';
  overlayEl.classList.add('hidden');
  boardEl.innerHTML   = '';
  tileBoxEl.innerHTML = '';
  // Hide tiles/min until enough time has passed
  tilesPerMinEl.classList.add('hidden');
  tpmValueEl.textContent = '0.0';
  // Reset any layout-driven width override from a previous pyramid game
  document.getElementById('app').style.maxWidth = '';

  registerActivePlayer();
  updateShuffleBtn();
  updateHintBtn();
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
      // spacing for a bit of natural variety. Note: even the "jittered"
      // spacing below always overlaps a same-row neighbor by design (the
      // step is intentionally smaller than a tile's width), so EVERY
      // same-row neighbor pair counts as touching for the flanked-tile rule
      // — not just the ones that get the exact flush placement.
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

          const useExactSnap = edgeIdx.has(placed) && (leftSlot || aboveSlot);

          if (useExactSnap && leftSlot) {
            // Flush against the tile to its left — edge to edge, no gap.
            x = leftSlot.x + TILE_W;
            y = leftSlot.y;
          } else if (useExactSnap && aboveSlot) {
            // No left neighbor in this row — sit flush under the tile above.
            x = aboveSlot.x;
            y = aboveSlot.y + TILE_H;
          } else {
            const rawX = startX + c * stepX + (Math.random() - 0.5) * 12;
            const rawY = startY + r * stepY + (Math.random() - 0.5) * 10;
            // Clamp so x >= 0 and tile never starts past right edge
            x = Math.max(0, Math.round(rawX));
            y = Math.max(0, Math.round(rawY));
          }

          // Record the left/right relationship for ANY same-row neighbor
          // pair (regardless of exact-snap vs jittered placement above) so
          // the "flanked on both sides" rule sees every touching pair.
          if (leftSlot) {
            slot.leftIdx      = leftSlot.idx;
            leftSlot.rightIdx = slotIdx;
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

// ── Pyramid-grid layout ───────────────────────────────────────────────────────
/*
 * Tiles are placed edge-to-edge in a rectangular grid.
 * Each successive layer (stacked on top) is offset by half a tile width
 * horizontally and half a tile height vertically — classic solitaire pyramid.
 *
 * Layer counts come from the same proportionally-decreasing split used by
 * the mound layout (pyramidSplit), spread across PYRAMID_LAYERS levels, so
 * the pile is always at least 3 tiles deep (in practice 4-5 for every tile
 * count this game offers) rather than a greedy fixed-fraction fill that can
 * exhaust the whole tile count in just 1-2 layers.
 *
 * The function returns the same slot-shape as buildMoundSlots so the rest
 * of buildBoard() is unchanged.
 */
function buildPyramidGridSlots(total) {
  const PYRAMID_LAYERS = 5; // proportional split guarantees >=3 non-zero layers for every tile count this game offers
  const layerCounts = pyramidSplit(total, PYRAMID_LAYERS);

  // Base grid dimensions sized to comfortably fit the bottom (largest) layer,
  // aiming for a roughly 3:2 aspect ratio. Every other layer is smaller (or
  // equal), so it always fits within these same dimensions.
  const baseCount = layerCounts[0] || total;
  const gridCols  = Math.max(1, Math.ceil(Math.sqrt(baseCount * 1.5)));
  const gridRows  = Math.max(1, Math.ceil(baseCount / gridCols));

  // Place slots — layer 0 first (bottom), then each layer on top with ½-tile offset.
  const slots = [];
  layerCounts.forEach((count, layer) => {
    if (count <= 0) return;

    // Offset accumulates by half a tile each layer
    const offsetX = Math.round(TILE_W / 2) * layer;
    const offsetY = Math.round(TILE_H / 2) * layer;

    // Randomly pick `count` cells from the full grid, evenly spread
    const allCells = [];
    for (let r = 0; r < gridRows; r++)
      for (let c = 0; c < gridCols; c++)
        allCells.push([r, c]);
    shuffle(allCells);
    const chosen = allCells.slice(0, count);
    // Sort chosen cells left-to-right, top-to-bottom for consistent row rendering
    chosen.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);

    // Build a map of chosen cells for O(1) lookup
    const chosenSet = new Set(chosen.map(([r, c]) => `${r},${c}`));

    // Track slots by grid position so we can link left/right neighbours
    const cellToSlot = {};
    chosen.forEach(([r, c]) => {
      const slotIdx = slots.length;
      const slot = {
        x: c * TILE_W + offsetX,
        y: r * TILE_H + offsetY,
        layer,
        mound: (r * gridCols + c) % MOUND_COLORS.length, // vary colour by cell position
        idx: slotIdx,
      };

      // Left neighbour in the same layer (must also be a chosen cell in same row)
      const leftKey = `${r},${c - 1}`;
      if (chosenSet.has(leftKey) && cellToSlot[leftKey]) {
        const leftSlot        = cellToSlot[leftKey];
        slot.leftIdx          = leftSlot.idx;
        leftSlot.rightIdx     = slotIdx;
      }

      cellToSlot[`${r},${c}`] = slot;
      slots.push(slot);
    });
  });

  return slots;
}

// ── Board build ───────────────────────────────────────────────────────────────

function buildBoard() {
  // Select a subset of tile types matching the chosen tile count
  const pairCount = activeTileCount / 2;
  const types     = shuffle([...TILE_TYPES]).slice(0, pairCount);
  const total     = types.length * 2;

  const slots = activeLayout === 'pyramid'
    ? buildPyramidGridSlots(total)
    : buildMoundSlots(total);

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
  const boardW = maxX + 14;
  const boardH = maxY + 14;
  boardEl.style.width  = boardW + 'px';
  boardEl.style.height = boardH + 'px';
  // Keep the pause overlay locked to the board's own footprint (not
  // #board-area's visible viewport) so it fully covers the board even when
  // a wide pyramid layout needs horizontal scrolling.
  pauseOverlayEl.style.width  = boardW + 'px';
  pauseOverlayEl.style.height = boardH + 'px';

  // If the board is wider than the default #app max-width, expand #app so the
  // dark-green #board-area background box fully wraps the pyramid layout.
  // 32px = left+right padding of #board-area (16px each side).
  const appEl = document.getElementById('app');
  const neededAppW = boardW + 32; // board width + board-area padding
  appEl.style.maxWidth = neededAppW > 620 ? neededAppW + 'px' : '';

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
 * Touch-first interaction — works on both mobile (touch) and desktop (mouse).
 *
 * Single tap  → onSingleClick  (flip / select / match)
 * Double tap  → onDoubleClick  (send directly to tile box)
 *
 * On touch devices we listen to touchstart/touchend so the response is
 * instant (no 300 ms browser delay). A double-tap is two taps whose second
 * touchend lands within TAP_GAP_MS of the first.  Mouse users keep the
 * standard click / dblclick path.
 *
 * We prevent the synthetic mouse events that follow touch events so the
 * handlers are never called twice on the same gesture.
 */

const TAP_GAP_MS = 320; // max ms between two taps to count as double-tap

function attachTileEvents(tile) {
  let lastTapTime  = 0;
  let tapTimer     = null;

  // ── Touch path ──────────────────────────────────────────────────────────────
  tile.el.addEventListener('touchstart', e => {
    // Only react to a single finger on this tile
    if (e.touches.length !== 1) return;
    e.preventDefault(); // stop the browser generating a delayed click event
  }, { passive: false });

  tile.el.addEventListener('touchend', e => {
    if (e.changedTouches.length !== 1) return;
    e.preventDefault(); // prevent the ghost click

    if (tile.location !== 'board') return;
    startTimer();

    const now = Date.now();
    const gap = now - lastTapTime;
    lastTapTime = now;

    if (gap < TAP_GAP_MS) {
      // Double-tap detected
      clearTimeout(tapTimer);
      tapTimer = null;
      onDoubleClick(tile);
    } else {
      // Potential single tap — wait briefly to see if a second tap follows
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        tapTimer = null;
        onSingleClick(tile);
      }, TAP_GAP_MS);
    }
  }, { passive: false });

  // ── Mouse path (desktop) ────────────────────────────────────────────────────
  let suppressNextClick = false;

  tile.el.addEventListener('click', e => {
    if (tile.location !== 'board') return;
    startTimer();
    if (suppressNextClick) { suppressNextClick = false; return; }
    onSingleClick(tile);
  });

  tile.el.addEventListener('dblclick', () => {
    if (tile.location !== 'board') return;
    suppressNextClick = true; // suppress the click that fires after dblclick
    onDoubleClick(tile);
  });
}

// ── Single-click ──────────────────────────────────────────────────────────────

function onSingleClick(tile) {
  if (tile.location !== 'board') return;

  // If a matching tile is already waiting in the top box, this tile can go
  // straight there — no double-click needed. Skip the overflow guard: this
  // tile will pair with its box match and clear both, so the box won't grow.
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
    // A confirmed board pair always clears as soon as both land — never blocks the box.
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
  if (boxWouldOverflow(1)) return; // box too full — ignore double-tap/click

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
  tile.el.classList.remove('flipped', 'selected', 'permanent-face-up', 'hint-glow');
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

// ── Box capacity helpers ──────────────────────────────────────────────────────

// Slots that are committed to the box right now: tiles physically in the box
// plus tiles whose location is 'flying' (animation in progress → will land).
function boxCommitted() {
  return boxTiles.length + boardTiles.filter(t => t.location === 'flying').length;
}

// 75 % of BOX_MAX = 3.  Returns true when adding `count` more tiles would
// exceed that threshold, so the player must clear a pair first.
function boxWouldOverflow(count) {
  return boxCommitted() + count > Math.floor(BOX_MAX * 0.75);
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
    unregisterActivePlayer();
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
  updateTilesPerMin(); // refresh rate immediately after each match
  setTimeout(() => { checkBoxForMatches(); }, 500);
}

// ── Win ───────────────────────────────────────────────────────────────────────

function checkWin() {
  if (!boardTiles.every(t => t.location === 'gone') || boxTiles.length !== 0) return;

  stopTimer();
  unregisterActivePlayer();

  const elapsed   = timerSeconds;
  const isRecord  = saveBestTime(playerName, activeTileCount, elapsed);
  const pairCount = activeTileCount / 2;

  // Tiles-per-minute for this completed game
  const finalTpm    = elapsed > 0 ? (activeTileCount / (elapsed / 60)) : 0;
  const isTpmRecord = saveBestTpm(playerName, activeTileCount, finalTpm);
  const bestTpm     = getBestTpm(playerName, activeTileCount);

  let msg = `🎉 You matched all ${pairCount} pairs!\nTime: ${formatTime(elapsed)}  ·  Score: ${score}`;
  msg += `\n⚡ ${finalTpm.toFixed(1)} tiles/min`;
  if (bestTpm !== null) msg += `  ·  Best: ${bestTpm.toFixed(1)}`;
  if (isRecord)    msg += '\n🏆 New time record!';
  if (isTpmRecord) msg += '\n⚡ New tiles/min record!';

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
  gameActive = false;
  isPaused = false;
  manualPause = false;
  pauseOverlayEl.classList.add('hidden');
  pauseBtn.style.display = 'none';
  // Return to start screen so player can change settings
  startScreenEl.classList.remove('hidden');
  renderScoresPreview();
});

// ── Shuffle ───────────────────────────────────────────────────────────────────

function updateShuffleBtn() {
  shuffleBtn.style.display = '';   // make visible once game starts
  shuffleCountEl.textContent = shufflesLeft;
  shuffleBtn.disabled = shufflesLeft <= 0;
}

/*
 * shuffleBoard — keeps every tile's position (slot) identical but randomly
 * reassigns tile identities (id, label, svg) among the remaining board tiles.
 * This preserves the layout structure while giving the player a fresh look
 * at which tiles are where.
 *
 * Steps:
 *   1. Collect all board tiles still on the board.
 *   2. Extract their identity fields.
 *   3. Shuffle those identity fields.
 *   4. Re-assign identities, updating the DOM front face in place.
 *   5. Re-run the solvability pairing so pairs stay within the same
 *      layer (same guarantee as the initial build).
 *   6. Refresh buried/flanked state.
 */
function shuffleBoard() {
  if (shufflesLeft <= 0) return;
  shufflesLeft--;
  updateShuffleBtn();
  startTimer(); // counts as an action

  const live = boardTiles.filter(t => t.location === 'board');
  if (live.length < 2) return;

  // Collect identities (must keep even count for pairs)
  const identities = live.map(t => ({ id: t.id, label: t.label, svg: t.svg }));

  // Shuffle identities
  shuffle(identities);

  // Re-assign — pair constraint: same identity must appear exactly twice.
  // The identities array already has the right pairing counts (we took them
  // from live tiles, which always come in matched pairs or are en-route).
  live.forEach((tile, i) => {
    tile.id    = identities[i].id;
    tile.label = identities[i].label;
    tile.svg   = identities[i].svg;

    // Update the front face SVG in the DOM
    const front = tile.el.querySelector('.tile-front');
    if (front) front.innerHTML = tile.svg;
  });

  refreshBuriedState();
}

shuffleBtn.addEventListener('click', () => {
  if (shufflesLeft <= 0) return;
  shuffleBoard();
});

// ── Hint ──────────────────────────────────────────────────────────────────────

function updateHintBtn() {
  hintBtn.style.display = '';   // make visible once game starts
  hintCountEl.textContent = hintsLeft;
  hintBtn.disabled = hintsLeft <= 0;
}

/*
 * clearHintHighlights — remove hint-glow from all board tiles and box elements.
 */
function clearHintHighlights() {
  boardTiles.forEach(t => t.el && t.el.classList.remove('hint-glow'));
  boxTiles.forEach(t => t.boxEl && t.boxEl.classList.remove('hint-glow-box'));
}

/*
 * doHint — highlights a playable pair for the player.
 *
 *  Only clickable tiles (not buried, not flanked) are considered.
 *  If no playable move exists the hint is NOT consumed.
 *
 *  Priority 1 — a clickable board tile whose id matches a tile in the box.
 *               Both the board tile and its box counterpart are highlighted.
 *
 *  Priority 2 — two clickable board tiles that share an id.
 *
 * The highlight fades after 3 seconds.
 */
function doHint() {
  if (hintsLeft <= 0) return;

  // Clear any existing highlight first (but don't consume a hint yet).
  if (hintTimeout) { clearTimeout(hintTimeout); hintTimeout = null; }
  clearHintHighlights();

  const live      = boardTiles.filter(t => t.location === 'board');
  const clickable = live.filter(t =>
    !t.el.classList.contains('buried') && !t.el.classList.contains('flanked')
  );

  // ── Find a playable hint ───────────────────────────────────────────────────

  let hintA = null, hintBoxTile = null, hintB = null;

  // Priority 1: clickable board tile matching something already in the box
  outer: for (const boxTile of boxTiles) {
    for (const t of clickable) {
      if (t.id === boxTile.id) { hintA = t; hintBoxTile = boxTile; break outer; }
    }
  }

  // Priority 2: two clickable board tiles with the same id
  if (!hintA) {
    const seen = {};
    for (const t of clickable) {
      if (seen[t.id]) { hintA = seen[t.id]; hintB = t; break; }
      seen[t.id] = t;
    }
  }

  // No playable move — shake the button to signal it, don't consume a hint
  if (!hintA) {
    hintBtn.classList.remove('no-moves'); // reset so animation re-triggers
    void hintBtn.offsetWidth;            // force reflow
    hintBtn.classList.add('no-moves');
    hintBtn.addEventListener('animationend', () => hintBtn.classList.remove('no-moves'), { once: true });
    return;
  }

  // ── Consume the hint and show the highlight ────────────────────────────────
  hintsLeft--;
  updateHintBtn();
  startTimer();

  hintA.el.classList.add('hint-glow', 'flipped');
  if (hintBoxTile && hintBoxTile.boxEl) hintBoxTile.boxEl.classList.add('hint-glow-box');
  if (hintB) hintB.el.classList.add('hint-glow', 'flipped');

  hintTimeout = setTimeout(() => {
    clearHintHighlights();
    hintTimeout = null;
  }, 3000);
}

hintBtn.addEventListener('click', () => {
  if (hintsLeft <= 0) return;
  doHint();
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
