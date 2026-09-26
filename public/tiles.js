/**
 * tiles.js  — SVG artwork for every mahjong tile type.
 *
 * Each tile definition:
 *   { id: string, label: string, svg: string (inner SVG content) }
 *
 * Tiles come in matched pairs (×2 each).
 * Total unique types = 42  → 84 tiles on the board (divisible by 2).
 *
 * Categories based on standard mahjong + screenshots:
 *   • Characters  (一…九 with 萬)
 *   • Bamboo      (一…九 bamboo sticks)
 *   • Circles     (一…九 coin circles)
 *   • Winds       (東 南 西 北)
 *   • Dragons     (中 發 白)
 *   • Zodiac      (12 signs)
 *   • Animals     (Horse 馬, Sheep 羊, Snake 蛇, Rooster 雞, Crab 蟹, Ox 牛)
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function svgWrap(inner) {
  return `<svg viewBox="0 0 60 74" xmlns="http://www.w3.org/2000/svg"
    style="font-family:serif">${inner}</svg>`;
}

// Tile border decoration (shared)
const border = `<rect x="3" y="3" width="54" height="68" rx="6" ry="6"
  fill="none" stroke="#8a7a60" stroke-width="1.5"/>`;

// ── Character tiles (萬 / Characters) ────────────────────────────────────────

const charKanji = ['一','二','三','四','五','六','七','八','九'];
const charColor = ['#c0392b','#c0392b','#c0392b','#2471a3','#2471a3',
                   '#2471a3','#1e8449','#1e8449','#1e8449'];

function charSVG(n) {
  const kanji = charKanji[n - 1];
  const col   = charColor[n - 1];
  return svgWrap(`${border}
    <text x="30" y="36" text-anchor="middle" dominant-baseline="middle"
      font-size="28" font-weight="bold" fill="${col}">${kanji}</text>
    <text x="30" y="62" text-anchor="middle" dominant-baseline="middle"
      font-size="13" fill="#555">萬</text>`);
}

// ── Bamboo tiles ──────────────────────────────────────────────────────────────

// Stick height 13px (6.5 above/below center) fits comfortably in the 14px
// row gap used by the 6–9 tile layouts (rows at y=22/36/50, gap=14).
function bambooStick(x, y, color = '#27ae60') {
  return `<rect x="${x-3}" y="${y-6}" width="6" height="13" rx="3"
    fill="${color}" stroke="#1a7a42" stroke-width="0.5"/>`;
}

function bambooSVG(n) {
  // 3-row layouts use y=18/35/52 (row gap=17 > stick height 13 → 4px clear gap).
  const positions = {
    1: [[30, 36]],
    2: [[22, 36],[38, 36]],
    3: [[22, 36],[30, 36],[38, 36]],
    4: [[22, 27],[38, 27],[22, 47],[38, 47]],
    5: [[22, 27],[38, 27],[30, 37],[22, 47],[38, 47]],
    6: [[22, 18],[38, 18],[22, 35],[38, 35],[22, 52],[38, 52]],
    7: [[22, 18],[30, 18],[38, 18],[22, 35],[38, 35],[22, 52],[38, 52]],
    8: [[19, 18],[30, 18],[41, 18],[19, 35],[41, 35],[19, 52],[30, 52],[41, 52]],
    9: [[19, 18],[30, 18],[41, 18],[19, 35],[30, 35],[41, 35],[19, 52],[30, 52],[41, 52]],
  };
  const cols = ['#27ae60','#1abc9c','#2ecc71','#16a085'];
  const sticks = (positions[n] || []).map(([x, y], i) =>
    bambooStick(x, y, cols[i % cols.length])).join('');
  return svgWrap(`${border}${sticks}
    <text x="30" y="65" text-anchor="middle" font-size="9" fill="#555">竹${charKanji[n-1]}</text>`);
}

// ── Circle tiles ──────────────────────────────────────────────────────────────

// Five vivid dot colours cycling per position index.
const DOT_COLORS = ['#1565c0','#c0392b','#1e8449','#e67e22','#8e44ad'];

function circleSVG(n) {
  // r=4 (diameter 8) with 13px column spacing → 5px gap between edges.
  // 3-row layouts: rows at y=19/33/47 (gap=14 > diameter 8 → 6px clear).
  const positions = {
    1: [[30, 36]],
    2: [[23, 36],[37, 36]],
    3: [[23, 36],[30, 36],[37, 36]],
    4: [[23, 27],[37, 27],[23, 46],[37, 46]],
    5: [[23, 27],[37, 27],[30, 36],[23, 46],[37, 46]],
    6: [[23, 19],[37, 19],[23, 33],[37, 33],[23, 47],[37, 47]],
    7: [[23, 19],[30, 19],[37, 19],[23, 33],[37, 33],[23, 47],[37, 47]],
    8: [[17, 19],[30, 19],[43, 19],[17, 33],[43, 33],[17, 47],[30, 47],[43, 47]],
    9: [[17, 19],[30, 19],[43, 19],[17, 33],[30, 33],[43, 33],[17, 47],[30, 47],[43, 47]],
  };
  const dots = (positions[n] || []).map(([x, y], i) => {
    const c = DOT_COLORS[i % DOT_COLORS.length];
    return `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="${c}" stroke-width="1.5"/>
            <circle cx="${x}" cy="${y}" r="2" fill="${c}"/>`;
  }).join('');
  return svgWrap(`${border}${dots}
    <text x="30" y="65" text-anchor="middle" font-size="9" fill="#555">筒${charKanji[n-1]}</text>`);
}

// ── Wind tiles ────────────────────────────────────────────────────────────────

function windSVG(kanji, color) {
  return svgWrap(`${border}
    <text x="30" y="40" text-anchor="middle" dominant-baseline="middle"
      font-size="32" font-weight="bold" fill="${color}">${kanji}</text>`);
}

// ── Dragon tiles ──────────────────────────────────────────────────────────────

function dragonSVG(kanji, fillColor, strokeColor) {
  return svgWrap(`${border}
    <text x="30" y="40" text-anchor="middle" dominant-baseline="middle"
      font-size="30" font-weight="bold"
      fill="${fillColor}" stroke="${strokeColor}" stroke-width="1">${kanji}</text>`);
}

// Blank dragon (Haku 白板)
function hakuSVG() {
  return svgWrap(`${border}
    <rect x="14" y="14" width="32" height="46" rx="4" fill="none"
      stroke="#c0392b" stroke-width="2.5"/>`);
}

// ── Zodiac tiles ──────────────────────────────────────────────────────────────

function zodiacSVG(symbol, label, color) {
  return svgWrap(`${border}
    <text x="30" y="33" text-anchor="middle" dominant-baseline="middle"
      font-size="26">${symbol}</text>
    <text x="30" y="57" text-anchor="middle" dominant-baseline="middle"
      font-size="11" fill="${color}" font-weight="bold">${label}</text>`);
}

// ── Animal tiles ──────────────────────────────────────────────────────────────

function animalSVG(emoji, label, color) {
  return svgWrap(`${border}
    <text x="30" y="33" text-anchor="middle" dominant-baseline="middle"
      font-size="26">${emoji}</text>
    <text x="30" y="57" text-anchor="middle" dominant-baseline="middle"
      font-size="11" fill="${color}" font-weight="bold">${label}</text>`);
}

// ── Master tile list ──────────────────────────────────────────────────────────

const TILE_TYPES = [
  // Characters 1-9
  ...Array.from({length: 9}, (_, i) => ({
    id: `char${i+1}`,
    label: `${charKanji[i]}萬`,
    svg: charSVG(i + 1),
  })),

  // Bamboo 1-9
  ...Array.from({length: 9}, (_, i) => ({
    id: `bam${i+1}`,
    label: `竹${charKanji[i]}`,
    svg: bambooSVG(i + 1),
  })),

  // Circles 1-9
  ...Array.from({length: 9}, (_, i) => ({
    id: `cir${i+1}`,
    label: `筒${charKanji[i]}`,
    svg: circleSVG(i + 1),
  })),

  // Winds
  { id: 'wind_e', label: '東', svg: windSVG('東', '#1a6e2e') },
  { id: 'wind_s', label: '南', svg: windSVG('南', '#c0392b') },
  { id: 'wind_w', label: '西', svg: windSVG('西', '#2471a3') },
  { id: 'wind_n', label: '北', svg: windSVG('北', '#555') },

  // Dragons
  { id: 'chun',   label: '中', svg: dragonSVG('中', '#c0392b', '#8b0000') },
  { id: 'hatsu',  label: '發', svg: dragonSVG('發', '#1e8449', '#0a4d1f') },
  { id: 'haku',   label: '白', svg: hakuSVG() },

  // Zodiac (12)
  { id: 'aries',       label: '牡羊', svg: zodiacSVG('♈', 'Aries',       '#c0392b') },
  { id: 'taurus',      label: '金牛', svg: zodiacSVG('♉', 'Taurus',      '#1e8449') },
  { id: 'gemini',      label: '雙子', svg: zodiacSVG('♊', 'Gemini',      '#f39c12') },
  { id: 'cancer',      label: '巨蟹', svg: zodiacSVG('♋', 'Cancer',      '#2471a3') },
  { id: 'leo',         label: '獅子', svg: zodiacSVG('♌', 'Leo',         '#e67e22') },
  { id: 'virgo',       label: '處女', svg: zodiacSVG('♍', 'Virgo',       '#8e44ad') },
  { id: 'libra',       label: '天秤', svg: zodiacSVG('♎', 'Libra',       '#1abc9c') },
  { id: 'scorpio',     label: '天蠍', svg: zodiacSVG('♏', 'Scorpio',     '#c0392b') },
  { id: 'sagittarius', label: '射手', svg: zodiacSVG('♐', 'Sagittarius', '#e74c3c') },
  { id: 'capricorn',   label: '摩羯', svg: zodiacSVG('♑', 'Capricorn',   '#27ae60') },
  { id: 'aquarius',    label: '水瓶', svg: zodiacSVG('♒', 'Aquarius',    '#2980b9') },
  { id: 'pisces',      label: '雙魚', svg: zodiacSVG('♓', 'Pisces',      '#8e44ad') },

  // Animals (6, seen in screenshots)
  { id: 'horse',   label: '馬', svg: animalSVG('🐴', '馬', '#795548') },
  { id: 'sheep',   label: '羊', svg: animalSVG('🐑', '羊', '#90a4ae') },
  { id: 'snake',   label: '蛇', svg: animalSVG('🐍', '蛇', '#388e3c') },
  { id: 'rooster', label: '雞', svg: animalSVG('🐓', '雞', '#e53935') },
  { id: 'crab',    label: '蟹', svg: animalSVG('🦀', '蟹', '#e53935') },
  { id: 'ox',      label: '牛', svg: animalSVG('🐂', '牛', '#5d4037') },
];
