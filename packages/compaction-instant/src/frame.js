/**
 * Dense bitmap-frame archive for `dsh-compaction-instant`.
 *
 * The text checkpoint is the source of truth and stays searchable. This module
 * archives the one thing the checkpoint deliberately gives up: the entries the
 * cap passes removed. They are serialized into a compact transcript and drawn
 * with a fixed pixel font into a PNG, so a dense fallback exists for detail
 * that text no longer carries.
 *
 * Design constraints, all deliberate:
 *
 *   - Deterministic. The raster is pure arithmetic over an embedded glyph
 *     table, so the same input yields byte-identical PNG output on macOS and
 *     Windows. A test asserts exactly that; a font library or a native
 *     rasterizer would break it.
 *   - Dependency-free. No image codec, no font file, no native binary: the PNG
 *     is written by the small encoder at the end of this file. That keeps the
 *     plugin installable anywhere the harness runs.
 *   - Additive. Frames never replace text, so a misread glyph or an offloaded
 *     frame costs a reconstruction, never the record.
 *
 * @module dsh-compaction-instant/frame
 */

import { deflateSync } from "node:zlib";

// ── glyph table ────────────────────────────────────────────────────────────

/** Glyph cell width in pixels. */
export const GLYPH_WIDTH = 6;
/** Glyph cell height in pixels. */
export const GLYPH_HEIGHT = 8;
/** Horizontal advance between glyph origins, including inter-character gap. */
export const GLYPH_ADVANCE = 7;
/** Vertical advance between text baselines. */
export const LINE_HEIGHT = 11;
/** Inner margin on all four sides of the frame, in pixels. */
export const FRAME_MARGIN = 12;

/**
 * 5x7 bitmap font, one glyph per printable ASCII code from space (32) to
 * tilde (126). Each glyph is seven rows of five bits, written as strings for
 * reviewability; a set bit is ink. Anything outside the range renders as `?`
 * so an unmapped character is visible rather than silently blank.
 */
const GLYPH_ROWS = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  '"': ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "'": ["00100", "00100", "00100", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "*": ["00000", "00100", "10101", "01110", "10101", "00100", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "\\": ["10000", "01000", "01000", "00100", "00010", "00010", "00001"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "`": ["01000", "00100", "00000", "00000", "00000", "00000", "00000"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10000", "10000", "10001", "01110"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11100", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10001", "10001"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "11110", "10000", "10000"],
  q: ["00000", "00000", "01101", "10011", "01111", "00001", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11100", "01000", "01000", "01001", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10001", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "{": ["00010", "00100", "00100", "01000", "00100", "00100", "00010"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "}": ["01000", "00100", "00100", "00010", "00100", "00100", "01000"],
  "~": ["00000", "00000", "01000", "10101", "00010", "00000", "00000"]
};

/** The glyph rendered for a character with no mapping. */
const FALLBACK_GLYPH = GLYPH_ROWS["?"];

/**
 * Bitmap for one character, as rows of 5 booleans.
 * @param char - single character.
 * @returns array of 7 rows, each 5 entries.
 */
function glyphFor(char) {
  const rows = GLYPH_ROWS[char] ?? FALLBACK_GLYPH;
  return rows.map((row) => Array.from(row, (bit) => bit === "1"));
}

// ── transcript serialization ───────────────────────────────────────────────

/**
 * Serialize elided entries into the compact transcript the frame carries.
 *
 * The section vocabulary follows upstream snapcompact, but the marker is ASCII
 * `@` instead of `¶`: the frame is drawn with a 5x7 ASCII pixel font, where a
 * U+00B6 glyph can only be approximated and reads as a wrong letter at small
 * sizes. `@call:` carries the same meaning and is always legible. The FILES
 * section is deliberately omitted, because this engine does not track file
 * reads and writes and inventing it would be a claim the archive cannot make.
 *
 * @param elided - dropped entries from `compileRegion`, each `{ seq, text, kind }`.
 * @param meta - frame context: `{ sessionId, seqRange, checkpointIndex }`.
 * @returns the transcript text, one line per logical row.
 */
export function serializeElided(elided, meta) {
  const lines = [];
  const range = meta.seqRange === undefined ? "" : ` seqs ${meta.seqRange[0]}-${meta.seqRange[1]}`;
  const ordinal = meta.checkpointIndex === undefined ? "" : ` checkpoint ${meta.checkpointIndex}`;
  lines.push(`@frame:${ordinal}${range}`);
  lines.push(`@elided:${elided.length} entries (the text checkpoint dropped these)`);
  lines.push("");
  let previousKind;
  /** Role header currently in effect, so consecutive repeats are skipped. */
  let lastRole;
  for (const entry of elided) {
    const text = String(entry.text ?? "");
    // Classify by the rendered role header so the transcript reads like the
    // conversation it came from rather than like a raw dump.
    const kind = entry.kind ?? "text";
    const isTool = kind === "tool" || kind === "result" || text.includes("* ");
    if (isTool) {
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        if (trimmed.startsWith("[")) {
          // Same collapse as the text branch: the compiler emits a role header
          // per entry, and repeating it would spend half the frame on one word.
          const role = trimmed.slice(1, -1);
          if (role === lastRole) continue;
          lastRole = role;
          lines.push(trimmed);
          continue;
        }
        lines.push(trimmed.startsWith("* ") ? `@call: ${trimmed.slice(2)}` : `  ${trimmed}`);
      }
      previousKind = "tool";
      continue;
    }
    const label = kind === "reasoning" ? "@think:" : kind === "checkpoint" ? "@ai:" : kind === "media" ? "@img:" : "@ai:";
    for (const line of text.split("\n")) {
      const trimmed = line.replace(/\s+$/u, "");
      if (trimmed === "") continue;
      if (trimmed.startsWith("[")) {
        // A role header only earns a row when the role actually changes: the
        // compiler emits one per entry, which would spend half the frame
        // repeating the same label.
        const role = trimmed.slice(1, -1);
        if (role === lastRole) continue;
        lastRole = role;
        lines.push(trimmed);
        continue;
      }
      lines.push(`${label} ${trimmed}`);
    }
    previousKind = kind;
  }
  return lines.join("\n");
}

// ── layout ─────────────────────────────────────────────────────────────────

/**
 * Wrap one transcript line to the frame's usable width.
 *
 * Breaking is by character, not by word, because the transcript contains
 * paths, ids and log fragments where a word boundary is meaningless and a
 * dropped suffix would misrepresent the content.
 *
 * @param line - source line.
 * @param columns - characters per row.
 * @returns wrapped rows.
 */
function wrapLine(line, columns) {
  if (line.length <= columns) return [line];
  const rows = [];
  for (let index = 0; index < line.length; index += columns) rows.push(line.slice(index, index + columns));
  return rows;
}

/**
 * Lay out transcript rows and report whether every row fits.
 *
 * @param text - serialized transcript.
 * @param columns - characters per row.
 * @param rows - available rows.
 * @returns `{ rows, overflow }` where `rows` holds the fitted rows (with a
 *   trailing notice when content did not fit) and `overflow` is the number of
 *   rows that could not be placed.
 */
export function layoutTranscript(text, columns, rows) {
  const wrapped = [];
  for (const line of text.split("\n")) for (const row of wrapLine(line, columns)) wrapped.push(row);
  if (wrapped.length <= rows) return { rows: wrapped, overflow: 0 };
  const kept = wrapped.slice(0, Math.max(0, rows - 1));
  const dropped = wrapped.length - kept.length;
  kept.push(`[frame full: ${dropped} more rows, recall the seqs for exact text]`);
  return { rows: kept, overflow: dropped };
}

/**
 * Column and row capacity of one frame at a given size.
 * @param width - frame width in pixels.
 * @param height - frame height in pixels.
 * @returns `{ columns, rows }`.
 */
export function frameCapacity(width, height, scale = RASTER_SCALE) {
  const step = Math.max(1, Math.floor(scale));
  const usableWidth = width - FRAME_MARGIN * step * 2;
  const usableHeight = height - FRAME_MARGIN * step * 2;
  return {
    columns: Math.max(1, Math.floor(usableWidth / (GLYPH_ADVANCE * step))),
    rows: Math.max(1, Math.floor(usableHeight / (LINE_HEIGHT * step)))
  };
}

// ── raster ─────────────────────────────────────────────────────────────────

/**
 * Rasterize rows of text into a monochrome 8-bit buffer.
 *
 * Ink is black (0x00) on white (0xFF); the buffer is one byte per pixel, which
 * the PNG encoder packs into single-channel scanlines.
 *
 * `scale` multiplies every metric, so the same number of characters occupies a
 * proportionally larger canvas. That matters because a vision pipeline
 * downscales the frame before the model sees it: a 1px stroke survives the
 * downscale only as grey mush, while a 2x render keeps the glyph shapes after
 * the same reduction. The layout grid is unchanged, so scale costs image bytes
 * but no text capacity.
 *
 * @param rows - text rows to draw.
 * @param width - frame width in pixels.
 * @param height - frame height in pixels.
 * @param scale - integer pixel multiplier (1 or 2).
 * @returns `{ pixels, width, height, scale }`.
 */
export function rasterize(rows, width, height, scale = RASTER_SCALE) {
  const step = Math.max(1, Math.floor(scale));
  const pixels = new Uint8Array(width * height).fill(0xff);
  const plot = (x, y) => {
    for (let dy = 0; dy < step; dy += 1) {
      const py = y + dy;
      if (py < 0 || py >= height) continue;
      for (let dx = 0; dx < step; dx += 1) {
        const px = x + dx;
        if (px < 0 || px >= width) continue;
        pixels[py * width + px] = 0x00;
      }
    }
  };
  const margin = FRAME_MARGIN * step;
  const lineHeight = LINE_HEIGHT * step;
  const advance = GLYPH_ADVANCE * step;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const originY = margin + rowIndex * lineHeight;
    if (originY + GLYPH_HEIGHT * step > height - margin) break;
    const row = rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const originX = margin + columnIndex * advance;
      if (originX + GLYPH_WIDTH * step > width - margin) break;
      const glyph = glyphFor(row[columnIndex]);
      for (let gy = 0; gy < glyph.length; gy += 1) {
        const line = glyph[gy];
        for (let gx = 0; gx < line.length; gx += 1) {
          if (line[gx]) plot(originX + gx * step, originY + gy * step);
        }
      }
    }
  }
  return { pixels, width, height, scale: step };
}

// ── PNG encoding ───────────────────────────────────────────────────────────

/** PNG signature, the same eight bytes in every file. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC-32 lookup table, built once from the standard polynomial. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * CRC-32 of a buffer, as required by every PNG chunk.
 * @param buffer - chunk payload.
 * @returns unsigned 32-bit checksum.
 */
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Build one PNG chunk: length, type, payload, CRC over type and payload.
 * @param type - four-character chunk type.
 * @param payload - chunk body.
 * @returns the encoded chunk.
 */
function pngChunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const typeAndPayload = Buffer.concat([Buffer.from(type, "ascii"), payload]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndPayload), 0);
  return Buffer.concat([length, typeAndPayload, checksum]);
}

/**
 * Encode a pixel buffer as a grayscale PNG.
 *
 * Compression level is fixed and the filter type is always 0, so identical
 * pixels always produce identical bytes. That determinism is what lets the
 * cross-platform test compare frames byte for byte.
 *
 * @param image - `{ pixels, width, height }` from {@link rasterize}.
 * @returns PNG file bytes.
 */
export function encodePng(image) {
  const { pixels, width, height } = image;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // colour type: grayscale
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace
  // Each scanline is prefixed with its filter byte (0 = None).
  const stride = width + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width, width).copy(raw, y * stride + 1);
  }
  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

// ── frame assembly ─────────────────────────────────────────────────────────

/** Default pixel multiplier for the raster (see {@link rasterize}). */
export const RASTER_SCALE = 2;
/** Default frame geometry: portrait, 2:3, rendered at {@link RASTER_SCALE}. */
export const DEFAULT_FRAME_WIDTH = 1280;
export const DEFAULT_FRAME_HEIGHT = 1920;

/**
 * Render one frame for a set of elided entries.
 *
 * @param elided - dropped entries from `compileRegion`.
 * @param meta - frame context: `{ seqRange, checkpointIndex }`.
 * @param options - `{ width, height, shape }`; defaults are used when absent.
 * @returns `{ png, text, rows, overflow, width, height, shape }`.
 */
export function renderFrame(elided, meta, options = {}) {
  const width = options.width ?? DEFAULT_FRAME_WIDTH;
  const height = options.height ?? DEFAULT_FRAME_HEIGHT;
  const scale = options.scale ?? RASTER_SCALE;
  const text = serializeElided(elided, meta);
  const capacity = frameCapacity(width, height, scale);
  const laid = layoutTranscript(text, capacity.columns, capacity.rows);
  const png = encodePng(rasterize(laid.rows, width, height, scale));
  return {
    png,
    text,
    rows: laid.rows.length,
    overflow: laid.overflow,
    width,
    height,
    scale,
    shape: options.shape ?? "11on16-bw"
  };
}

/**
 * Reconstruct the plain text a frame covers.
 *
 * This is the fallback that makes the archive safe: when the routed model
 * cannot read images, or a frame was offloaded, the caller still gets the
 * elided material verbatim rather than a reference to an unreadable image.
 *
 * @param elided - dropped entries from `compileRegion`.
 * @param meta - frame context.
 * @param maxTokens - cap on reconstructed tokens (`Infinity` for no cap).
 * @returns `{ text, truncated }`.
 */
export function reconstructElidedText(elided, meta, maxTokens = Infinity) {
  const header = meta?.seqRange === undefined ? "" : `[elided seqs ${meta.seqRange[0]}-${meta.seqRange[1]}, ${elided.length} entries]\n`;
  const body = elided.map((entry) => String(entry.text ?? "")).join("\n");
  const combined = header + body;
  if (combined.length <= maxTokens * 4) return { text: combined, truncated: false };
  return { text: `${combined.slice(0, Math.max(0, maxTokens * 4))}\n...[truncated]`, truncated: true };
}
