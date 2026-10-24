window.__ModuleLoader__.load({ id: "dsh-plugin-save-token", factory: function (require) {
var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);
var import_react_dom = __toESM(require("react-dom"), 1);
var import_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
/*!
 * dsh-plugin-save-token v2.4.1 — Client half (browser)
 * Live strip: in-flow pill (was an absolutely-positioned floater that
 * covered the tail of the last reply and sibling hover tooltips).
 *
 * ES module built by build.mjs into the DSH client-modules handshake
 * (lib/client.js, `window.__ModuleLoader__.load({ id, factory })`). `react`
 * stays external: the web shell seeds it in the module table and the
 * loader-provided require resolves it inside the factory.
 *
 * Contract: `{ inject: ['slots', 'locale'], apply(ctx) }` — registers UI into slots
 * `settings.section` and `conversation.composer.dock`, polls the
 * package-private JSON API (`/save-token/api/*`) served by the node half,
 * and renders with React.createElement. UI copy is bilingual (en/zh),
 * following the dsh locale setting (`ctx.locale`, fallback `<html lang>`).
 */
var inject = ["slots", "locale"];
var API_BASE = "/save-token/api";
var STR = {
  en: {
    tagline: "structure-aware · lossless-first · CCR",
    up: "up {n}min",
    hintOn: "Enabled — click to turn off",
    hintOff: "Disabled — click to enable",
    on: "ON",
    off: "OFF",
    toggleCompress: "Compress",
    toggleDedupe: "Dedupe",
    toggleCompact: "Compact@{n}",
    reset: "Reset",
    loading: "Loading token stats...",
    spillWarn: "Reversible storage unavailable -> compression stays off. ",
    kpiRequests: "Model requests",
    kpiRequestsSub: "+{n} aux (title/compaction)",
    kpiIn: "Input tokens (actual)",
    kpiInSub: "cache hit {p}% · {n} cached",
    kpiOut: "Output tokens (actual)",
    kpiOutSub: "{n} reasoning",
    kpiAvoided: "Tokens avoided (est)",
    kpiAvoidedSub: "~{p}% lighter context per call avg",
    chartTitle: "Per-request context weight — gray = sent prompt, green = avoided",
    noRequests: "no requests yet",
    chartSub: "avg prompt ~{a} tok | avg avoided ~{b} tok/request",
    cardCompress: "Compression",
    cardCompressLine: " reshaped, avg -{r}% bytes",
    cardCompressCalls: "{n} top-level · {m} nested calls",
    cardLossless: "Lossless routes",
    cardLosslessLine: " TOON-style re-encodes",
    cardLosslessSub: "{n} strided table windows",
    cardDedupe: "Dedupe / Compaction",
    cardDedupeStubbed: " stubbed · ",
    cardDedupeCompactions: " compactions",
    cardDedupeSub: "{b} deduped · assist @{t} tok",
    topTools: "Top tools by bytes kept out",
    topToolsEmpty: "nothing compressed yet",
    recent: "Recent activity",
    footer: "Lossless-first: uniform JSON arrays are re-encoded deterministically (TOON-style) with zero information loss; regular outputs get structure-aware windows with line-numbered stride samples. Every replacement stays retrievable via the save_token_expand tool or the stored locator.",
    stripAvoided: "~{n} saved",
    stripCompressed: "{n} comp",
    stripLossless: " ({n} lossless)",
    stripReqs: "{n} reqs",
    kindCompress: "compressed",
    kindLossless: "lossless",
    kindDedupe: "deduped",
    kindRequest: "request",
    kindAux: "aux-call",
    kindSkip: "skipped",
    kindConfig: "config",
    kindCompact: "compaction"
  },
  zh: {
    tagline: "结构感知 · 无损优先 · CCR",
    up: "已运行 {n} 分钟",
    hintOn: "已启用——点击关闭",
    hintOff: "已停用——点击启用",
    on: "开",
    off: "关",
    toggleCompress: "压缩",
    toggleDedupe: "去重",
    toggleCompact: "Compaction@{n}",
    reset: "重置",
    loading: "正在加载 token 统计…",
    spillWarn: "可逆存储不可用 → 压缩保持关闭。",
    kpiRequests: "模型请求",
    kpiRequestsSub: "+{n} 辅助（标题/compaction）",
    kpiIn: "输入 token（实际）",
    kpiInSub: "缓存命中 {p}% · 含 {n} 缓存",
    kpiOut: "输出 token（实际）",
    kpiOutSub: "{n} 推理",
    kpiAvoided: "节省 token（估算）",
    kpiAvoidedSub: "单次调用平均减轻 ~{p}% 上下文",
    chartTitle: "单次请求上下文重量——灰 = 发送的提示词,绿 = 已节省",
    noRequests: "暂无请求",
    chartSub: "平均提示 ~{a} tok | 平均节省 ~{b} tok/次",
    cardCompress: "压缩统计",
    cardCompressLine: " 次重塑,平均 -{r}% 字节",
    cardCompressCalls: "顶层 {n} 次 · 嵌套 {m} 次",
    cardLossless: "无损路径",
    cardLosslessLine: " 次 TOON 式重编码",
    cardLosslessSub: "{n} 个抽采样表格窗口",
    cardDedupe: "去重 / Compaction",
    cardDedupeStubbed: " 次去重桩 · ",
    cardDedupeCompactions: " 次 compaction",
    cardDedupeSub: "去重节省 {b} · 协助水位 @{t} tok",
    topTools: "节省字节最多的工具",
    topToolsEmpty: "还没有压缩记录",
    recent: "近期活动",
    footer: "无损优先:均匀 JSON 数组确定性重编码(TOON 式),零信息损失;常规输出走结构感知窗口,中段按行号抽采样。每次替换都可经 save_token_expand 工具或存储定位器一步取回。",
    stripAvoided: "省 ~{n} tok",
    stripCompressed: "压缩 {n}",
    stripLossless: "({n} 无损)",
    stripReqs: "{n} 请求",
    kindCompress: "压缩",
    kindLossless: "无损",
    kindDedupe: "去重",
    kindRequest: "请求",
    kindAux: "辅助",
    kindSkip: "跳过",
    kindConfig: "配置",
    kindCompact: "compaction"
  }
};
function tr(locale, key, vars) {
  const dict = STR[locale] || STR.en;
  let s = dict[key] !== void 0 ? dict[key] : STR.en[key] !== void 0 ? STR.en[key] : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, function(m, k) {
    return vars[k] !== void 0 ? vars[k] : m;
  });
  return s;
}
var CSS = ".st-wrap{display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary,#1f2937)}\n.st-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.st-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}\n.st-kpi{background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-bg-base,#f7f7f8) 82%,transparent));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;padding:10px 12px;min-width:0}\n.st-kpi .st-v{font-size:19px;font-weight:650;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.st-kpi .st-s{color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px;margin-top:3px;line-height:1.35}\n.st-card{background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-bg-base,#f7f7f8) 82%,transparent));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;padding:12px 14px}\n.st-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b7280);letter-spacing:.02em;text-transform:uppercase}\n.st-green{color:var(--dsw-alias-state-success-primary,#15803d)}\n.st-dim{color:var(--dsw-alias-label-secondary,#6b7280)}\n.st-bar{height:8px;border-radius:4px;background:var(--dsw-alias-brand-primary,#2563eb);opacity:.85}\n.st-barrow{display:grid;grid-template-columns:minmax(90px,160px) 1fr auto;gap:10px;align-items:center;margin-top:8px;font-size:12px}\n.st-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}\n.st-table td{padding:4px 6px;border-top:1px solid var(--dsw-alias-border-l1,#eceef1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}\n.st-badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:600;border:1px solid var(--dsw-alias-border-l1,#ddd)}\n.st-btn{border:1px solid var(--dsw-alias-border-l2,#d1d5db);background:transparent;color:inherit;border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer}\n.st-btn:hover{border-color:var(--dsw-alias-brand-primary,#2563eb)}\n.st-btn.st-on{border-color:var(--dsw-alias-state-success-primary,#16a34a);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#15803d);font-weight:650}\n.st-btn.st-on:hover{border-color:var(--dsw-alias-state-success-primary,#16a34a);filter:brightness(1.08)}\n.st-btn.st-off{opacity:.5}\n.st-dot{display:inline-block;width:7px;height:7px;border-radius:999px;margin-right:6px;vertical-align:1px}\n.st-strip{user-select:none !important;-webkit-user-select:none !important;position:static;display:flex;gap:0;align-items:center;flex:none;max-width:100%;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));color:var(--dsw-alias-label-tertiary,#6b7280)}\n.st-tail-sep{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-caption)) !important;margin:0 -14px 0 -2px;font-size:inherit;line-height:inherit;display:inline-block;vertical-align:middle}\n.st-strip-anchor{user-select:none !important;-webkit-user-select:none !important;display:inline-flex;align-items:center;cursor:pointer;background:0 0;border:none;border-radius:999px;padding:1px 8px;font-family:inherit;font-size:inherit;line-height:inherit;color:inherit;font-variant-numeric:tabular-nums;font-weight:650}.st-strip-anchor:hover,.st-strip-anchor[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}\n.st-strip-anchor:hover{color:var(--dsw-alias-label-secondary,#6b7280)}\n.st-dialog{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}\n.st-dialog-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}\n.st-dialog-title-label{align-items:center;gap:6px;min-width:0;display:inline-flex}\n.st-dialog-title-value{font-variant-numeric:tabular-nums}\n.st-dialog-rule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}\n.st-dialog-details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}\n.st-dialog-details dt,.st-dialog-details dd{min-width:0;margin:0}\n.st-dialog-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}\n.st-dialog-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}\n/* save-token footer harmony: square separator dots + context meter toned to match */\n[data-composer-stats] .OpZ85W_sep,[data-composer-stats] span[class*=_sep]{font-size:0 !important;line-height:0 !important;display:inline-block !important;width:2px !important;height:2px !important;border-radius:1px !important;background:var(--dsw-alias-label-caption) !important;margin:0 8px !important;overflow:hidden !important;vertical-align:middle !important}\n.y0jqnG_percent{color:var(--dsw-alias-label-tertiary) !important;font-weight:650 !important;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px) !important}\n.y0jqnG_trigger{font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px) !important}\n.y0jqnG_track,.y0jqnG_fill{stroke-width:0.875px !important}\n.st-pills{user-select:none !important;-webkit-user-select:none !important;display:flex;align-items:center;justify-content:center;gap:0;flex:none;min-width:0;max-width:100%;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));color:var(--dsw-alias-label-tertiary,#6b7280)}\n.st-pill{user-select:none !important;-webkit-user-select:none !important;display:inline-flex;align-items:center;gap:6px;padding:1px 8px;border:none;border-radius:999px;background:transparent;color:inherit;font-family:inherit;font-size:inherit;line-height:inherit;font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer;flex:none}\n.st-pill:hover,.st-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}\n.st-pill svg{flex:none;width:14px;height:14px}\n.st-icon-speed{display:inline-flex}\n.st-pill .st-icon-speed svg{color:#e2681c}\n.st-pill-sep{font-size:0 !important;line-height:0 !important;color:transparent !important;display:inline-block;flex:none;width:2px;height:2px;border-radius:1px;background:var(--dsw-alias-label-caption,#9ca3af);margin:0 11px;overflow:hidden;vertical-align:middle}\n.st-pill-anchor{display:inline-flex;min-width:0}\n.st-pill-label{min-width:0;overflow:hidden;text-overflow:ellipsis}\n.st-pill-junction{font-size:0 !important;line-height:0 !important;color:transparent !important;display:inline-block;flex:none;width:2px;height:2px;border-radius:1px;background:var(--dsw-alias-label-caption,#9ca3af);margin:0 3px;overflow:hidden;vertical-align:middle}\n.yhfFVG_dock{gap:0 !important;overflow:hidden}\n.ST7X_W_body{container-type:inline-size}\n@container (max-width: 640px){.st-sep-cache,.st-pill-cache{display:none !important}}\n@container (max-width: 500px){.st-strip{display:none !important}}\n@container (max-width: 420px){.st-pill-usage,.st-pill-junction{display:none !important}}\n@container (max-width: 320px){.st-sep-speed,.st-pill-speed{display:none !important}}\n@container (max-width: 240px){.st-pill-time{display:none !important}}";
function ensureStyles() {
  if (typeof document === "undefined" || !document.head) return;
  let el = document.querySelector("style[data-save-token]");
  if (!el) {
    el = document.createElement("style");
    el.setAttribute("data-save-token", "");
    el.textContent = CSS;
    document.head.appendChild(el);
  }
}
ensureStyles();
async function apiGet(action) {
  const response = await fetch(API_BASE + "/" + action, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("save-token api " + action + ": HTTP " + response.status);
  return response.json();
}
async function apiPost(action, body) {
  const response = await fetch(API_BASE + "/" + action, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body || {})
  });
  if (!response.ok) throw new Error("save-token api " + action + ": HTTP " + response.status);
  return response.json();
}
function apply(ctx) {
  ensureStyles();
  if (typeof ctx.effect === "function") {
    ctx.effect(function() {
      ensureStyles();
      return function() {};
    }, "save-token: styles");
  }
  const h = import_react.default.createElement;
  function useLocale() {
    const getLocaleService = function() {
      try {
        return ctx.locale;
      } catch (e) {
        return null;
      }
    };
    const subscribe = function(notify) {
      const svc = getLocaleService();
      if (svc && typeof svc.subscribe === "function") return svc.subscribe(notify);
      if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.documentElement) {
        const obs = new MutationObserver(notify);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
        return function() {
          obs.disconnect();
        };
      }
      return function() {
      };
    };
    const getSnapshot = function() {
      const svc = getLocaleService();
      const active = svc && typeof svc.getLocale === "function" ? svc.getLocale().active : "";
      if (active === "zh" || active === "en") return active;
      const lang = typeof document !== "undefined" && document.documentElement && document.documentElement.lang || "";
      return lang.indexOf("zh") === 0 ? "zh" : "en";
    };
    return import_react.default.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }
  function fmtTok(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(Math.round(n));
  }
  function exactNum(n) {
    return Number(n || 0).toLocaleString("en-US");
  }
  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b >= 1048576) return (b / 1048576).toFixed(1) + "MB";
    if (b >= 1024) return (b / 1024).toFixed(1) + "KB";
    return b + "B";
  }
  function fmtTime(ts, locale) {
    try {
      return new Date(ts).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", { hour12: false });
    } catch (e) {
      return "";
    }
  }
  const KIND_LABEL = { compress: "kindCompress", lossless: "kindLossless", dedupe: "kindDedupe", request: "kindRequest", aux: "kindAux", skip: "kindSkip", config: "kindConfig", compact: "kindCompact" };
  const KIND_COLOR = { compress: "var(--dsw-alias-brand-primary,#2563eb)", lossless: "var(--dsw-alias-state-success-primary,#16a34a)", dedupe: "var(--dsw-alias-state-warn-primary,#b45309)", request: "var(--dsw-alias-label-secondary,#6b7280)", aux: "var(--dsw-alias-label-secondary,#6b7280)", skip: "var(--dsw-alias-state-error-primary,#b91c1c)", config: "var(--dsw-alias-label-secondary,#6b7280)", compact: "var(--dsw-alias-state-warn-primary,#b45309)" };
  function useDashboard(intervalMs, sessionId) {
    const st = import_react.default.useState(null);
    const data = st[0], setData = st[1];
    import_react.default.useEffect(function() {
      let alive = true;
      const tick = async function() {
        try {
          const d = await apiGet("dashboard" + (sessionId ? "?sessionId=" + encodeURIComponent(sessionId) : ""));
          if (alive) setData(d);
        } catch (e) {
          console.error("save-token dashboard poll failed", e);
        }
      };
      tick();
      const timer = setInterval(tick, intervalMs);
      return function() {
        alive = false;
        clearInterval(timer);
      };
    }, [sessionId]);
    return [data, setData];
  }
  function Kpi(props) {
    return h(
      "div",
      { className: "st-kpi" },
      h("div", { className: "st-title" }, props.label),
      h("div", { className: "st-v" + (props.green ? " st-green" : "") }, props.value),
      props.sub ? h("div", { className: "st-s" }, props.sub) : null
    );
  }
  function Spark(props) {
    const series = props.series || [];
    if (series.length === 0) return h("div", { className: "st-dim" }, props.t("noRequests"));
    const n = series.length;
    let maxV = 1;
    for (let i = 0; i < n; i++) maxV = Math.max(maxV, (series[i].p || 0) + (series[i].a || 0));
    const W = n * 7, H = 48;
    const bars = [];
    for (let j = 0; j < n; j++) {
      const p = series[j].p || 0, a = series[j].a || 0;
      const ph = Math.max(p > 0 ? 2 : 0, Math.round(p / maxV * 40));
      const ah = Math.round(a / maxV * 40);
      bars.push(h("rect", { key: "p" + j, x: j * 7, y: H - 4 - ph - ah, width: 5, height: ph, fill: "var(--dsw-alias-border-l2,#c7cbd1)" }));
      if (ah > 0) bars.push(h("rect", { key: "a" + j, x: j * 7, y: H - 4 - ah, width: 5, height: ah, fill: "var(--dsw-alias-state-success-primary,#16a34a)" }));
    }
    return h("svg", { width: "100%", height: H, viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none" }, bars);
  }
  function Toggle(props) {
    return h(
      "button",
      {
        className: "st-btn " + (props.on ? "st-on" : "st-off"),
        title: props.on ? props.t("hintOn") : props.t("hintOff"),
        onClick: async function() {
          try {
            await apiPost("set-enabled", { key: props.k, value: !props.on });
            props.onChange();
          } catch (e) {
            console.error(e);
          }
        }
      },
      h("span", { className: "st-dot", style: { background: props.on ? "var(--dsw-alias-state-success-primary,#16a34a)" : "currentColor", opacity: props.on ? 1 : 0.4 } }),
      props.label + ": " + (props.on ? props.t("on") : props.t("off"))
    );
  }
  function Dashboard() {
    const ud = useDashboard(2500);
    const d = ud[0], refresh = ud[1];
    const L = useLocale();
    const T = function(k, v) {
      return tr(L, k, v);
    };
    if (!d) return h("div", { className: "st-dim" }, T("loading"));
    const t = d.totals || {};
    const c = d.compression || {};
    const cm = d.compaction || { attempts: 0, done: 0, skipped: 0, budgetTok: 0 };
    const avgPrompt = t.requests > 0 ? Math.round(t.estPromptTokens / t.requests) : 0;
    const avgAvoided = t.requests > 0 ? Math.round(t.avoidedTokens / t.requests) : 0;
    const ratio = c.bytesBefore > 0 ? Math.round((1 - c.bytesAfter / c.bytesBefore) * 100) : 0;
    let maxSaved = 1;
    for (let i = 0; i < (d.byTool || []).length; i++) maxSaved = Math.max(maxSaved, d.byTool[i].savedBytes);
    return h(
      "div",
      { className: "st-wrap" },
      h(
        "div",
        { className: "st-row" },
        h("span", { style: { fontWeight: 650, fontSize: 15 } }, "Token Saver v2"),
        h("span", { className: "st-dim" }, T("tagline")),
        h("span", { className: "st-dim" }, T("up", { n: Math.round((d.uptimeSec || 0) / 60) })),
        h("span", { className: "st-dim" }, d.flags.expandTool ? "expand-tool ✓" : "")
      ),
      h(
        "div",
        { className: "st-row" },
        h(Toggle, { k: "compress", label: T("toggleCompress"), on: d.flags.compress, onChange: refresh, t: T }),
        h(Toggle, { k: "dedupe", label: T("toggleDedupe"), on: d.flags.dedupe, onChange: refresh, t: T }),
        h(Toggle, { k: "compactAssist", label: T("toggleCompact", { n: fmtTok(cm.watermarkTok || cm.budgetTok || 12e4) }), on: !!cm.assistOn, onChange: refresh, t: T }),
        h("span", { style: { flex: 1 } }),
        h("button", {
          className: "st-btn",
          onClick: async function() {
            try {
              await apiPost("reset", {});
              refresh();
            } catch (e) {
              console.error(e);
            }
          }
        }, T("reset"))
      ),
      d.spillReady === false ? h(
        "div",
        { className: "st-card", style: { borderColor: "var(--dsw-alias-state-error-primary,#b91c1c)" } },
        h("span", { className: "st-dim" }, T("spillWarn")),
        h("span", { className: "st-dim" }, d.lastSkip || "")
      ) : null,
      h(
        "div",
        { className: "st-kpis" },
        h(Kpi, { label: T("kpiRequests"), value: fmtTok(t.requests || 0), sub: T("kpiRequestsSub", { n: fmtTok(t.auxRequests || 0) }) }),
        h(Kpi, { label: T("kpiIn"), value: fmtTok((t.inputTokens || 0) + (t.cachedTokens || 0)), sub: T("kpiInSub", { n: fmtTok(t.cachedTokens || 0), p: d.cacheHitPct != null ? d.cacheHitPct : 0 }) }),
        h(Kpi, { label: T("kpiOut"), value: fmtTok(t.outputTokens || 0), sub: T("kpiOutSub", { n: fmtTok(t.reasoningTokens || 0) }) }),
        h(Kpi, { label: T("kpiAvoided"), value: fmtTok(t.avoidedTokens || 0), green: true, sub: T("kpiAvoidedSub", { p: d.reliefPct }) })
      ),
      h(
        "div",
        { className: "st-card" },
        h("div", { className: "st-title" }, T("chartTitle")),
        h(Spark, { series: d.series || [], t: T }),
        h(
          "div",
          { className: "st-s st-dim", style: { marginTop: 6 } },
          T("chartSub", { a: fmtTok(avgPrompt), b: fmtTok(avgAvoided) })
        )
      ),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } },
        h(
          "div",
          { className: "st-card" },
          h("div", { className: "st-title" }, T("cardCompress")),
          h(
            "div",
            { style: { marginTop: 6 } },
            h("div", null, h("b", null, fmtTok(c.count || 0)), T("cardCompressLine", { r: ratio }))
          ),
          h(
            "div",
            { className: "st-s st-dim", style: { marginTop: 4 } },
            fmtBytes(c.bytesBefore || 0) + " -> " + fmtBytes(c.bytesAfter || 0)
          ),
          h(
            "div",
            { className: "st-s st-dim", style: { marginTop: 2 } },
            T("cardCompressCalls", { n: String(c.topLevelCalls || 0), m: String(c.nestedCalls || 0) })
          )
        ),
        h(
          "div",
          { className: "st-card" },
          h("div", { className: "st-title" }, T("cardLossless")),
          h(
            "div",
            { style: { marginTop: 6 } },
            h("div", null, h("b", null, String(c.losslessEncodes || 0)), T("cardLosslessLine"))
          ),
          h(
            "div",
            { className: "st-s st-dim", style: { marginTop: 4 } },
            T("cardLosslessSub", { n: String(c.tabularWindows || 0) })
          )
        ),
        h(
          "div",
          { className: "st-card" },
          h("div", { className: "st-title" }, T("cardDedupe")),
          h(
            "div",
            { style: { marginTop: 6 } },
            h("div", null, h("b", null, String(c.dedupeHits || 0)), T("cardDedupeStubbed"), h("b", null, String(cm.done || 0)), "/", String(cm.attempts || 0), T("cardDedupeCompactions"))
          ),
          h(
            "div",
            { className: "st-s st-dim", style: { marginTop: 4 } },
            T("cardDedupeSub", { b: fmtBytes(c.dedupeSavedBytes || 0), t: fmtTok(cm.watermarkTok || cm.budgetTok || 0) })
          )
        )
      ),
      h(
        "div",
        { className: "st-card" },
        h("div", { className: "st-title" }, T("topTools")),
        (d.byTool || []).length === 0 ? h("div", { className: "st-dim", style: { marginTop: 8 } }, T("topToolsEmpty")) : h("div", null, (d.byTool || []).map(function(tool) {
          return h(
            "div",
            { className: "st-barrow", key: tool.name },
            h("span", { className: "st-dim", style: { overflow: "hidden", textOverflow: "ellipsis" } }, tool.name),
            h("div", { className: "st-bar", style: { width: Math.max(4, Math.round(tool.savedBytes * 100 / maxSaved)) + "%" } }),
            h("span", null, fmtBytes(tool.savedBytes) + " / " + tool.count + "x")
          );
        }))
      ),
      h(
        "div",
        { className: "st-card" },
        h("div", { className: "st-title" }, T("recent")),
        h("table", { className: "st-table" }, h("tbody", null, (d.recent || []).map(function(r, ri) {
          const kk = KIND_LABEL[r.kind] || KIND_LABEL.request;
          const kc = KIND_COLOR[r.kind] || KIND_COLOR.request;
          return h(
            "tr",
            { key: ri },
            h("td", { className: "st-dim" }, fmtTime(r.ts, L)),
            h("td", null, h("span", { className: "st-badge", style: { color: kc, borderColor: kc } }, T(kk))),
            h("td", { style: { fontWeight: 550 } }, r.label),
            h("td", { className: "st-dim" }, r.detail),
            h("td", { className: "st-green", style: { textAlign: "right" } }, r.saved > 0 ? "-" + fmtTok(r.saved) : "")
          );
        })))
      ),
      h(
        "div",
        { className: "st-s st-dim" },
        T("footer")
      )
    );
  }
  const PANEL_GAP = 8;
  const PANEL_MARGIN = 12;
  const MEASURE_STYLE = { visibility: "hidden", left: 0, top: 0 };
  function Strip(props) {
    ensureStyles();
    const ud = useDashboard(4e3, props.sessionId);
    const d = ud[0];
    const L = useLocale();
    const T = function(k, v) {
      return tr(L, k, v);
    };
    const [open, setOpen] = import_react.useState(false);
    const rootRef = import_react.useRef(null);
    const panelRef = import_react.useRef(null);
    const pos = import_primitives.useAnchoredPosition({ open, anchorRef: rootRef, panelRef, side: "top", gap: PANEL_GAP, margin: PANEL_MARGIN });
    import_primitives.useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
    import_react.useEffect(function() {
      if (!open) return;
      const onKeyDown = function(e) {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("keydown", onKeyDown);
      return function() {
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [open, setOpen]);
    if (!d) return null;
    const t = d.totals || {};
    const c = d.compression || {};
    const sess = d.session || null;
    // A chat that has not saved anything yet reports an all-zero bucket (and an
    // unknown session reports none at all), while the neighbouring stats pills stay
    // hidden until a turn produces usage. Rendering the zeros would flash a lone
    // "~0 saved" pill in the composer dock, so the strip waits for real savings.
    const hasSavings = sess !== null && ((sess.avoidedTokens || 0) > 0 || (sess.compCount || 0) > 0 || (sess.dedupeHits || 0) > 0);
    if (!hasSavings) return null;
    const saved = T("stripAvoided", { n: fmtTok(sess.avoidedTokens || 0) });
    const dd = [
      ["Tokens avoided (this chat)", exactNum(sess ? sess.avoidedTokens || 0 : 0) + " tok"],
      ["Tokens avoided (all chats)", exactNum(t.avoidedTokens || 0) + " tok"],
      ["Tool calls compressed (this chat)", String(sess ? sess.compCount || 0 : 0)],
      ["Duplicate calls stubbed (this chat)", String(sess ? sess.dedupeHits || 0 : 0)],
      ["Lossless encodes", String(c.losslessEncodes || 0)],
      ["Bytes before \u2192 after", c.count ? fmtBytes(c.bytesBefore) + " \u2192 " + fmtBytes(c.bytesAfter) : "\u2014"],
      ["Requests metered (this chat)", String(sess ? sess.requests || 0 : 0)]
    ];
    return h(
      "div",
      { className: "st-strip" },
      h(
        "span",
        { ref: rootRef, className: "st-strip-anchor", role: "button", "aria-haspopup": "dialog", "aria-expanded": open, title: "Token Saver details", onClick: function() {
          setOpen(!open);
        } },
        saved
      ),
      h("span", { className: "st-tail-sep", "aria-hidden": true }, "\u00b7"),
      open && import_react_dom.createPortal(
        h(
          "div",
          { ref: panelRef, className: "st-dialog", role: "dialog", "aria-label": "Token Saver", style: pos || MEASURE_STYLE },
          h("div", { className: "st-dialog-title" }, h("span", { className: "st-dialog-title-label" }, h(import_primitives.IconDatabaseOutlineRegular, {}), "Tokens saved"), h("span", { className: "st-dialog-title-value" }, exactNum((d.session || {}).avoidedTokens || 0) + " tok")),
          h("div", { className: "st-dialog-rule" }),
          h(
            "dl",
            { className: "st-dialog-details" },
            dd.map(function(row) {
              return h(import_react.Fragment, { key: row[0] }, h("dt", null, row[0]), h("dd", null, row[1]));
            })
          )
        ),
        document.body
      )
    );
  }
  ctx.slots.inject("settings.section", function() {
    ctx.slots.register(
      { name: "settings.section", id: "save-token", order: 430, label: "Token Saver" },
      function() {
        return h(Dashboard);
      }
    );
  });
  function fmtTps(n) {
    n = Math.max(0, Number(n) || 0);
    return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  }
  function fmtDur(ms) {
    const sec = (Number(ms) || 0) / 1e3;
    if (sec < 60) return (Math.round(sec * 10) / 10) + "s";
    const whole = Math.round(sec);
    return Math.floor(whole / 60) + "m" + (whole % 60) + "s";
  }
  function fmtTokCompact(n) {
    n = Number(n) || 0;
    const scaled = function(v) {
      return v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    };
    if (n < 1e3) return String(n);
    if (n < 1e6) return scaled(n / 1e3) + "K";
    return scaled(n / 1e6) + "M";
  }
  function billedInput(usage) {
    return (usage.uncachedInputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0);
  }
  function cacheHitPct(usage) {
    const denom = billedInput(usage);
    if (!denom) return null;
    return Math.round((usage.cacheReadTokens || 0) / denom * 100);
  }
  function useStatPanel(open, rootRef, panelRef) {
    const pos = import_primitives.useAnchoredPosition({ open: open, anchorRef: rootRef, panelRef: panelRef, side: "top", gap: PANEL_GAP, margin: PANEL_MARGIN });
    return pos;
  }
  function StatsDialog(props) {
    const rootRef = import_react.useRef(null);
    const panelRef = import_react.useRef(null);
    const pos = useStatPanel(props.open, rootRef, panelRef);
    import_primitives.useDismissOnOutsidePointer(rootRef, props.open, props.setOpen, panelRef);
    import_react.useEffect(function() {
      if (!props.open) return;
      const onKeyDown = function(e) {
        if (e.key === "Escape") props.setOpen(false);
      };
      document.addEventListener("keydown", onKeyDown);
      return function() {
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [props.open, props.setOpen]);
    return h(
      "span",
      { ref: rootRef, className: "OpZ85W_anchor st-pill-anchor" + (props.anchorClass ? " " + props.anchorClass : "") },
      h("button", {
        type: "button",
        className: "OpZ85W_pill st-pill",
        style: { background: "transparent", border: "none", outline: "none", cursor: "pointer", color: "inherit", userSelect: "none", WebkitUserSelect: "none" },
        "aria-haspopup": "dialog",
        "aria-expanded": props.open,
        onClick: function() {
          props.setOpen(!props.open);
        }
      }, props.icon, h("span", { className: "OpZ85W_label st-pill-label" }, props.label)),
      props.open && import_react_dom.createPortal(
        h(
          "div",
          { ref: panelRef, className: "st-dialog", role: "dialog", "aria-label": props.title, style: pos || MEASURE_STYLE },
          h("div", { className: "st-dialog-title" }, h("span", { className: "st-dialog-title-label" }, props.icon, props.title), props.value != null ? h("span", { className: "st-dialog-title-value" }, props.value) : null),
          h("div", { className: "st-dialog-rule" }),
          h(
            "dl",
            { className: "st-dialog-details" },
            (props.rows || []).map(function(row) {
              return h(import_react.Fragment, { key: row[0] }, h("dt", null, row[0]), h("dd", null, row[1]));
            })
          )
        ),
        document.body
      )
    );
  }
  function HonestStatsPills(props) {
    ensureStyles();
    const useProjection = props.useProjection;
    const useChat = props.useChat;
    const stats = typeof useProjection === "function" ? useProjection("sessionStats") : void 0;
    const usage = typeof useProjection === "function" ? useProjection("tokenUsage") : void 0;
    const nodes = typeof useChat === "function" ? useChat(function(sn) {
      return sn.legacy.nodes;
    }) : null;
    const [openPill, setOpenPill] = import_react.useState(null);
    if (typeof useProjection !== "function") return null;
    if (!stats && !usage) return null;
    const hasUsage = usage != null && (billedInput(usage) > 0 || (usage.outputTokens || 0) > 0);
    if ((!stats || stats.steps === 0) && !hasUsage) return null;
    const st = stats || { turns: 0, steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 };

    let turnsSet = new Set();
    let stepCount = 0;
    let nodeLlmMs = 0;
    let nodeToolMs = 0;
    let nodeTtftMs = 0;
    let nodeTtftSteps = 0;
    let nodeTotalGen = 0;
    let nodeTotalReasoning = 0;
    let nodeStreamedMs = 0;
    let nodeStreamedTokens = 0;

    let maxTurn = -1;
    let lastTurnGen = 0, lastTurnLlmMs = 0, lastTurnSteps = 0;
    let lastTurnStreamedMs = 0, lastTurnStreamedTokens = 0;

    if (nodes && nodes.length) {
      for (let idx = 0; idx < nodes.length; idx++) {
        const nd = nodes[idx];
        if (!nd) continue;
        if (nd.kind === "tool-result") {
          if (nd.callTime != null && nd.time != null) {
            nodeToolMs += Math.max(0, nd.time - nd.callTime);
          }
          continue;
        }
        if (nd.kind !== "assistant") continue;
        if (typeof nd.turn === "number") {
          turnsSet.add(nd.turn);
          if (nd.turn > maxTurn) maxTurn = nd.turn;
        }
        stepCount++;
        const provider = nd.message && nd.message.source ? nd.message.source.provider : void 0;
        const out = nd.usage && typeof nd.usage.outputTokens === "number" && Number.isFinite(nd.usage.outputTokens) ? nd.usage.outputTokens : 0;
        const res = nd.usage && typeof nd.usage.reasoningTokens === "number" && Number.isFinite(nd.usage.reasoningTokens) ? nd.usage.reasoningTokens : 0;
        let gen = out;
        if (res > 0) {
          if (nd.usage.candidateTokens !== void 0) {
            gen = out;
          } else if (provider === "google-antigravity" || res > out) {
            gen = out + res;
          }
        }
        nodeTotalGen += gen;
        nodeTotalReasoning += res;

        const timing = nd.timing;
        if (timing && timing.stepStartTime != null && timing.completedTime != null) {
          nodeLlmMs += Math.max(0, timing.completedTime - timing.stepStartTime);
        }
        if (timing && timing.stepStartTime != null && timing.firstTokenTime != null) {
          nodeTtftMs += Math.max(0, timing.firstTokenTime - timing.stepStartTime);
          nodeTtftSteps++;
        }
        if (timing && timing.firstTokenTime != null && timing.completedTime != null) {
          const decMs = Math.max(0, timing.completedTime - timing.firstTokenTime);
          if (decMs >= 150 && gen > 0) {
            nodeStreamedMs += decMs;
            nodeStreamedTokens += gen;
          }
        }
      }

      if (maxTurn >= 0) {
        for (let idx = 0; idx < nodes.length; idx++) {
          const nd = nodes[idx];
          if (!nd || nd.kind !== "assistant" || nd.turn !== maxTurn) continue;
          lastTurnSteps++;
          const provider = nd.message && nd.message.source ? nd.message.source.provider : void 0;
          const out = nd.usage && typeof nd.usage.outputTokens === "number" && Number.isFinite(nd.usage.outputTokens) ? nd.usage.outputTokens : 0;
          const res = nd.usage && typeof nd.usage.reasoningTokens === "number" && Number.isFinite(nd.usage.reasoningTokens) ? nd.usage.reasoningTokens : 0;
          let gen = out;
          if (res > 0) {
            if (nd.usage.candidateTokens !== void 0) {
              gen = out;
            } else if (provider === "google-antigravity" || res > out) {
              gen = out + res;
            }
          }
          lastTurnGen += gen;
          const timing = nd.timing;
          if (timing && timing.stepStartTime != null && timing.completedTime != null) {
            lastTurnLlmMs += Math.max(0, timing.completedTime - timing.stepStartTime);
          }
          if (timing && timing.firstTokenTime != null && timing.completedTime != null) {
            const decMs = Math.max(0, timing.completedTime - timing.firstTokenTime);
            if (decMs >= 150 && gen > 0) {
              lastTurnStreamedMs += decMs;
              lastTurnStreamedTokens += gen;
            }
          }
        }
      }
    }

    const turns = turnsSet.size || (st ? st.turns : 0);
    const steps = stepCount || (st ? st.steps : 0);
    const llmMs = nodeLlmMs || (st ? st.llmMs : 0);
    const toolMs = nodeToolMs || (st ? st.toolMs : 0);
    const ttftMs = nodeTtftMs || (st ? st.ttftMs : 0);
    const ttftSteps = nodeTtftSteps || (st ? st.ttftSteps : 0);
    const totalGen = nodeTotalGen || (st ? st.decodeTokens : 0);
    const totalReasoning = nodeTotalReasoning;

    let streamedTps = null;
    if (nodeStreamedMs > 0 && nodeStreamedTokens > 0) {
      streamedTps = fmtTps(nodeStreamedTokens / (nodeStreamedMs / 1e3));
    } else if (!nodes && st && st.decodeMs >= 150 && st.decodeTokens > 0) {
      streamedTps = fmtTps(st.decodeTokens / (st.decodeMs / 1e3));
    }

    const effectiveTps = llmMs > 0 && totalGen > 0 ? fmtTps(totalGen / (llmMs / 1e3)) : null;
    const pillTps = streamedTps !== null ? streamedTps : effectiveTps;

    const turnStr = turns === 1 ? "1 turn" : turns + " turns";
    const stepStr = steps === 1 ? "1 step" : steps + " steps";
    const counts = turnStr + " " + stepStr;

    const timeLabel = h(
      import_react.Fragment,
      null,
      counts,
      pillTps !== null ? h(import_react.Fragment, null, h("span", { className: "st-pill-sep st-sep-speed", "aria-hidden": true }, "\u00b7"), h("span", { className: "st-pill-speed" }, pillTps + " tok/s")) : null
    );
    const total = usage ? billedInput(usage) + (usage.outputTokens || 0) : 0;
    const hit = usage ? cacheHitPct(usage) : null;
    const usageLabel = h(
      import_react.Fragment,
      null,
      fmtTokCompact(total) + " tok",
      hit !== null ? h(import_react.Fragment, null, h("span", { className: "st-pill-sep st-sep-cache", "aria-hidden": true }, "\u00b7"), h("span", { className: "st-pill-cache" }, "Cache hit " + hit + "%")) : null
    );
    let lastTurnRow = null;
    if (lastTurnSteps > 0) {
      let speedStr = null;
      if (lastTurnStreamedMs > 0 && lastTurnStreamedTokens > 0) {
        speedStr = fmtTps(lastTurnStreamedTokens / (lastTurnStreamedMs / 1e3)) + " tok/s (streamed)";
      } else if (lastTurnLlmMs > 0 && lastTurnGen > 0) {
        speedStr = fmtTps(lastTurnGen / (lastTurnLlmMs / 1e3)) + " tok/s (model time)";
      }
      if (speedStr !== null) {
        lastTurnRow = ["Last turn (" + lastTurnSteps + " " + (lastTurnSteps === 1 ? "step" : "steps") + ")", speedStr];
      }
    }
    const timeRows = [
      llmMs > 0 ? ["LLM time", fmtDur(llmMs)] : null,
      toolMs > 0 ? ["Tool time", fmtDur(toolMs)] : null,
      ttftSteps > 0 ? ["Avg time to first token (TTFT)", fmtDur(ttftMs / ttftSteps)] : null,
      streamedTps !== null
        ? ["Streaming speed (streamed text)", streamedTps + " tok/s"]
        : (steps > 0 ? ["Streaming speed", "N/A (unstreamed tool calls)"] : null),
      effectiveTps !== null ? ["Effective speed (model time)", effectiveTps + " tok/s"] : null,
      totalReasoning > 0 ? ["Thinking / reasoning", exactNum(totalReasoning) + " tok"] : null,
      lastTurnRow
    ].filter(Boolean);
    const usageRows = usage ? [
      hit !== null ? ["Cache hit", hit + "%"] : null,
      ["Uncached input", exactNum(usage.uncachedInputTokens || 0)],
      ["Cached input", exactNum(usage.cacheReadTokens || 0)],
      usage.cacheWriteTokens ? ["Cache write", exactNum(usage.cacheWriteTokens)] : null,
      ["Output", exactNum(usage.outputTokens || 0)]
    ].filter(Boolean) : [];
    return h(
      "div",
      { className: "st-pills", "data-save-token-stats": true },
      h(StatsDialog, {
        open: openPill === "time",
        setOpen: function(open) {
          setOpenPill(open ? "time" : null);
        },
        anchorClass: "st-pill-time",
        icon: h("span", { className: "st-icon-speed", style: { color: "#e2681c", display: "inline-flex" } }, h(import_primitives.IconGaugeOutlineRegular, {})),
        label: timeLabel,
        title: "Session statistics",
        value: null,
        rows: timeRows
      }),
      hasUsage ? h("span", { className: "st-pill-junction", "aria-hidden": true }, "\u00b7") : null,
      hasUsage ? h(StatsDialog, {
        open: openPill === "usage",
        setOpen: function(open) {
          setOpenPill(open ? "usage" : null);
        },
        anchorClass: "st-pill-usage",
        icon: h(import_primitives.IconDatabaseOutlineRegular, {}),
        label: usageLabel,
        title: "Token usage",
        value: exactNum(total) + " tok",
        rows: usageRows
      }) : null
    );
  }
  ctx.slots.inject("conversation.composer.dock", function() {
    ctx.slots.register(
      { name: "conversation.composer.dock", id: "save-token-strip", order: 85 },
      function(props) {
        return h(Strip, { sessionId: props && props.sessionId });
      }
    );
  });
}

return module.exports; } });
