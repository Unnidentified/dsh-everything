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
        `[loop-detector] session ${sid} \u68C0\u6D4B\u5230\u6B7B\u5FAA\u73AF\uFF08${tries + 1}/${maxRetries}\uFF09: ${why}\uFF1Bsteer \u5F15\u5BFC\u91CD\u8BD5`
      );
      agent.steer(createUserMessage({
        content: [{
          type: "text",
          text: "[loop-detector] \u68C0\u6D4B\u5230\u4F60\u6B63\u5728\u91CD\u590D\u8F93\u51FA\u540C\u4E00\u6BB5\u5185\u5BB9\uFF08\u6B7B\u5FAA\u73AF\uFF09\u3002\u8BF7\u7ACB\u5373\u505C\u6B62\u5F53\u524D\u601D\u8DEF\u5E76\u91CD\u65B0\u7EC4\u7EC7\u56DE\u7B54\uFF1A\u4E0D\u8981\u91CD\u590D\u4EFB\u4F55\u5DF2\u7ECF\u8F93\u51FA\u7684\u6587\u5B57\uFF0C\u76F4\u63A5\u7ED9\u51FA\u7B80\u6D01\u3001\u5B8C\u6574\u3001\u4E0D\u91CD\u590D\u7684\u6700\u7EC8\u56DE\u7B54\u3002"
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
                  text: "[loop-detector] \u68C0\u6D4B\u5230\u4F60\u8FDE\u7EED\u591A\u6B21\u4F7F\u7528\u641C\u7D22\u5DE5\u5177\u641C\u7D22\u540C\u4E00\u4E3B\u9898\uFF08\u6362\u4E86\u5173\u952E\u8BCD\u4F46\u6CA1\u6709\u65B0\u4FE1\u606F\uFF09\u3002\u8BF7\u7ACB\u5373\u505C\u6B62\u641C\u7D22\uFF0C\u57FA\u4E8E\u5DF2\u6709\u4FE1\u606F\u76F4\u63A5\u56DE\u7B54\uFF1B\u4E0D\u8981\u518D\u8C03\u7528\u641C\u7D22\u5DE5\u5177\u3002"
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
