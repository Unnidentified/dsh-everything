window.__ModuleLoader__.load({
  id: "dsh-plugin-theme-tuner",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var SRCERY = {
      bg: "#1c1b19", fg: "#fce8c3",
      red: "#ef2f27", green: "#519f50", yellow: "#fbb829",
      blue: "#2c78bf", magenta: "#e02c6d", cyan: "#0aaeb3",
      gray: "#918175", lightgray: "#baa67f",
      brightRed: "#f75341", brightGreen: "#98bc37", brightYellow: "#fed06e",
      brightBlue: "#68a8e4", brightMagenta: "#ff5c8f", brightCyan: "#2be4d0"
    };
    var layer1 = "#221f1b", layer2 = "#2a251f", layer3 = "#332d25", overlay = "#2e2822";
    var tokens = {};
    function def(name, light, dark) { tokens[name] = { light: light, dark: dark }; }
    def("--dsw-alias-bg-base", "#ffffff", SRCERY.bg);
    def("--dsw-alias-bg-layer-1", "#f7f7f8", layer1);
    def("--dsw-alias-bg-layer-2", "#f1f1f3", layer2);
    def("--dsw-alias-bg-layer-3", "#e9e9ec", layer3);
    def("--dsw-alias-bg-overlay", "#ffffff", overlay);
    def("--dsw-specific-menu", "#fffffff2", overlay + "f2");
    def("--dsw-alias-interactive-bg-hover", "#0000000a", "#ffffff14");
    def("--dsw-alias-interactive-bg-active", "#00000014", "#ffffff1f");
    def("--dsw-alias-label-primary", "#111111", SRCERY.fg);
    def("--dsw-alias-label-secondary", "#4b4b4b", SRCERY.lightgray);
    def("--dsw-alias-label-tertiary", "#6b6b6b", SRCERY.gray);
    def("--dsw-alias-label-caption", "#8a8a8a", "#918175");
    def("--dsw-alias-label-dimmed", "#9a9a9a", "#7d7466");
    def("--dsw-alias-brand-primary", "#2563eb", SRCERY.yellow);
    def("--dsw-alias-brand-text", "#ffffff", SRCERY.bg);
    def("--dsw-alias-button-primary-fill", "#2563eb", SRCERY.yellow);
    def("--dsw-alias-button-primary-hover", "#1d4fd8", SRCERY.brightYellow);
    def("--dsw-alias-button-primary-dimmed", "#93b4f5", "#8a6a14");
    def("--dsw-alias-button-info-fill", "var(--dsw-static-deepseek-500)", "#2A2526");
    def("--dsw-alias-button-info-hover", "var(--dsw-static-deepseek-400)", "#3a3430");
    def("--dsw-alias-border-l1", "#00000014", "#fbb82914");
    def("--dsw-alias-border-l2", "#00000029", "#fbb82926");
    def("--dsw-alias-border-l3", "#0000003d", "#fbb8293d");
    def("--dsw-alias-link", "#2563eb", SRCERY.brightBlue);
    def("--dsw-alias-state-success-primary", "#16a34a", SRCERY.brightGreen);
    def("--dsw-alias-state-error-primary", "#dc2626", SRCERY.brightRed);
    def("--dsw-alias-state-warn-primary", "#d97706", SRCERY.yellow);
    var styled = false;
    function ensureStyles() {
      if (styled || typeof document === "undefined") return;
      const el = document.createElement("style");
      el.setAttribute("data-theme-tuner", "");
      /* App-wide selection inversion. DSH ships no ::selection rule for the
         transcript, so Chromium paints the OS accent there; under a Graphite
         accent that is a light gray behind Srcery's cream text, 1.34:1 and
         effectively unreadable. The composer card already used a cream/dark
         inversion — make that the global one (14.4:1, legible in both themes).
         !important is deliberate (user-confirmed requirement): the only other
         ::selection rules DSH ships are the document preview's
         `.vLRxma_text ::selection` (0,1,1) and the xterm accessibility tree,
         which outrank a bare pseudo-element whatever the injection order — and
         cream on dark text is legible on those surfaces too, so nothing is lost. */
      /* The question card's "Recommended" pill. DSH paints it with
         background:--dsw-specific-sidebar-nav-item-active-accent and
         color:--dsw-alias-button-info-fill — a token this plugin already
         repurposes for the send/stop button (#2A2526 in dark). The pill
         therefore became near-black on the dark #353638 accent: 1.25:1, the
         unreadable badge. Its own rule is a bare hashed `.y21zpG_badge`
         (0,1,0), so these two (0,2,0)/(0,2,1) selectors win without
         !important. Anchored on the *local* class names: the hash is
         build-time, and `_badge` alone is ambiguous (DSH ships six distinct
         `*_badge` hashes, e.g. plan-review, sidebar), while `_optionLine` is
         unique to this composer. Static deepseek tokens are used on purpose:
         they are outside the alias layer this plugin overrides, and their
         values are the legible ones here — deepseek-400 on the dark accent
         (5.20:1, exactly what stock DSH intends) and deepseek-600 in light
         (4.57:1, up from the stock 3.60:1). */
      el.textContent = ".yhfFVG_primary:disabled{opacity:1 !important}\n.yhfFVG_primary:disabled svg{opacity:.45}\n.yhfFVG_primary:not(:disabled){color:#1c1b19 !important}\n.yhfFVG_primary:not(:disabled){background:#d5c2a0 !important}\n.yhfFVG_primary:hover:not(:disabled){background:#e0cdb0 !important}\n::selection{background:#fce8c3 !important;color:#1c1b19 !important}\n[class*=\"_optionLine\"]>[class*=\"_badge\"]{color:var(--dsw-static-deepseek-600,#4868b2)}\nbody[data-ds-dark-theme] [class*=\"_optionLine\"]>[class*=\"_badge\"]{color:var(--dsw-static-deepseek-400,#7aaaff)}";
      document.head.appendChild(el);
      styled = true;
    }
    var inject = ["theme"];
    function apply(ctx) {
      ensureStyles();
      ctx.effect(function () {
        return ctx.theme.overrideTokens("theme-tuner", tokens);
      }, "theme-tuner: srcery layer");
    }
    exports.apply = apply;
    exports.inject = inject;
    exports.name = "theme-tuner";
    return module.exports;
  }
});
