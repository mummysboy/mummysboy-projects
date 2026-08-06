// Minimal QR Code encoder — byte mode, error-correction level M, versions 1–10
// (up to 213 bytes of payload). Written from the spec rather than pulled in as a
// dependency, so the hub stays buildless and zero-dependency; it exists only to
// draw the desktop "scan to install" code (see scripts/gig-qr.js).
//
// Output is an <svg> string: a light plate with dark modules, sized in module
// units via viewBox so the caller controls the pixel size in CSS.

/* ---- GF(256) arithmetic (primitive polynomial 0x11D) ---------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x = x << 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// Generator polynomial for n error-correction codewords, highest degree first.
function genPoly(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

// Reed–Solomon remainder: the n EC codewords for one data block.
function ecCodewords(data, n) {
  const g = genPoly(n);
  const rem = data.concat(new Array(n).fill(0));
  for (let i = 0; i < data.length; i++) {
    const f = rem[i];
    if (f === 0) continue;
    for (let j = 0; j < g.length; j++) rem[i + j] ^= mul(g[j], f);
  }
  return rem.slice(data.length);
}

/* ---- Version tables (level M only) ---------------------------------- */

// EC codewords per block, indexed by version.
const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
// Block layout: [[blockCount, dataCodewordsPerBlock], …].
const BLOCKS = [
  null,
  [[1, 16]],
  [[1, 28]],
  [[1, 44]],
  [[2, 32]],
  [[2, 43]],
  [[4, 27]],
  [[4, 31]],
  [[2, 38], [2, 39]],
  [[3, 36], [2, 37]],
  [[4, 43], [1, 44]],
];
// Alignment-pattern centre coordinates (rows == columns).
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const MAX_VERSION = 10;

const dataCapacity = (v) => BLOCKS[v].reduce((sum, [count, len]) => sum + count * len, 0);

/* ---- Encoding -------------------------------------------------------- */

function toBytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

// Mode indicator + character count + payload + terminator + pad, as codewords.
function buildCodewords(bytes, version) {
  const countBits = version < 10 ? 8 : 16;
  const bits = [];
  const push = (value, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);

  const capacityBits = dataCapacity(version) * 8;
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  for (let pad = 0xec; codewords.length < dataCapacity(version); pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

// Split into blocks, append EC, then interleave both halves per the spec.
function interleave(codewords, version) {
  const ecLen = EC_PER_BLOCK[version];
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (const [count, len] of BLOCKS[version]) {
    for (let i = 0; i < count; i++) {
      const block = codewords.slice(offset, offset + len);
      offset += len;
      dataBlocks.push(block);
      ecBlocks.push(ecCodewords(block, ecLen));
    }
  }

  const out = [];
  const longest = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

/* ---- Matrix ---------------------------------------------------------- */

// 15-bit format information: level M (0b00) + mask, BCH(15,5), masked with 0x5412.
function formatBits(mask) {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

// 18-bit version information (versions 7+ only): BCH(18,6).
function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function maskAt(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function buildMatrix(version, codewords) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  const fixed = Array.from({ length: size }, () => new Uint8Array(size)); // function patterns
  const set = (row, col, dark) => {
    modules[row][col] = dark ? 1 : 0;
    fixed[row][col] = 1;
  };

  // Finder patterns (with their separators): a 9×9 stamp clipped to the matrix.
  for (const [fr, fc] of [[3, 3], [3, size - 4], [size - 4, 3]]) {
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        const r = fr + dr;
        const c = fc + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const dist = Math.max(Math.abs(dr), Math.abs(dc));
        set(r, c, dist !== 2 && dist !== 4);
      }
    }
  }

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    if (!fixed[6][i]) set(6, i, i % 2 === 0);
    if (!fixed[i][6]) set(i, 6, i % 2 === 0);
  }

  // Alignment patterns — skipped where they would collide with a finder.
  const centres = ALIGN[version];
  for (const r of centres) {
    for (const c of centres) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // Reserve the format-info strips (real bits are written after masking).
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      set(8, i, false);
      set(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    set(8, size - 1 - i, false);
    set(size - 1 - i, 8, false);
  }
  set(size - 8, 8, true); // always-dark module

  // Version information (7+): two 6×3 blocks beside the lower-left and upper-right finders.
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(b, a, dark);
      set(a, b, dark);
    }
  }

  // Payload, snaking upward/downward through two-module-wide columns.
  let bit = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (fixed[row][col] || bit >= totalBits) continue;
        modules[row][col] = (codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1;
        bit++;
      }
    }
  }

  return { size, modules, fixed };
}

// Rule 1–4 penalties from the spec; the lowest-scoring mask wins.
function penalty(modules, size) {
  let score = 0;

  const line = (get) => {
    let run = 1;
    let dark = get(0);
    let bits = [];
    for (let i = 0; i < size; i++) bits.push(get(i));
    for (let i = 1; i < size; i++) {
      if (bits[i] === dark) {
        run++;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        dark = bits[i];
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);

    // Rule 3: finder-like 1:1:3:1:1 pattern with four light modules on either side.
    const s = bits.join("");
    for (const pat of ["10111010000", "00001011101"]) {
      let from = s.indexOf(pat);
      while (from !== -1) {
        score += 40;
        from = s.indexOf(pat, from + 1);
      }
    }
  };

  for (let r = 0; r < size; r++) line((i) => modules[r][i]);
  for (let c = 0; c < size; c++) line((i) => modules[i][c]);

  // Rule 2: every 2×2 block of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
    }
  }

  // Rule 4: deviation of the dark-module ratio from 50%, in 5% steps. The step is
  // ceil(|pct - 50| / 5) - 1, so a ratio sitting exactly on a multiple of 5 scores 0.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += modules[r][c];
  const percent = (dark * 100) / (size * size);
  score += Math.max(0, Math.ceil(Math.abs(percent - 50) / 5) - 1) * 10;

  return score;
}

function writeFormat(modules, size, mask) {
  const bits = formatBits(mask);
  const at = (i) => ((bits >>> i) & 1) === 1 ? 1 : 0;
  for (let i = 0; i <= 5; i++) modules[i][8] = at(i);
  modules[7][8] = at(6);
  modules[8][8] = at(7);
  modules[8][7] = at(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = at(i);
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = at(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = at(i);
  modules[size - 8][8] = 1;
}

/**
 * Encode text as a QR matrix.
 * @param {string} text
 * @returns {{ size: number, modules: Uint8Array[] }} 1 = dark module
 */
export function qrMatrix(text) {
  const bytes = toBytes(text);
  let version = 0;
  for (let v = 1; v <= MAX_VERSION; v++) {
    const headerBits = 4 + (v < 10 ? 8 : 16);
    if (headerBits + bytes.length * 8 <= dataCapacity(v) * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new RangeError("qr: payload too long");

  const codewords = interleave(buildCodewords(bytes, version), version);
  const { size, modules, fixed } = buildMatrix(version, codewords);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = modules.map((row) => Uint8Array.from(row));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!fixed[r][c] && maskAt(mask, r, c)) candidate[r][c] ^= 1;
      }
    }
    writeFormat(candidate, size, mask);
    const score = penalty(candidate, size);
    if (!best || score < best.score) best = { score, modules: candidate };
  }

  return { size, modules: best.modules };
}

/**
 * Encode text as a standalone SVG string (dark modules on a light plate).
 * `size` is written as width/height attributes so the code has an intrinsic
 * size — a stale or missing stylesheet can't blow it up to the container width.
 * @param {string} text
 * @param {{ size?: number, quiet?: number, dark?: string, light?: string, label?: string }} [opts]
 * @returns {string}
 */
export function qrSvg(text, opts = {}) {
  const { size: px = 0, quiet = 2, dark = "#0b0b0d", light = "#ffffff", label = "" } = opts;
  const { size, modules } = qrMatrix(text);
  const total = size + quiet * 2;

  // One path, horizontal runs merged — keeps the markup small.
  let path = "";
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!modules[r][c]) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < size && modules[r][c + run]) run++;
      path += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run;
    }
  }

  const naming = label ? ` role="img" aria-label="${label.replace(/[<>&"]/g, "")}"` : ' aria-hidden="true"';
  const dims = px ? ` width="${px}" height="${px}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${dims} viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"${naming}>` +
    `<rect width="${total}" height="${total}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}"/>` +
    `</svg>`
  );
}
