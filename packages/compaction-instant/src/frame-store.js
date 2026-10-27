/**
 * Frame archive bookkeeping for `dsh-compaction-instant`.
 *
 * The archive is lazy: compaction records a manifest of what it elided, and a
 * frame is only rendered the first time someone asks for it. Three properties
 * make that safe to do without extra storage:
 *
 *   - The durable session log is append-only, so the elided entries are still
 *     there when the frame is finally requested. Rendering recompiles from the
 *     log rather than from anything held in memory.
 *   - Manifests live in that same log, so replay reconstructs them and a frame
 *     reference keeps its meaning across restarts and forks.
 *   - Nothing here touches context. A frame becomes an image block only when a
 *     caller asks for it through recall.
 *
 * @module dsh-compaction-instant/frame-store
 */

import { reconstructElidedText, renderFrame } from "./frame.js";
import { projectMessageText } from "./recall.js";

/** Session log event type carrying one frame manifest. */
export const FRAME_MANIFEST_EVENT = "compaction/frame-manifest";

/** How many manifests one session keeps before the oldest collapses to a marker. */
export const MAX_MANIFESTS = 8;

/**
 * Build the manifest recorded at compaction time.
 *
 * Deliberately small: counts, the seq range, and a stable ordinal. The bytes
 * cost is negligible next to the checkpoint it describes.
 *
 * @param input - `{ sessionId, seqRange, elided, checkpointIndex }`.
 * @returns the manifest object to append.
 */
export function buildManifest(input) {
  const { sessionId, seqRange, elided, checkpointIndex } = input;
  return {
    id: `${checkpointIndex ?? 0}`,
    sessionId,
    seqRange,
    checkpointIndex,
    entries: elided.length,
    tokens: elided.reduce((total, entry) => total + String(entry.text ?? "").length, 0),
    rendered: false,
    locator: null
  };
}

/**
 * Read every frame manifest from one session's durable log, newest last.
 *
 * @param session - session-shaped value with a `events` iterable.
 * @returns manifests in log order.
 */
export function readManifests(session) {
  const events = session?.events;
  if (events === undefined || events === null) return [];
  const manifests = [];
  for (const event of events) {
    if (event?.type !== FRAME_MANIFEST_EVENT) continue;
    manifests.push(event.data);
  }
  return manifests;
}

/**
 * Find one manifest by its recall reference.
 *
 * Accepts the frame ordinal (`1`, `frame 1`, `f1`) so the vocabulary matches
 * the `[checkpoint N]` marker the checkpoint already prints.
 *
 * @param manifests - manifests in log order.
 * @param reference - caller-supplied reference text.
 * @returns `{ manifest }` or `{ error }` with a stable message.
 */
export function findManifest(manifests, reference) {
  const raw = String(reference ?? "").trim().replace(/^\((.*)\)$/u, "$1").trim();
  const token = raw.replace(/^frame\s+/iu, "").replace(/^f(\d+)$/iu, "$1");
  const match = /^(\d+)$/u.exec(token);
  if (match === null) {
    return { error: `invalid frame reference "${reference}" (expected an ordinal like "1", "frame 1", or "f1")` };
  }
  const index = Number(match[1]);
  const manifest = manifests.find((entry) => entry.id === String(index));
  if (manifest === undefined) {
    return {
      error: `frame ${index} not found (this session has ${manifests.length} frame(s)${manifests.length === 0 ? "; frames appear when a checkpoint elides entries" : ""})`
    };
  }
  return { manifest };
}

/**
 * Recompile one manifest's elided entries from the durable log.
 *
 * The caller supplies a `recompile` function that reproduces the compiler's
 * view of a seq range, so this module stays free of sessions, cordis and the
 * engine's selection logic.
 *
 * @param session - session-shaped value.
 * @param manifest - manifest to reconstruct.
 * @param recompile - `(session, seqRange) => elided entries`.
 * @returns the elided entries.
 */
export function replayElided(session, manifest, recompile) {
  return recompile(session, manifest.seqRange);
}

/**
 * Rebuild the elided entries of one span directly from the durable log.
 *
 * The engine records the seq range, not the entries, so a frame needs no
 * in-memory state and survives a restart. Projection reuses the recall path's
 * own text renderer, which means a frame shows the same content recall would
 * return for those seqs rather than a second, divergent reading of the log.
 *
 * @param session - session-shaped value with `events` and `deriveEventMessage`.
 * @param seqRange - inclusive `[start, end]` of the elided span.
 * @returns elided entries as `{ seq, kind, text }`, in log order.
 */
export function recompileElidedFromLog(session, seqRange) {
  const events = session?.events;
  if (events === undefined || events === null || !Array.isArray(seqRange)) return [];
  const [start, end] = seqRange;
  const entries = [];
  for (const event of events) {
    if (typeof event?.seq !== "number" || event.seq < start || event.seq > end) continue;
    const message = typeof session.deriveEventMessage === "function" ? session.deriveEventMessage(event) : null;
    if (message === null || message === undefined) continue;
    const text = projectMessageText(message);
    if (text.length === 0) continue;
    entries.push({ seq: event.seq, kind: message.role === "assistant" ? "text" : "text", text });
  }
  return entries;
}

/**
 * Render a frame for one manifest, or return the reason it cannot be rendered.
 *
 * Rendering is attempted exactly once per request and never cached beyond the
 * attachment store, so a failure leaves no half-written state: the manifest
 * stays `rendered: false` and callers fall back to text.
 *
 * @param options - `{ session, manifest, recompile, attachments, saveImages }`.
 * @returns `{ ok: true, frame, locator }` or `{ ok: false, reason }`.
 */
export async function renderManifestFrame(options) {
  const { manifest, recompile, session, attachments, saveImages } = options;
  let elided;
  try {
    elided = replayElided(session, manifest, recompile);
  } catch (cause) {
    return { ok: false, reason: `could not replay the elided span: ${String(cause?.message ?? cause)}` };
  }
  if (elided.length === 0) {
    return { ok: false, reason: "the elided entries are no longer readable from the session log" };
  }
  let frame;
  try {
    frame = renderFrame(elided, { seqRange: manifest.seqRange, checkpointIndex: manifest.checkpointIndex });
  } catch (cause) {
    return { ok: false, reason: `frame rendering failed: ${String(cause?.message ?? cause)}` };
  }
  const locator = await persistFrame({ attachments, saveImages, manifest, frame });
  return { ok: true, frame, locator, elided };
}

/**
 * Persist a rendered frame through the attachment store when one is available.
 *
 * Persisting is best effort: a frame is useful even when its bytes cannot be
 * stored, because the caller receives the image directly. A failure here is
 * reported through a null locator, never thrown.
 *
 * The wire shape is the store's, not ours: `data` must be base64 and the type
 * field is `mediaType`. A reference comes back content-addressed, so the
 * locator is the digest the object is stored under.
 *
 * @param options - `{ attachments, saveImages, manifest, frame }`.
 * @returns a locator string, or null when nothing was persisted.
 */
async function persistFrame(options) {
  const { attachments, saveImages, manifest, frame } = options;
  const save = saveImages ?? attachments?.saveImages?.bind(attachments);
  if (typeof save !== "function") return null;
  try {
    const saved = await save([
      {
        data: frame.png.toString("base64"),
        mediaType: "image/png",
        name: `frame-${manifest.id}.png`
      }
    ]);
    const first = Array.isArray(saved) ? saved[0] : saved;
    return referenceLocator(first);
  } catch {
    return null;
  }
}

/**
 * Derive a stable locator from one attachment reference.
 *
 * The local store returns a content-addressed reference whose digest is the
 * only value guaranteed across implementations, so that is preferred and any
 * host path is only a fallback.
 *
 * @param ref - attachment reference, or undefined.
 * @returns locator string, or null.
 */
function referenceLocator(ref) {
  if (ref === undefined || ref === null) return null;
  if (typeof ref === "string") return ref;
  for (const key of ["sha256", "digest", "path", "locator", "id"]) {
    if (typeof ref[key] === "string") return ref[key];
  }
  const nested = ref.ref ?? ref.reference;
  if (nested !== undefined && nested !== ref) return referenceLocator(nested);
  return null;
}

/**
 * Produce the text an unreadable frame stands in for.
 *
 * This is the safety net the design rests on: a frame is always optional, and
 * this returns the elided material verbatim whenever the image cannot be used.
 *
 * @param options - `{ session, manifest, recompile, maxTokens }`.
 * @returns `{ text, truncated }`.
 */
export function frameFallbackText(options) {
  const { manifest, recompile, session, maxTokens } = options;
  try {
    const elided = replayElided(session, manifest, recompile);
    return reconstructElidedText(elided, { seqRange: manifest.seqRange }, maxTokens ?? Infinity);
  } catch (cause) {
    return { text: `[frame ${manifest.id} could not be read: ${String(cause?.message ?? cause)}]`, truncated: false };
  }
}

/**
 * Wrap a frame image as a DSH content block.
 *
 * Kept here rather than in the recall module so the block shape is defined in
 * one place, next to the encoder that produced the bytes.
 *
 * @param frame - rendered frame from {@link renderManifestFrame}.
 * @returns an `image` content block.
 */
export function frameContentBlock(frame) {
  return { type: "image", data: frame.png, mimeType: "image/png" };
}
