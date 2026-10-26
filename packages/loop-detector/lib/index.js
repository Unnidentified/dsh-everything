import { createUserMessage } from "@deepseek-ai/dsh-llm";
const name = "loop-detector";
const inject = ["agents"];
const DEFAULT_SEARCH_TOOLS = ["web_search", "mcp__exa__web_search_exa"];
function extractQueries(args) {
  if (args === null || typeof args !== "object") return [];
  const record = args;
  const out = [];
  const single = record.query;
  if (typeof single === "string" && single.trim().length > 0) out.push(single);
  const many = record.queries;
  if (Array.isArray(many)) {
    for (const item of many) {
      if (typeof item === "string" && item.trim().length > 0) out.push(item);
    }
  }
  return out;
}
function detectRepetition(text) {
  const window = 2048;
  const bigWindow = 8192;
  if (text.length < 128) return [false, ""];
  const tail = text.slice(-window);
  for (let T = 8; T <= 256; T++) {
    const need = T * 4;
    if (tail.length < need) break;
    const last = tail.slice(-need);
    const first = last.slice(0, T);
    let ok = true;
    for (let r = 1; r < 4; r++) {
      if (last.slice(r * T, (r + 1) * T) !== first) {
        ok = false;
        break;
      }
    }
    if (ok) return [true, `periodic repeat: period=${T}`];
  }
  const seen = /* @__PURE__ */ new Map();
  for (let i = 0; i + 64 <= tail.length; i += 64) {
    const seg = tail.slice(i, i + 64);
    const n = (seen.get(seg) ?? 0) + 1;
    if (n >= 3) return [true, `n-gram repeat: 64-char block seen ${n}x`];
    seen.set(seg, n);
  }
  const big = text.slice(-bigWindow);
  if (big.length >= 1024) {
    const anchor = big.slice(-512);
    const head = big.slice(0, -512);
    const idx = head.lastIndexOf(anchor);
    if (idx !== -1) {
      let match = 512;
      let i = idx - 1;
      let j = big.length - 513;
      while (i >= 0 && j >= 0 && big[i] === big[j]) {
        match++;
        i--;
        j--;
      }
      if (match >= 512) return [true, `large-scale repeat: ${match} chars repeated 2x+`];
    }
  }
  return [false, ""];
}
function apply(ctx, config = {}) {
  const minLen = config.minLen ?? 512;
  const maxRetries = config.maxRetries ?? 1;
  const checkReasoning = config.checkReasoning ?? true;
  const searchTools = new Set(config.searchTools ?? DEFAULT_SEARCH_TOOLS);
  const buffers = /* @__PURE__ */ new Map();
  const retries = /* @__PURE__ */ new Map();
  const searchHistories = /* @__PURE__ */ new Map();
  const stallCounts = /* @__PURE__ */ new Map();
  ctx.on("session/event", (session, event) => {
    if (event.type === "turn/end") {
      const sid2 = String(session.id);
      buffers.delete(sid2);
      retries.delete(sid2);
      searchHistories.delete(sid2);
      stallCounts.delete(sid2);
      return;
    }
    if (event.type !== "assistant/chunk") return;
    const chunk = event.data.chunk;
    if (chunk.type !== "text-delta" && !(checkReasoning && chunk.type === "reasoning-delta")) return;
    const sid = String(session.id);
    const buf = (buffers.get(sid) ?? "") + chunk.text;
    buffers.set(sid, buf);
    if (buf.length < minLen) return;
    const [isLoop, why] = detectRepetition(buf);
    if (!isLoop) return;
    const agent = ctx.agents.get(session.id);
    buffers.set(sid, "");
    if (!agent) return;
    const tries = retries.get(sid) ?? 0;
    if (tries < maxRetries) {
      retries.set(sid, tries + 1);
      ctx.logger.warn(
        `[loop-detector] session ${sid} loop detected (${tries + 1}/${maxRetries}): ${why}; steering a retry`
      );
      agent.steer(createUserMessage({
        content: [{
          type: "text",
          text: "[loop-detector] You are repeating the same passage, which is a loop. Stop the current line of thinking and answer again: do not restate anything you have already written, and give a concise, complete, non-repeating final answer."
        }],
        source: { kind: "user" }
      }));
    } else {
      retries.delete(sid);
      ctx.logger.error(
        `[loop-detector] session ${sid} \u91CD\u8BD5 ${maxRetries} \u6B21\u4ECD\u6B7B\u5FAA\u73AF\uFF0C\u5F3A\u5236\u53D6\u6D88: ${why}`
      );
      agent.cancel({ kind: "hook", reason: `loop-detected: ${why}` });
    }
  });
  function extractTokens(q) {
    return new Set(
      q.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter((t) => t.length >= 2)
    );
  }
  ctx.on("tools/execute", (exec, next) => {
    if (!searchTools.has(exec?.name)) return next();
    const sid = exec.agent?.id;
    if (!sid) return next();
    const queries = extractQueries(exec.arguments);
    if (queries.length === 0) return next();
    for (const query of queries) {
      const tokens = extractTokens(query);
      if (tokens.size === 0) continue;
      const hist = searchHistories.get(sid) ?? [];
      const topic = /* @__PURE__ */ new Set();
      for (const q of hist.slice(-3)) {
        for (const t of extractTokens(q)) topic.add(t);
      }
      let novelRatio = 1;
      if (topic.size > 0) {
        const novel = [...tokens].filter((t) => !topic.has(t)).length;
        novelRatio = novel / tokens.size;
      }
      hist.push(query);
      searchHistories.set(sid, hist.slice(-6));
      if (novelRatio < 0.25) {
        const n = (stallCounts.get(sid) ?? 0) + 1;
        stallCounts.set(sid, n);
        if (n >= 2) {
          stallCounts.delete(sid);
          const agent = ctx.agents.get(sid);
          if (agent) {
            const tries = retries.get(sid) ?? 0;
            if (tries < maxRetries) {
              retries.set(sid, tries + 1);
              ctx.logger.warn(
                `[loop-detector] session ${sid} \u8FDE\u7EED ${n} \u6B21\u641C\u7D22\u540C\u4E00\u4E3B\u9898\uFF08\u65E0\u65B0\u4FE1\u606F\uFF09: "${query}"\uFF1Bsteer \u5F15\u5BFC\u505C\u6B62\u641C\u7D22`
              );
              agent.steer(createUserMessage({
                content: [{
                  type: "text",
                  text: "[loop-detector] You have searched the same topic repeatedly with reworded queries and no new information. Stop searching and answer from what you already have; do not call the search tool again."
                }],
                source: { kind: "user" }
              }));
              break;
            } else {
              retries.delete(sid);
              ctx.logger.error(
                `[loop-detector] session ${sid} \u641C\u7D22\u4E3B\u9898\u91CD\u590D\u91CD\u8BD5 ${maxRetries} \u6B21\u4ECD\u4E0D\u505C\u6B62\uFF0C\u5F3A\u5236\u53D6\u6D88`
              );
              agent.cancel({ kind: "hook", reason: "repeated-search-same-topic" });
              break;
            }
          }
        }
      } else {
        stallCounts.delete(sid);
      }
    }
    return next();
  });
}
export {
  apply,
  inject,
  name
};
