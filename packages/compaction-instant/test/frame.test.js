/**
 * Tests for the bitmap-frame archive.
 *
 * The archive is optional by design, so the properties that matter are the
 * ones that keep it from ever being worse than plain text: rendering must be
 * deterministic across platforms, the transcript must describe exactly what
 * the checkpoint gave up, and every failure path must return text.
 *
 * @module dsh-compaction-instant/test/frame
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_WIDTH,
  RASTER_SCALE,
  encodePng,
  frameCapacity,
  layoutTranscript,
  rasterize,
  reconstructElidedText,
  renderFrame,
  serializeElided
} from "../src/frame.js";
import {
  FRAME_MANIFEST_EVENT,
  buildManifest,
  findManifest,
  frameContentBlock,
  frameFallbackText,
  readManifests,
  recompileElidedFromLog,
  renderManifestFrame
} from "../src/frame-store.js";
import { resolveRecallReference } from "../src/recall.js";

/** A small, realistic elided set: tool rows plus one prose entry. */
const ELIDED = [
  { seq: 1, kind: "tool", text: '[assistant]\n* read "src/index.js" (seq 1)' },
  { seq: 2, kind: "tool", text: '[assistant]\n* bash "pnpm test" (seq 2)' },
  { seq: 3, kind: "text", text: "[assistant]\nThe refactor moved the parser into its own module." }
];

/** Frame metadata used by most cases. */
const META = { seqRange: [1, 3], checkpointIndex: 1 };

/**
 * Read a PNG's declared width and height from its IHDR chunk.
 * @param png - PNG bytes.
 * @returns `{ width, height }`.
 */
function pngSize(png) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// ── serialization ──────────────────────────────────────────────────────────

test("the transcript names the frame and states what it replaced", () => {
  const text = serializeElided(ELIDED, META);
  assert.match(text, /^@frame: checkpoint 1 seqs 1-3$/m);
  assert.match(text, /^@elided:3 entries/m);
});

test("tool rows render as @call lines and prose as @ai lines", () => {
  const text = serializeElided(ELIDED, META);
  assert.match(text, /@call: read "src\/index\.js"/);
  assert.match(text, /@ai: The refactor moved the parser/);
});

test("a repeated role header is emitted once, not once per entry", () => {
  // The compiler emits a header per entry; keeping every copy would spend half
  // the frame repeating one word.
  const text = serializeElided(ELIDED, META);
  assert.equal(text.split("[assistant]").length - 1, 1);
});

test("the transcript is ASCII so every glyph has a real shape", () => {
  // A non-ASCII marker can only be approximated by a 5x7 ASCII font and reads
  // as a wrong letter at small sizes.
  const text = serializeElided(ELIDED, META);
  assert.ok(/^[\x20-\x7e\n]*$/u.test(text), "transcript must be printable ASCII");
});

// ── layout ─────────────────────────────────────────────────────────────────

test("long rows wrap instead of being cut", () => {
  const { rows } = layoutTranscript("x".repeat(50), 10, 20);
  assert.equal(rows.length, 5);
  assert.equal(rows.join(""), "x".repeat(50));
});

test("overflow is reported and marked, never silently dropped", () => {
  const { rows, overflow } = layoutTranscript("a\nb\nc\nd\ne", 10, 3);
  assert.equal(rows.length, 3);
  assert.ok(overflow > 0);
  assert.match(rows[2], /frame full: \d+ more rows/);
});

test("capacity shrinks with the raster scale", () => {
  const one = frameCapacity(1280, 1920, 1);
  const two = frameCapacity(1280, 1920, 2);
  assert.ok(two.columns < one.columns, "a 2x raster fits fewer columns");
  assert.ok(two.rows < one.rows, "a 2x raster fits fewer rows");
});

// ── raster and encoding ────────────────────────────────────────────────────

test("rasterize is deterministic for identical input", () => {
  const a = rasterize(["hello"], 200, 40, 1);
  const b = rasterize(["hello"], 200, 40, 1);
  assert.deepEqual(Buffer.from(a.pixels), Buffer.from(b.pixels));
});

test("rendering a frame twice produces byte-identical PNGs", () => {
  // This is the property the cross-platform check depends on: pure arithmetic
  // over an embedded glyph table, with fixed deflate settings.
  const first = renderFrame(ELIDED, META).png;
  const second = renderFrame(ELIDED, META).png;
  assert.equal(first.length, second.length);
  assert.ok(first.equals(second), "two renders must be byte-identical");
});

test("the encoded frame is a valid grayscale PNG of the declared size", () => {
  const frame = renderFrame(ELIDED, META);
  assert.equal(frame.png.slice(0, 8).toString("hex"), "89504e470d0a1a0a");
  const size = pngSize(frame.png);
  assert.equal(size.width, DEFAULT_FRAME_WIDTH);
  assert.equal(size.height, DEFAULT_FRAME_HEIGHT);
  assert.match(frame.png.slice(12, 16).toString("ascii"), /IHDR/);
  assert.ok(frame.png.includes(Buffer.from("IEND", "ascii")));
});

test("scale changes ink coverage, not the text", () => {
  const one = renderFrame(ELIDED, META, { scale: 1 });
  const two = renderFrame(ELIDED, META, { scale: RASTER_SCALE });
  assert.equal(one.scale, 1);
  assert.equal(two.scale, RASTER_SCALE);
  assert.equal(serializeElided(ELIDED, META), serializeElided(ELIDED, META));
});

test("a frame with no elided entries still encodes cleanly", () => {
  const frame = renderFrame([], { seqRange: [0, 0], checkpointIndex: 1 });
  assert.equal(pngSize(frame.png).width, DEFAULT_FRAME_WIDTH);
});

// ── manifests ──────────────────────────────────────────────────────────────

test("a manifest records the span and count, not the content", () => {
  const manifest = buildManifest({ sessionId: "s1", seqRange: [4, 9], elided: ELIDED, checkpointIndex: 2 });
  assert.equal(manifest.id, "2");
  assert.deepEqual(manifest.seqRange, [4, 9]);
  assert.equal(manifest.entries, 3);
  assert.equal(manifest.rendered, false);
  assert.equal(manifest.locator, null);
});

test("manifests read back from a session log in order", () => {
  const session = {
    events: [
      { type: FRAME_MANIFEST_EVENT, data: { id: "1" } },
      { type: "user/message", data: {} },
      { type: FRAME_MANIFEST_EVENT, data: { id: "2" } }
    ]
  };
  assert.deepEqual(readManifests(session).map((entry) => entry.id), ["1", "2"]);
});

test("frame references accept ordinal, prefixed, and short forms", () => {
  const manifests = [{ id: "1" }, { id: "2" }];
  assert.equal(findManifest(manifests, "1").manifest.id, "1");
  assert.equal(findManifest(manifests, "frame 2").manifest.id, "2");
  assert.equal(findManifest(manifests, "f2").manifest.id, "2");
  assert.equal(findManifest(manifests, "(1)").manifest.id, "1");
});

test("a missing frame explains itself and names the alternative", () => {
  const missing = findManifest([], "3");
  assert.match(missing.error, /frame 3 not found/);
  assert.match(missing.error, /frames appear when a checkpoint elides entries/);
});

test("an invalid frame reference is rejected with the accepted forms", () => {
  const invalid = findManifest([], "nonsense");
  assert.match(invalid.error, /invalid frame reference/);
  assert.match(invalid.error, /frame 1/);
});

// ── recall integration ─────────────────────────────────────────────────────

test("recall resolves a frame reference without touching seq parsing", () => {
  const resolved = resolveRecallReference({ events: [] }, "frame", "f1");
  assert.equal(resolved.frame, "f1");
  assert.deepEqual(resolved.errors, []);
  assert.deepEqual(resolved.selections, []);
});

test("recall still rejects an unknown type and names frame as valid", () => {
  const resolved = resolveRecallReference({ events: [] }, "bogus", "1");
  assert.equal(resolved.selections.length, 0);
  assert.match(resolved.errors[0], /"frame"/);
});

// ── fallback paths ─────────────────────────────────────────────────────────

test("fallback text is the elided material verbatim", () => {
  const session = { events: [], deriveEventMessage: () => null };
  const manifest = buildManifest({ sessionId: "s", seqRange: [1, 3], elided: ELIDED, checkpointIndex: 1 });
  const result = frameFallbackText({ session, manifest, recompile: () => ELIDED });
  assert.match(result.text, /src\/index\.js/);
  assert.match(result.text, /the parser into its own module/);
});

test("fallback text is capped when a budget is given", () => {
  const session = { events: [], deriveEventMessage: () => null };
  const manifest = buildManifest({ sessionId: "s", seqRange: [1, 3], elided: ELIDED, checkpointIndex: 1 });
  const result = frameFallbackText({ session, manifest, recompile: () => ELIDED, maxTokens: 1 });
  assert.equal(result.truncated, true);
  assert.match(result.text, /truncated/);
});

test("an unreadable span degrades to a stated reason, not a throw", async () => {
  const session = { events: [], deriveEventMessage: () => null };
  const manifest = buildManifest({ sessionId: "s", seqRange: [1, 3], elided: ELIDED, checkpointIndex: 1 });
  const rendered = await renderManifestFrame({
    session,
    manifest,
    recompile: () => {
      throw new Error("log rotated");
    }
  });
  assert.equal(rendered.ok, false);
  assert.match(rendered.reason, /could not replay/);
});

test("an empty replay reports that the span is gone", async () => {
  const rendered = await renderManifestFrame({
    session: { events: [], deriveEventMessage: () => null },
    manifest: { id: "1", seqRange: [1, 3], checkpointIndex: 1 },
    recompile: () => []
  });
  assert.equal(rendered.ok, false);
  assert.match(rendered.reason, /no longer readable/);
});

test("a render succeeds without an attachment store", async () => {
  // Persisting is best effort: the caller still receives the image bytes.
  const rendered = await renderManifestFrame({
    session: { events: [], deriveEventMessage: () => null },
    manifest: buildManifest({ sessionId: "s", seqRange: [1, 3], elided: ELIDED, checkpointIndex: 1 }),
    recompile: () => ELIDED
  });
  assert.equal(rendered.ok, true);
  assert.equal(rendered.locator, null);
  assert.ok(rendered.frame.png.length > 0);
});

test("a failing attachment store does not fail the frame", async () => {
  const rendered = await renderManifestFrame({
    session: { events: [], deriveEventMessage: () => null },
    manifest: buildManifest({ sessionId: "s", seqRange: [1, 3], elided: ELIDED, checkpointIndex: 1 }),
    recompile: () => ELIDED,
    attachments: {
      saveImages: async () => {
        throw new Error("quota exceeded");
      }
    }
  });
  assert.equal(rendered.ok, true);
  assert.equal(rendered.locator, null);
});

test("the content block is an image block carrying the PNG", () => {
  const frame = renderFrame(ELIDED, META);
  const block = frameContentBlock(frame);
  assert.equal(block.type, "image");
  assert.equal(block.mimeType, "image/png");
  assert.ok(block.data.equals(frame.png));
});

// ── log replay ─────────────────────────────────────────────────────────────

test("recompile reads only the requested span from the log", () => {
  const events = [
    { seq: 1, type: "user/message", data: { role: "user" } },
    { seq: 2, type: "user/message", data: { role: "user" } },
    { seq: 3, type: "user/message", data: { role: "user" } }
  ];
  const session = { events, deriveEventMessage: (event) => ({ role: "assistant", content: [{ type: "text", text: `body ${event.seq}` }] }) };
  const entries = recompileElidedFromLog(session, [2, 3]);
  assert.deepEqual(entries.map((entry) => entry.seq), [2, 3]);
  assert.match(entries[0].text, /body 2/);
});

test("recompile tolerates a session without events", () => {
  assert.deepEqual(recompileElidedFromLog({}, [1, 2]), []);
  assert.deepEqual(recompileElidedFromLog({ events: [] }, undefined), []);
});

test("reconstructElidedText returns the entries with their span", () => {
  const result = reconstructElidedText(ELIDED, META);
  assert.match(result.text, /elided seqs 1-3, 3 entries/);
  assert.match(result.text, /src\/index\.js/);
  assert.equal(result.truncated, false);
});
