import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  utf8Bytes, estTokens, fmtInt,
  argsToString, dedupeFingerprint, nearDiff,
  buildCandidate, buildNotice, effectiveMinBytes
} from './compress.js'

/*!
 * dsh-plugin-save-token v2.4.1 — Host half (node)
 *
 * Standard Cordis plugin loaded from the bundle layer declared in
 * cordis.patch.yml (`dsh plugin --profile web add <pkg>`). Contract:
 *
 * - `inject = ['tools', 'webServer']` — the dsh-tools registry for the
 *   `save_token_expand` dynamic tool, and the web server surface for the
 *   package-private JSON API consumed by the client dashboard.
 * - `spillStore` and `compaction` are read lazily with ctx.get() and both are
 *   optional at runtime: missing spillStore keeps compression permanently off
 *   (reversibility first), missing compaction only disables the pressure
 *   assist.
 * - Waterfalls: `tools/post-execute` (prepend), `llm/stream`, and
 *   `agent/pre-step`.
 *
 * v2.2.0 changes (all pure-compression logic moved to ./compress.js for unit
 * testing; behavior fixes marked):
 * - dedupe keys carry the owning session id (cross-session stubs were false)
 *   and hash the FULL args/content strings (prefix truncation could claim
 *   byte-identity for different outputs);
 * - `save_token_expand` output is exempt from both arms: re-compressing an
 *   expand result handed the model the same elided preview it just paid a
 *   turn to unfold;
 * - lossless counters increment on ADOPTED candidates (previously counted
 *   attempts the never-worse gates later rejected);
 * - the compression trigger floor also respects the saving/keepRatio
 *   arithmetic (outputs that cannot save minSavingBytes at keepRatioMax are
 *   skipped without building a candidate);
 * - the first `noticeFullTrailerCount` notices are verbose; later ones use a
 *   compact trailer with the same id/locator (fewer replayed tokens, both
 *   recovery channels intact);
 * - lossless TOON routes extended: nested field groups, keyed maps, deep
 *   dominant-array search, JSONL/NDJSON, and a lossless-vs-lossy price
 *   comparison; lossy notices disclose what was elided.
 *
 * v2.3.0 changes (cache-aware layer; bench evidence: 88.9% of input tokens
 * ride the provider prompt cache, billed at ~1/30 of the miss price):
 * - compaction assist now defaults OFF and is repositioned as an
 *   anti-overflow measure: rewriting history converts cheap cached replay
 *   into full-price input (break-even ~60 requests on a 120k->40k
 *   summarization), so it must never be sold as a saver;
 * - the watermark prefers the last REAL billed input for the session over
 *   the heuristic estimate, and scales with the model context window
 *   (contextWindowTokens x compactWatermarkRatio) when known;
 * - cacheRead/cacheWrite are metered separately and surfaced as a cache-hit
 *   sentinel KPI (any change that tanks it is saving tokens while raising
 *   real cost);
 * - per-model online calibration (EMA of billed/estimated tokens) corrects
 *   the avoided-token accounting without bundling a tokenizer.
 *
 * v2.4.0 changes:
 * - dedupe TTL default raised 90s -> 600s (fingerprints are full-length and
 *   byte-exact, so an identical replay carries no new information; the stub
 *   already tells the model to re-run when freshness matters) with
 *   per-tool overrides (`dedupeTtlOverrides`, 0 disables dedupe for a tool);
 * - error-line protection in plain-text windows widened to ±1 context line;
 * - `save_token_expand` survives restarts/eviction via a persistent
 *   id->locator index: on a miss it hands back the spill locator (and tries
 *   a spillStore readText API when one exists) instead of a dead end;
 * - top-level vs nested tool calls are counted (dashboard) to measure the
 *   unexploited subagent surface before the nesting exemption is ever
 *   touched.
 */
var name = "save-token";
var inject = ["tools", "webServer"];
function apply(ctx, config) {
  var cfg = {
    compressEnabled: true,
    dedupeEnabled: true,
    minBytes: 1400,
    errorMinBytes: 6e3,
    minSavingBytes: 500,
    keepRatioMax: 0.72,
    maxLines: 240,
    headLines: 140,
    tailLines: 80,
    tabularHeadRows: 60,
    tabularTailRows: 40,
    tabularStrideSamples: 50,
    longLineChars: 420,
    jsonMaxParseBytes: 524288,
    jsonlMinLines: 8,
    noticeFullTrailerCount: 3,
    dedupeTtlMs: 6e5,
    dedupeTtlOverrides: {},
    // Near-duplicate dedupe: catches "same tool, same content, small delta",
    // which byte-exact fingerprints cannot see.
    nearDedupeEnabled: true,
    nearDedupeMaxChangeRatio: 0.25,
    nearDedupeMinBytes: 2000,
    compactAssistEnabled: false,
    compactBudgetTokens: 12e4,
    compactCooldownMs: 6e5,
    contextWindowTokens: 0,
    compactWatermarkRatio: 0.85
  };
  if (config && typeof config === "object") {
    for (var ck in cfg) {
      if (Object.prototype.hasOwnProperty.call(config, ck) && config[ck] !== void 0) cfg[ck] = config[ck];
    }
  }
  var startedAt = Date.now();
  var totals = { requests: 0, auxRequests: 0, inputTokens: 0, cachedTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, avoidedTokens: 0, estPromptTokens: 0 };
  var comp = { count: 0, bytesBefore: 0, bytesAfter: 0, dedupeHits: 0, dedupeSavedBytes: 0, replays: 0, losslessEncodes: 0, tabularWindows: 0, topLevelCalls: 0, nestedCalls: 0 };
  var compactStats = { attempts: 0, done: 0, skipped: 0 };
  var sessionTotals = /* @__PURE__ */ new Map();
  function findParentSessionId(key) {
    try {
      const sessions = ctx.get ? ctx.get("sessions") : ctx.sessions;
      let sess = sessions?.get?.(key);
      if (!sess && key.startsWith("session-")) sess = sessions?.get?.(key.slice(8));
      if (!sess && !key.startsWith("session-")) sess = sessions?.get?.(`session-${key}`);
      if (sess?.header?.parentSession) return String(sess.header.parentSession);
    } catch {}
    try {
      const agents = ctx.get ? ctx.get("agents") : ctx.agents;
      let ag = agents?.get?.(key);
      if (!ag && key.startsWith("session-")) ag = agents?.get?.(key.slice(8));
      if (!ag && !key.startsWith("session-")) ag = agents?.get?.(`session-${key}`);
      if (ag?.session?.header?.parentSession) return String(ag.session.header.parentSession);
    } catch {}
    return void 0;
  }
  function findParentBucket(parentId) {
    if (!parentId) return null;
    const candidates = [
      parentId,
      parentId.startsWith("session-") ? parentId.slice(8) : `session-${parentId}`
    ];
    for (const c of candidates) {
      const b = sessionTotals.get(c);
      if (b && (b.avoidedTokens > 0 || b.requests > 0)) return b;
    }
    return null;
  }
  function sessionBucket(sessionId) {
    if (sessionId === void 0 || sessionId === null || sessionId === "") return null;
    const key = String(sessionId);
    let bucket = sessionTotals.get(key);
    if (bucket === void 0) {
      const parentId = findParentSessionId(key);
      const parentBucket = findParentBucket(parentId);
      if (parentBucket) {
        bucket = {
          requests: 0,
          auxRequests: 0,
          avoidedTokens: parentBucket.avoidedTokens || 0,
          outputTokens: 0,
          compCount: parentBucket.compCount || 0,
          dedupeHits: parentBucket.dedupeHits || 0,
          forkedFrom: parentId
        };
        __statsDirty = true;
      } else {
        bucket = { requests: 0, auxRequests: 0, avoidedTokens: 0, outputTokens: 0, compCount: 0, dedupeHits: 0 };
      }
      sessionTotals.set(key, bucket);
    } else if (bucket.avoidedTokens === 0 && !bucket.forkedFrom) {
      const parentId = findParentSessionId(key);
      const parentBucket = findParentBucket(parentId);
      if (parentBucket && parentBucket.avoidedTokens > 0) {
        bucket.avoidedTokens = parentBucket.avoidedTokens;
        bucket.compCount = parentBucket.compCount || 0;
        bucket.dedupeHits = parentBucket.dedupeHits || 0;
        bucket.forkedFrom = parentId;
        __statsDirty = true;
      }
    }
    return bucket;
  }
  var __statsStorePath = (() => {
    try {
      const home = process.env.DSH_HOME || join(process.env.HOME || "", ".dsh");
      return join(home, "storages", "save-token-stats.json");
    } catch {
      return void 0;
    }
  })();
  var __statsDirty = false;
  var __statsPersistTimer = void 0;
  function __statsSerialize() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      totals: { ...totals },
      comp: { ...comp },
      compactStats: { ...compactStats },
      sessions: Object.fromEntries([...sessionTotals].slice(-400))
    };
  }
  function __statsLoad() {
    if (__statsStorePath === void 0) return;
    try {
      const parsed = JSON.parse(readFileSync(__statsStorePath, "utf8"));
      if (!parsed || typeof parsed !== "object") return;
      const pt = parsed.totals ?? {};
      const pc = parsed.comp ?? {};
      const ps = parsed.compactStats ?? {};
      for (const key of Object.keys(totals)) if (Number.isFinite(pt[key])) totals[key] += pt[key];
      for (const key of Object.keys(comp)) if (Number.isFinite(pc[key])) comp[key] += pc[key];
      for (const key of Object.keys(compactStats)) if (Number.isFinite(ps[key])) compactStats[key] += ps[key];
      const pss = parsed.sessions ?? {};
      if (typeof pss === "object") for (const key of Object.keys(pss)) {
        const row = pss[key];
        if (typeof row !== "object" || row === null) continue;
        const bucket = sessionBucket(key);
        if (bucket === null) continue;
        for (const bk of Object.keys(bucket)) if (Number.isFinite(row[bk])) bucket[bk] += row[bk];
      }
    } catch {
    }
  }
  function __statsSave() {
    if (__statsStorePath === void 0) return;
    try {
      mkdirSync(join(__statsStorePath, ".."), { recursive: true });
      const temp = __statsStorePath + ".tmp";
      writeFileSync(temp, JSON.stringify(__statsSerialize(), null, 2) + "\n", "utf8");
      writeFileSync(__statsStorePath, JSON.stringify(__statsSerialize(), null, 2) + "\n", "utf8");
      __statsDirty = false;
    } catch {
    }
  }
  function markStatsDirty() {
    __statsDirty = true;
    if (__statsPersistTimer === void 0) __statsPersistTimer = setInterval(() => {
      if (__statsDirty) __statsSave();
    }, 15000);
    __statsPersistTimer.unref?.();
  }
  __statsLoad();
  var records = [];
  var recent = [];
  var byTool = /* @__PURE__ */ new Map();
  var compressedIndex = /* @__PURE__ */ new Map();
  var dedupeCache = /* @__PURE__ */ new Map();
  // Per (session, tool) history for NEAR-duplicate detection. Separate from
  // dedupeCache because an exact key cannot find "94% the same output".
  var recentOutputs = /* @__PURE__ */ new Map();
  var nearDedupeEnabled = cfg.nearDedupeEnabled !== false;
  var originals = /* @__PURE__ */ new Map();
  var locatorIndex = /* @__PURE__ */ new Map();
  var lastEstBySession = /* @__PURE__ */ new Map();
  var lastBilledBySession = /* @__PURE__ */ new Map();
  var lastCompactAt = /* @__PURE__ */ new Map();
  var calibration = /* @__PURE__ */ new Map();
  var seq = 0;
  var spillAvailable = null;
  var lastSkip = "";
  function ratioFor(model) {
    var ent = calibration.get(model || "");
    return ent ? ent.ratio : 1;
  }
  function observeRatio(model, actual, est) {
    if (!(actual >= 500) || !(est >= 500)) return;
    var key = model || "";
    var ent = calibration.get(key);
    var r = actual / est;
    if (ent) {
      ent.ratio = ent.ratio * 0.8 + r * 0.2;
      ent.samples = Math.min(50, ent.samples + 1);
    } else {
      ent = { ratio: r, samples: 1 };
    }
    calibration.delete(key);
    calibration.set(key, ent);
    if (calibration.size > 32) {
      var oldest = calibration.keys().next();
      if (!oldest.done) calibration.delete(oldest.value);
    }
  }
  function compactWatermark() {
    if (cfg.contextWindowTokens > 0) return Math.round(cfg.contextWindowTokens * cfg.compactWatermarkRatio);
    return cfg.compactBudgetTokens;
  }
  function noteRecent(kind, label, detail, savedTokens) {
    recent.unshift({ ts: Date.now(), kind, label: String(label || ""), detail: String(detail || ""), saved: savedTokens || 0 });
    if (recent.length > 60) recent.length = 60;
  }
  function shortId(prefix) {
    seq = (seq + 1) % 1679616;
    return prefix + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }
  function flattenPlainText(content) {
    var text = "";
    if (!Array.isArray(content)) return void 0;
    for (var i = 0; i < content.length; i++) {
      var b = content[i];
      if (!b || b.type !== "text" || typeof b.text !== "string") return void 0;
      text += b.text;
    }
    return text;
  }
  function ownerSessionId(exec) {
    try {
      return exec.agent && exec.agent.session && exec.agent.session.header ? exec.agent.session.header.id : void 0;
    } catch (e) {
      return void 0;
    }
  }
  function rememberOriginal(id, text, locator) {
    var truncated = text.length > 262144;
    originals.set(id, { text: truncated ? text.slice(0, 262144) : text, locator, truncated, ts: Date.now() });
    locatorIndex.set(id, { locator, ts: Date.now() });
    if (locatorIndex.size > 4e3) {
      var dropL = locatorIndex.keys();
      while (locatorIndex.size > 3200) {
        var lx = dropL.next();
        if (lx.done) break;
        locatorIndex.delete(lx.value);
      }
    }
    if (originals.size > 160) {
      var it = originals.keys();
      while (originals.size > 120) {
        var nx = it.next();
        if (nx.done) break;
        originals.delete(nx.value);
      }
    }
  }
  function rememberCompressed(id, origText, replacedText, toolName) {
    var origTok = estTokens(origText), keptTok = estTokens(replacedText);
    compressedIndex.set(id, { o: Math.max(origTok, 1), k: keptTok, ts: Date.now() });
    if (compressedIndex.size > 4e3) {
      var drop = compressedIndex.keys();
      while (compressedIndex.size > 3200) {
        var nx = drop.next();
        if (nx.done) break;
        compressedIndex.delete(nx.value);
      }
    }
    var e = byTool.get(toolName) || { count: 0, savedBytes: 0 };
    e.count++;
    e.savedBytes += utf8Bytes(origText) - utf8Bytes(replacedText);
    byTool.set(toolName, e);
  }
  async function spillOriginal(text, sessionId, toolName, callId) {
    var store = ctx.get("spillStore");
    spillAvailable = store !== void 0;
    if (store === void 0) {
      lastSkip = "no spillStore backend: reversibility guaranteed, so compression stays off";
      return void 0;
    }
    if (sessionId === void 0) {
      lastSkip = "no owning session";
      return void 0;
    }
    try {
      var ref = await store.saveText({
        owner: { sessionId },
        source: { toolName, callId, label: "result" },
        suggestedName: toolName + ".txt",
        content: text
      });
      if (!ref || typeof ref.locator !== "string") {
        lastSkip = "spill ref had no locator";
        return void 0;
      }
      return ref;
    } catch (e) {
      lastSkip = "spill save failed: " + String(e);
      return void 0;
    }
  }
  /** Prior outputs remembered per (session, tool) for delta detection. */
  const NEAR_HISTORY_LIMIT = 4;
  const NEAR_LINES_SHOWN = 40;

  /**
   * Build the delta stub for a near-duplicate tool result.
   *
   * The stub lets the model answer without the full body: it names the earlier
   * call, the exact lines added and removed, and where the complete copy lives.
   * It never claims the content is unchanged when it is not.
   */
  function buildNearStub(id, toolName, agoSec, diff, ref) {
    var lines = ["[save-token #" + id + " delta: this " + toolName + " output is nearly identical to a call " + agoSec + "s ago that remains in context above."];
    lines.push("Changed lines only (the rest is byte-identical, in order):");
    var shown = 0;
    for (var i = 0; i < diff.added.length && shown < NEAR_LINES_SHOWN; i++, shown++) lines.push("  + " + truncLine(diff.added[i]));
    if (diff.added.length > shown) lines.push("  + ... and " + (diff.added.length - shown) + " more added lines");
    var shownR = 0;
    for (var j = 0; j < diff.removed.length && shownR < NEAR_LINES_SHOWN; j++, shownR++) lines.push("  - " + truncLine(diff.removed[j]));
    if (diff.removed.length > shownR) lines.push("  - ... and " + (diff.removed.length - shownR) + " more removed lines");
    lines.push("Full copy of THIS call stored at: " + ref.locator + ". " + (ref.retrievalHint || ""));
    lines.push("Do not answer from this stub alone when the unchanged part matters; read the earlier message or expand to the full copy.]");
    return lines.join("\n");
  }

  /** Clamp one line for the stub, marking the clamp so it cannot be mistaken
   * for the complete value. */
  function truncLine(line) {
    var t = String(line);
    return t.length > 240 ? t.slice(0, 240) + " ...[" + (t.length - 240) + " chars]" : t;
  }

  ctx.on("tools/post-execute", async function(exec, result, next) {
    var decision = await next();
    if (!decision || decision.kind !== "accept") return decision;
    if (Object.prototype.hasOwnProperty.call(decision, "value")) return decision;
    if (exec.parent !== void 0) comp.nestedCalls++;
    else comp.topLevelCalls++;
    if (exec.parent !== void 0) return decision;
    if (exec.name === "save_token_expand") return decision;
    // `read` is exempt from LOSSY compression only (write-then-read-precisely
    // is a verified information path). Dedupe is a different question: it either
    // restores exact prior bytes or names the exact delta, both of which keep
    // that path intact.
    var lossyAllowed = exec.name !== "read";
    var content = decision.content !== void 0 ? decision.content : result.content;
    var text = flattenPlainText(content);
    if (text === void 0) return decision;
    var isError = result.isError === true;
    var sessionId = ownerSessionId(exec);
    if (cfg.dedupeEnabled && !isError) {
      var ttl = Object.prototype.hasOwnProperty.call(cfg.dedupeTtlOverrides, exec.name) ? cfg.dedupeTtlOverrides[exec.name] : cfg.dedupeTtlMs;
      if (ttl > 0) {
        var fp = dedupeFingerprint(sessionId, exec.name, argsToString(exec.arguments), text);
        var prev = dedupeCache.get(fp);
        var now = Date.now();
        if (prev && now - prev.ts <= ttl) {
          var ref2 = await spillOriginal(text, sessionId, exec.name, exec.callId);
          if (ref2 !== void 0) {
            var did = shortId("d");
            var agoSec = Math.round((now - prev.ts) / 1e3);
            var stub = "[save-token #" + did + " deduped: this " + exec.name + " call returned BYTE-IDENTICAL output to a call " + agoSec + "s ago, which remains in context above. Do not answer from this stub alone; retrieve the earlier message, or re-run if freshness matters. Full copy of THIS call stored at: " + ref2.locator + ". " + (ref2.retrievalHint || "") + "]";
            var savedB = utf8Bytes(text) - utf8Bytes(stub);
            if (savedB > cfg.minSavingBytes) {
              rememberOriginal(did, text, ref2.locator);
              comp.dedupeHits++;
              comp.dedupeSavedBytes += savedB;
              const dBucket = sessionBucket(sessionId);
              if (dBucket !== null) dBucket.dedupeHits++;
              markStatsDirty();
              rememberCompressed(did, text, stub, exec.name);
              noteRecent("dedupe", exec.name, "identical output within " + agoSec + "s -> stubbed", estTokens(text) - estTokens(stub));
              return { kind: "accept", content: [{ type: "text", text: stub }] };
            }
          }
        }
        dedupeCache.set(fp, { ts: now, callId: exec.callId });
        // --- near-duplicate arm -------------------------------------------
        // A byte-exact key cannot see "same tool, same file, one line added",
        // which is what repeats during an edit loop. Compress only when the
        // change is small relative to the payload, and always state the exact
        // added/removed lines so nothing rests on the model's memory.
        if (nearDedupeEnabled) {
          var histKey = String(sessionId === void 0 ? "(none)" : sessionId) + "|" + exec.name;
          var hist = recentOutputs.get(histKey);
          if (hist === void 0) {
            hist = [];
            recentOutputs.set(histKey, hist);
          }
          for (var hi = hist.length - 1; hi >= 0 && hi >= hist.length - NEAR_HISTORY_LIMIT; hi--) {
            if (now - hist[hi].ts > ttl) break;
            var diff = nearDiff(hist[hi].text, text);
            if (diff.changedRatio > cfg.nearDedupeMaxChangeRatio) continue;
            if (diff.added.length === 0 && diff.removed.length === 0) break;
            if (utf8Bytes(text) < cfg.nearDedupeMinBytes) break;
            var ref3 = await spillOriginal(text, sessionId, exec.name, exec.callId);
            if (ref3 === void 0) break;
            var nid = shortId("n");
            var nstub = buildNearStub(nid, exec.name, Math.round((now - hist[hi].ts) / 1e3), diff, ref3);
            var nearSaved = utf8Bytes(text) - utf8Bytes(nstub);
            if (nearSaved <= cfg.minSavingBytes) break;
            rememberOriginal(nid, text, ref3.locator);
            comp.dedupeHits++;
            comp.dedupeSavedBytes += nearSaved;
            rememberCompressed(nid, text, nstub, exec.name);
            noteRecent("dedupe", exec.name, "near-identical output (+" + diff.added.length + "/-" + diff.removed.length + ") -> delta stub", estTokens(text) - estTokens(nstub));
            return { kind: "accept", content: [{ type: "text", text: nstub }] };
          }
          hist.push({ ts: now, text: text });
          if (hist.length > NEAR_HISTORY_LIMIT) hist.shift();
        }
        if (dedupeCache.size > 800) {
          var dk = dedupeCache.keys();
          while (dedupeCache.size > 500) {
            var dn = dk.next();
            if (dn.done) break;
            dedupeCache.delete(dn.value);
          }
        }
      }
    }
    if (!cfg.compressEnabled) return decision;
    var threshold = effectiveMinBytes(isError ? cfg.errorMinBytes : cfg.minBytes, cfg.minSavingBytes, cfg.keepRatioMax);
    if (utf8Bytes(text) <= threshold) return decision;
    var cand = buildCandidate(text, cfg);
    if (cand === null) return decision;
    // A `read` may only be replaced by a LOSSLESS encoding: dropping lines from
    // a file the model deliberately opened would break write-then-read.
    if (!lossyAllowed && cand.lossless !== true) return decision;
    var ref = await spillOriginal(text, sessionId, exec.name, exec.callId);
    if (ref === void 0) {
      noteRecent("skip", exec.name, lastSkip, 0);
      return decision;
    }
    var id = shortId("c");
    if (cand.lossless) comp.losslessEncodes++;
    if (cand.strategy === "lines-strided") comp.tabularWindows++;
    comp.count++;
    comp.bytesBefore += cand.before;
    comp.bytesAfter += cand.after;
    const cBucket = sessionBucket(sessionId);
    if (cBucket !== null) cBucket.compCount++;
    markStatsDirty();
    var verbose = comp.count <= cfg.noticeFullTrailerCount;
    var finalText = buildNotice({
      body: cand.text,
      id,
      before: cand.before,
      after: cand.after,
      lossless: cand.lossless,
      stats: cand.stats,
      locator: ref.locator,
      retrievalHint: ref.retrievalHint || "",
      verbose
    });
    rememberOriginal(id, text, ref.locator);
    rememberCompressed(id, text, finalText, exec.name);
    noteRecent(cand.lossless ? "lossless" : "compress", exec.name, fmtInt(cand.before) + "B -> " + fmtInt(cand.after) + "B (-" + Math.round((1 - cand.after / cand.before) * 100) + "%)", estTokens(text) - estTokens(finalText));
    return { kind: "accept", content: [{ type: "text", text: finalText }] };
  }, { prepend: true });
  var MARKER_RE = /\[save-token #([a-z0-9]+) /g;
  function collectTexts(blocks, out, depth) {
    if (!Array.isArray(blocks)) return;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b || typeof b !== "object") continue;
      if (typeof b.text === "string") out.push(b.text);
      else if (typeof b.arguments === "string") out.push(b.arguments);
      else if (Array.isArray(b.content) && depth < 3) collectTexts(b.content, out, depth + 1);
    }
  }
  function computeAvoided(messages) {
    var texts = [];
    collectTexts(messages, texts, 0);
    var avoided = 0, hits = 0;
    for (var i = 0; i < texts.length; i++) {
      MARKER_RE.lastIndex = 0;
      var m;
      while ((m = MARKER_RE.exec(texts[i])) !== null) {
        var ent = compressedIndex.get(m[1]);
        if (ent) {
          avoided += Math.max(0, ent.o - ent.k);
          hits++;
        }
      }
    }
    return { avoided, hits };
  }
  ctx.on("llm/stream", function(options, next) {
    var rec = {
      ts: Date.now(),
      kind: options.purpose ? "aux" : "request",
      session: options.sessionId ? String(options.sessionId).slice(-8) : "(direct)",
      provider: String(options.provider || ""),
      model: String(options.model || ""),
      estPrompt: 0,
      input: 0,
      cached: 0,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
      reasoning: 0,
      avoided: 0,
      replayHits: 0,
      closed: false,
      finish: ""
    };
    var fullSid = options.sessionId ? String(options.sessionId) : void 0;
    try {
      var texts = [];
      if (typeof options.system === "string") texts.push(options.system);
      collectTexts(options.messages, texts, 0);
      for (var i = 0; i < texts.length; i++) rec.estPrompt += estTokens(texts[i]);
      if (Array.isArray(options.tools) && options.tools.length > 0) {
        try {
          rec.estPrompt += estTokens(JSON.stringify(options.tools).slice(0, 2e5));
        } catch (e) {
        }
      }
      var av = computeAvoided(options.messages);
      rec.avoided = av.avoided;
      rec.replayHits = av.hits;
    } catch (e) {
      console.error("save-token: measure failed", e);
    }
    function observe(chunk) {
      if (chunk && chunk.type === "usage" && chunk.usage) {
        rec.input += chunk.usage.inputTokens || 0;
        var cr = chunk.usage.cacheReadTokens || 0;
        var cw = chunk.usage.cacheWriteTokens || 0;
        rec.cacheRead += cr;
        rec.cacheWrite += cw;
        rec.cached += cr + cw;
        rec.output += chunk.usage.outputTokens || 0;
        rec.reasoning += chunk.usage.reasoningTokens || 0;
      } else if (chunk && chunk.type === "finish" && chunk.reason) {
        rec.finish = String(chunk.reason.kind || "");
      }
    }
    function closeRecord() {
      if (rec.closed) return;
      rec.closed = true;
      rec.ms = Date.now() - rec.ts;
      if (fullSid !== void 0) {
        lastEstBySession.set(fullSid, rec.estPrompt);
        if (rec.kind !== "aux" && rec.input + rec.cached > 0) lastBilledBySession.set(fullSid, rec.input + rec.cached);
      }
      observeRatio(rec.model, rec.input + rec.cached, rec.estPrompt);
      var ratio = ratioFor(rec.model);
      if (rec.kind === "aux") totals.auxRequests++;
      else totals.requests++;
      totals.inputTokens += rec.input;
      totals.cachedTokens += rec.cached;
      totals.cacheReadTokens += rec.cacheRead;
      totals.cacheWriteTokens += rec.cacheWrite;
      totals.outputTokens += rec.output;
      totals.reasoningTokens += rec.reasoning;
      totals.avoidedTokens += Math.round(rec.avoided * ratio);
      totals.estPromptTokens += rec.estPrompt;
      comp.replays += rec.replayHits;
      const sBucket = sessionBucket(fullSid);
      if (sBucket !== null) {
        if (rec.kind === "aux") sBucket.auxRequests++;
        else sBucket.requests++;
        sBucket.avoidedTokens += Math.round(rec.avoided * ratio);
        sBucket.outputTokens += rec.output;
      }
      markStatsDirty();
      records.push(rec);
      if (records.length > 480) records.splice(0, records.length - 400);
      noteRecent(
        rec.kind === "aux" ? "aux" : "request",
        rec.model || rec.provider || "?",
        "prompt~" + fmtInt(rec.estPrompt) + " tok, out " + fmtInt(rec.output) + ", avoided ~" + fmtInt(Math.round(rec.avoided * ratio)) + (rec.replayHits ? " (" + rec.replayHits + " replayed)" : ""),
        Math.round(rec.avoided * ratio)
      );
    }
    var inner = next();
    async function* tracked() {
      try {
        for await (var chunk of inner) {
          observe(chunk);
          yield chunk;
        }
      } finally {
        closeRecord();
      }
    }
    return tracked();
  });
  ctx.on("agent/pre-step", async function(payload, next) {
    try {
      var sid = payload.agent && payload.agent.session ? String(payload.agent.session.header.id) : void 0;
      if (sid !== void 0 && cfg.compactAssistEnabled) {
        var actual = lastBilledBySession.get(sid) || 0;
        var est = lastEstBySession.get(sid) || 0;
        var level = actual > 0 ? actual : est;
        var watermark = compactWatermark();
        var lastAt = lastCompactAt.get(sid) || 0;
        var now = Date.now();
        if (watermark > 0 && level > watermark && now - lastAt > cfg.compactCooldownMs) {
          var cs = ctx.get("compaction");
          if (cs !== void 0 && typeof cs.compactIfNeeded === "function") {
            lastCompactAt.set(sid, now);
            compactStats.attempts++;
            var res = await cs.compactIfNeeded(payload.agent, "pressure", payload.signal);
            if (res !== void 0 && res !== null) {
              compactStats.done++;
              noteRecent("compact", payload.agent.options && payload.agent.options.model ? payload.agent.options.model : "session", "context ~" + fmtInt(level) + " tok > watermark " + fmtInt(watermark) + " -> compaction applied", 0);
            } else {
              compactStats.skipped++;
              markStatsDirty();
              noteRecent("compact", "policy", "pressure reported at ~" + fmtInt(level) + " tok; engine declined (no-op)", 0);
            }
          }
        }
      }
    } catch (e) {
      console.error("save-token: compaction assist failed (non-fatal)", e);
    }
    return next();
  });
  ctx.tools.register(defineTool({
    name: "save_token_expand",
    description: "Retrieve the FULL ORIGINAL text behind a compressed [save-token #id] tool-output notice. Use it whenever an omitted region might contain a detail you need, instead of guessing from the preview.",
    parameters: {
      id: { type: "string", required: true, description: 'The short marker id from the notice, e.g. "c1or".' }
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: function(args, value) {
        var t = value && typeof value.text === "string" && value.text.length > 0 ? value.text : String(value && value.error || "not found");
        return [{ type: "text", text: t }];
      }
    },
    execute: function(args) {
      var key = args && typeof args.id === "string" ? args.id.trim() : "";
      var ent = originals.get(key);
      if (ent) return Promise.resolve({ text: ent.text, locator: ent.locator, truncated: ent.truncated === true });
      var loc = locatorIndex.get(key);
      function locatorFallback() {
        return { error: "expired id. The FULL ORIGINAL is still stored at: " + loc.locator + ". Use the read tool on that path.", locator: loc.locator };
      }
      if (loc) {
        var store = ctx.get("spillStore");
        if (store && typeof store.readText === "function") {
          return store.readText({ locator: loc.locator }).then(function(out) {
            var t = out && (typeof out.text === "string" && out.text.length > 0 ? out.text : typeof out === "string" && out.length > 0 ? out : null);
            if (t) return { text: t, locator: loc.locator, truncated: false };
            return locatorFallback();
          }, function() {
            return locatorFallback();
          });
        }
        return Promise.resolve(locatorFallback());
      }
      return Promise.resolve({ error: "unknown or expired id. Find the FULL ORIGINAL path printed inside the original [save-token #...] notice and use the read tool on that path." });
    }
  }));
  ctx.effect(
    () => {
      const handler = async (req, res) => {
        try {
          const path = String(req.url ?? "").split("?")[0].replace(/\/+$/, "");
          const action = path.endsWith("/api/dashboard") ? "dashboard" : path.endsWith("/api/set-enabled") ? "set-enabled" : path.endsWith("/api/reset") ? "reset" : "";
          if (req.method === "GET" && action === "dashboard") {
            try {
              const url = new URL(req.url, "http://localhost");
              setDashboardSession(url.searchParams.get("sessionId"));
            } catch {
              setDashboardSession(void 0);
            }
            sendJson(res, 200, dashboardPayload());
            return;
          }
          if (req.method === "POST" && (action === "set-enabled" || action === "reset")) {
            let args = {};
            try {
              const chunks = [];
              for await (const c of req) chunks.push(c);
              const raw = Buffer.concat(chunks).toString("utf8");
              if (raw) args = JSON.parse(raw);
            } catch (e) {
              args = {};
            }
            sendJson(res, 200, action === "set-enabled" ? setEnabled(args) : resetAll());
            return;
          }
          sendJson(res, 404, { ok: false, error: "unknown save-token endpoint" });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      };
      return ctx.webServer.register({ kind: "prefix", path: "/save-token", handler });
    },
    "save-token: dashboard API routes"
  );
  function sendJson(res, status, payload) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(payload));
  }
  function dashboardPayload() {
    var series = records.slice(-60).map(function(r) {
      return { p: r.input + r.cached || r.estPrompt, a: r.avoided, aux: r.kind === "aux" };
    });
    var tools = [];
    byTool.forEach(function(v, k) {
      tools.push({ name: k, count: v.count, savedBytes: v.savedBytes });
    });
    tools.sort(function(a, b) {
      return b.savedBytes - a.savedBytes;
    });
    var billedInput = totals.inputTokens + totals.cachedTokens;
    var ratioSum = 0, ratioSamples = 0;
    calibration.forEach(function(e) {
      ratioSum += e.ratio * e.samples;
      ratioSamples += e.samples;
    });
    return {
      uptimeSec: Math.round((Date.now() - startedAt) / 1e3),
      flags: { compress: cfg.compressEnabled, dedupe: cfg.dedupeEnabled, expandTool: true },
      spillReady: spillAvailable,
      lastSkip,
      totals,
      reliefPct: billedInput + totals.avoidedTokens > 0 ? Math.round(totals.avoidedTokens * 100 / (billedInput + totals.avoidedTokens)) : 0,
      // cache-health sentinel: most input rides provider prompt cache (bench:
      // 88.9% cache-read at 1/30 price), so any change that tanks this number
      // is saving tokens while silently raising real cost
      cacheHitPct: billedInput > 0 ? Math.round(totals.cacheReadTokens * 100 / billedInput) : 0,
      estRatio: ratioSamples > 0 ? Math.round(ratioSum / ratioSamples * 100) / 100 : null,
      compression: comp,
      compaction: {
        assistOn: cfg.compactAssistEnabled,
        attempts: compactStats.attempts,
        done: compactStats.done,
        skipped: compactStats.skipped,
        watermarkTok: compactWatermark(),
        budgetTok: cfg.compactBudgetTokens
      },
      byTool: tools.slice(0, 8),
      series,
      recent: recent.slice(0, 18),
      session: dashboardSession
    };
  }
  var dashboardSession = null;
  function setDashboardSession(sessionId) {
    if (sessionId === void 0 || sessionId === null || sessionId === "") {
      dashboardSession = null;
      return;
    }
    const bucket = sessionBucket(String(sessionId));
    dashboardSession = bucket === null ? { requests: 0, auxRequests: 0, avoidedTokens: 0, outputTokens: 0, compCount: 0, dedupeHits: 0 } : { ...bucket };
  }
  function setEnabled(args) {
    var a = args || {};
    if (a.key === "compress") cfg.compressEnabled = !!a.value;
    else if (a.key === "dedupe") cfg.dedupeEnabled = !!a.value;
    else if (a.key === "compactAssist") cfg.compactAssistEnabled = !!a.value;
    else return { ok: false };
    noteRecent("config", a.key, a.value ? "enabled" : "disabled", 0);
    return { ok: true, flags: { compress: cfg.compressEnabled, dedupe: cfg.dedupeEnabled, expandTool: true } };
  }
  function resetAll() {
    totals.requests = 0;
    totals.auxRequests = 0;
    totals.inputTokens = 0;
    totals.cachedTokens = 0;
    totals.cacheReadTokens = 0;
    totals.cacheWriteTokens = 0;
    totals.outputTokens = 0;
    totals.reasoningTokens = 0;
    totals.avoidedTokens = 0;
    totals.estPromptTokens = 0;
    comp.count = 0;
    comp.bytesBefore = 0;
    comp.bytesAfter = 0;
    comp.dedupeHits = 0;
    comp.dedupeSavedBytes = 0;
    comp.replays = 0;
    comp.losslessEncodes = 0;
    comp.tabularWindows = 0;
    comp.topLevelCalls = 0;
    comp.nestedCalls = 0;
    compactStats.attempts = 0;
    compactStats.done = 0;
    compactStats.skipped = 0;
    records.length = 0;
    recent.length = 0;
    byTool.clear();
    compressedIndex.clear();
    dedupeCache.clear();
    originals.clear();
    sessionTotals.clear();
    dashboardSession = null;
    startedAt = Date.now();
    try {
      if (__statsStorePath !== void 0) writeFileSync(__statsStorePath, JSON.stringify(__statsSerialize(), null, 2) + "\n", "utf8");
    } catch {
    }
    return { ok: true };
  }
  console.log("save-token v2 loaded: structure-aware compress + lossless tabular encode + expand tool + cache-aware compaction assist (off by default)");
}

export { apply, inject, name };
