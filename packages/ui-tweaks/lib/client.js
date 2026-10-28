/**
 * dsh-client-ui-tweaks — browser half.
 *
 * All DOM interaction lives here: edit buttons, the inline editor, fork-on-send,
 * `‹ n/N ›` branch arrows, sidebar family-row merging, auto-title triggering, and the
 * pixel shimmer effect. Mounted as one ModuleLoader file with independent sections —
 * each section guards its own mount so one failure never takes the others down.
 */
window.__ModuleLoader__.load({
  id: "dsh-client-ui-tweaks",
  factory: () => {
    const NS = "edit-resend";
    const BTN_ATTR = "data-edit-resend-btn";
    const NAV_ATTR = "data-edit-resend-nav";
    const EDITOR_ATTR = "data-edit-resend-editor";
    const PROCESSED_ATTR = "data-edit-resend-processed";
    const HIDDEN_ATTR = "data-er-swap-hidden";
    const COPY_LABELS = new Set(["复制", "已复制", "Copy", "Copied", "copy", "copied"]);
    const zh = typeof navigator !== "undefined" && (navigator.language || "en").toLowerCase().startsWith("zh");
    const t = (key) => ({
      edit: zh ? "编辑" : "Edit",
      prevBranch: zh ? "上一个分支" : "Previous branch",
      nextBranch: zh ? "下一个分支" : "Next branch",
      send: zh ? "发送" : "Send",
      cancel: zh ? "取消" : "Cancel",
      attach: zh ? "添加图片" : "Attach images",
      remove: zh ? "移除" : "Remove",
      unchanged: zh ? "没有改动" : "Nothing changed yet",
      sendHint: zh ? "Enter 保存 · Shift+Enter 换行 · Esc 取消" : "Enter to save · Shift+Enter for a new line · Esc to cancel",
      reveal: zh ? "在访达中显示" : "Reveal in Finder",
      revealMissing: zh ? "找不到该路径" : "Path not found",
      revealNearest: zh ? "未找到，已打开最近的真实目录" : "Not found — opened nearest folder",
      revealUnavailable: zh ? "此窗口不支持访达定位" : "Finder reveal unavailable",
    })[key] ?? key;

    const STYLE = `
      /* Hide feedback (like / dislike) buttons completely */
      [data-slot-id="feedback"],
      ._8_XoUG_action,
      button[aria-label="Good response"],
      button[aria-label="Bad response"],
      button[aria-label="好评"],
      button[aria-label="差评"] {
        display: none !important;
      }
      /* The action row is icon-only by design: the hover label DSH renders for these
         toggles (Copy, Branch, and any plugin tooltip mounted into the same row)
         would only restate the icon, so the bubble is suppressed here. Every button
         keeps its aria-label, so the names stay available to assistive tech. */
      [data-chat-flow-kind] [class*="_actions"] [role="tooltip"] {
        display: none !important;
      }
      [${BTN_ATTR}] {
        display: inline-flex; align-items: center; justify-content: center;
        width: 24px; height: 24px; padding: 0; border: none; border-radius: 6px;
        background: transparent; color: inherit; opacity: 0.55; cursor: pointer;
        flex: none;
      }
      [${BTN_ATTR}]:hover { opacity: 1; background: rgba(127, 127, 127, 0.18); }
      [${BTN_ATTR}]:focus-visible { opacity: 1; outline: 2px solid currentColor; outline-offset: 1px; }
      [${BTN_ATTR}] svg { width: 15px; height: 15px; display: block; }
      [${NAV_ATTR}] {
        display: inline-flex; align-items: center; gap: 2px; flex: none;
        opacity: 0.75; font-size: 11px; line-height: 1;
        font-variant-numeric: tabular-nums; color: inherit;
      }
      [${NAV_ATTR}] button {
        display: inline-flex; align-items: center; justify-content: center;
        width: 18px; height: 18px; padding: 0; border: none; border-radius: 5px;
        background: transparent; color: inherit; cursor: pointer; font-size: 13px;
        line-height: 1; opacity: 0.8;
      }
      [${NAV_ATTR}] button:hover:not(:disabled) { opacity: 1; background: rgba(127, 127, 127, 0.18); }
      [${NAV_ATTR}] button:disabled { opacity: 0.25; cursor: default; }
      [${NAV_ATTR}] [data-er-nav-label] { min-width: 30px; text-align: center; user-select: none; }

      /* The editor *is* the message bubble, in place and editable. Every value here
         is the rule DSH uses for a rendered user message, so opening an edit looks
         like the bubble becoming writable rather than a different control appearing:
         same --dsw-specific-bubble fill, --dsw-radius-xl corner, 10px/16px padding,
         same content font, and the same right-aligned column width as userStack.
         Only the focus ring and the action row are additions. */
      [${EDITOR_ATTR}] {
        display: flex; flex-direction: column; gap: 6px;
        width: 100%;
        max-width: min(calc(var(--dsh-chat-content-width, 748px) * .702), 82%);
        align-self: flex-end;
        box-sizing: border-box;
        margin: 0;
        padding: 10px 16px;
        border: none;
        border-radius: var(--dsw-radius-xl);
        background: var(--dsw-specific-bubble);
        color: var(--dsw-alias-label-primary);
        transition: box-shadow .12s ease;
      }
      /* Focus is shown as a ring rather than a border swap, so the bubble never
         changes size when the editor gains focus. */
      [${EDITOR_ATTR}]:focus-within {
        box-shadow: 0 0 0 1.5px var(--dsw-alias-brand-primary);
      }
      [${EDITOR_ATTR}][data-er-dropping] {
        box-shadow: 0 0 0 1.5px var(--dsw-alias-brand-primary),
                    0 0 0 5px var(--dsw-alias-interactive-bg-hover);
      }
      [${EDITOR_ATTR}] textarea {
        width: 100%; border: none; outline: none; resize: none;
        background: transparent; color: inherit;
        font-size: var(--dsh-content-font-size, 14px);
        line-height: calc(22px + var(--dsh-content-font-delta, 0px));
        font-family: inherit;
        min-height: 22px; max-height: 40vh; overflow-y: auto;
        padding: 0; margin: 0;
        white-space: pre-wrap; word-break: break-word;
      }
      [${EDITOR_ATTR}] [data-er-toolbar] {
        display: flex; justify-content: flex-end; align-items: center; gap: 8px;
      }
      /* Cancel/send follow the active theme rather than fixed colours: the same
         tokens DSH's own primary button uses, and DSH's own danger idiom (a local
         re-map of the primary tokens onto the error token) for cancel. */
      [${EDITOR_ATTR}] [data-er-round] {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; border: none; border-radius: 50%;
        cursor: pointer; flex: none;
        background: var(--dsw-alias-button-primary-fill);
        color: var(--dsw-alias-label-primary-foreground);
      }
      [${EDITOR_ATTR}] [data-er-round="send"]:hover { background: var(--dsw-alias-button-primary-hover); }
      [${EDITOR_ATTR}] [data-er-round="cancel"] {
        --dsw-alias-button-primary-fill: var(--dsw-alias-state-error-primary);
        --dsw-alias-button-primary-hover: var(--dsw-alias-state-error-primary);
      }
      [${EDITOR_ATTR}] [data-er-round] svg { width: 14px; height: 14px; display: block; }

      /* The clock beside a message ("22:44") is chrome, not content: DSH emits it as
         <span class="{hash}_timeStart"> and <span class="{hash}_timeEnd">. Match on the
         stable suffix, because the hash prefix changes on every frontend rebuild. */
      [class*="_timeStart"], [class*="_timeEnd"] {
        user-select: none; -webkit-user-select: none;
      }

      /* Chrome text is not document content: a chip, a chip label, a timestamp or a
         counter should never become a text selection when a click turns into a drag.
         Match by role and element type rather than by hashed CSS-module class, so a
         frontend rebuild cannot silently disable this. */
      button, [role="button"], [role="tab"], [role="menuitem"], [role="option"],
      [role="treeitem"], [role="switch"], [role="checkbox"], time, summary,
      [data-composer-dock] span, [data-turn-tail] span {
        user-select: none; -webkit-user-select: none;
      }
      /* Real content stays selectable: the reply body, code, and any editable field.
         Stated explicitly so the rule above cannot be inherited into a message. */
      .markdown, .markdown *, [class*="markdown"], [class*="markdown"] *,
      pre, pre *, code, code *, [contenteditable], [contenteditable] *,
      textarea, input, .st-dialog, .st-dialog * {
        user-select: text; -webkit-user-select: text;
      }

      [data-er-hidden] { display: none !important; }

      [data-er-optimistic] {
        align-self: flex-end; max-width: 85%;
        padding: 8px 12px; margin: 4px 0;
        border-radius: 14px;
        background: var(--dsw-alias-interactive-bg-active);
        line-height: 1.5; white-space: pre-wrap; word-break: break-word;
      }
      [data-er-optimistic-images] {
        align-self: flex-end; display: flex; flex-wrap: wrap; gap: 6px;
        margin: 4px 0; max-width: 85%; justify-content: flex-end;
      }
      [data-er-optimistic-images] img {
        width: 56px; height: 56px; object-fit: cover;
        border-radius: 8px; display: block;
      }
      [data-er-processing] {
        align-self: flex-end; font-size: 12px; opacity: 0.7;
        padding: 2px 4px; user-select: none;
        animation: er-shimmer 1.2s ease-in-out infinite;
      }
      @keyframes er-shimmer {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 0.85; }
      }
      [${EDITOR_ATTR}] [data-er-round]:disabled { opacity: 0.45; cursor: default; }
      [${EDITOR_ATTR}] [data-er-attach] {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; padding: 0; border: none; border-radius: 50%;
        background: transparent; color: inherit; opacity: 0.6; cursor: pointer; flex: none;
      }
      [${EDITOR_ATTR}] [data-er-attach]:hover { opacity: 1; background: rgba(127, 127, 127, 0.18); }
      [${EDITOR_ATTR}] [data-er-attach] svg { width: 15px; height: 15px; display: block; }
      /* Matches the message's own attachment row: wrapped, right-aligned, 8px gap. */
      [${EDITOR_ATTR}] [data-er-strip] {
        display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px;
        max-width: 100%;
      }
      [${EDITOR_ATTR}] [data-er-chip] {
        position: relative; width: 56px; height: 56px;
        border-radius: var(--dsw-radius-lg); overflow: hidden; flex: none;
        background: var(--dsw-specific-input-major, rgba(127, 127, 127, 0.15));
      }
      [${EDITOR_ATTR}] [data-er-chip] img { width: 100%; height: 100%; object-fit: cover; display: block; }
      [${EDITOR_ATTR}] [data-er-chip][data-er-chip-original] {
        box-sizing: border-box; border: 1.5px dashed rgba(127, 127, 127, 0.85);
      }
      [${EDITOR_ATTR}] [data-er-chip] [data-er-chip-name] {
        position: absolute; left: 0; right: 0; bottom: 0; padding: 1px 3px;
        font-size: 9px; line-height: 1.2; background: rgba(0, 0, 0, 0.55); color: #fff;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      [${EDITOR_ATTR}] [data-er-chip] [data-er-chip-x] {
        position: absolute; top: 0; right: 0; width: 15px; height: 15px; padding: 0;
        border: none; border-radius: 50%; cursor: pointer; line-height: 1;
        background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 11px;
        display: inline-flex; align-items: center; justify-content: center;
      }
      [${EDITOR_ATTR}] [data-er-toolbar] [data-er-spacer] { flex: 1; }
      /* Keyboard/mouse hint sits at the left of the action row: present when
         wanted, quiet enough not to compete with the message itself. */
      [${EDITOR_ATTR}] [data-er-hint] {
        font-size: 11px; line-height: 1;
        color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
        margin-right: auto; white-space: nowrap;
        opacity: .75; pointer-events: none;
      }
      @media (max-width: 620px) {
        [${EDITOR_ATTR}] [data-er-hint] { display: none; }
      }
      [${EDITOR_ATTR}] input[type="file"] { display: none; }

      /* Path mentions: clicking one reveals it in Finder. The pointer cursor is
         scoped to rendered message content only while the pointer is actually over
         a detected path, so nothing inside React's tree is ever rewritten. */
      html[data-er-path-hover] [data-chat-flow-key],
      html[data-er-path-hover] [data-chat-flow-kind],
      html[data-er-path-hover] [data-chat-anchor-key],
      html[data-er-path-hover] [class*="_markdown"] { cursor: pointer; }
      #dsh-path-reveal-hint {
        position: fixed; z-index: 2147483000; pointer-events: none;
        max-width: 60vw; padding: 3px 7px; border-radius: 6px;
        font-size: 11px; line-height: 1.35; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
        background: rgba(20, 20, 22, 0.92); color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
        opacity: 0; transition: opacity 90ms ease;
      }
      #dsh-path-reveal-hint[data-er-visible="1"] { opacity: 1; }

      /* ── Composer dock: match the context ring to the stats pills ──────────
         The ring (ContextMeter) sizes its label at --dsh-content-font-size-secondary
         (13px) and inherits the default font stack, while the neighbouring stats
         pills (StatsPills) subtract 1px and sit in the secondary line-height. Next
         to each other the ring reads a full step larger. Both are dock furniture at
         the same visual level, so pin the ring's label to the pills' scale.
         Selector is the ring's own trigger inside the dock: its hashed class
         ends in _trigger and only its aria-label carries a percent sign, so
         the usage pill ("... Cache hit 98%", class _pill) cannot match.
         Specificity (0,3,1) also beats core's single-class rule. */
      [data-composer-dock] button[class*="_trigger"][aria-label*="%"] {
        font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px) !important;
        line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px)) !important;
        font-variant-numeric: tabular-nums;
      }
    
      /* ---- 1017 release pill on the Merge models ----------------------------
         Core draws this marker as a Tag, tone "info". Copied rule-for-rule
         from the shipped stylesheet so it is pixel-identical rather than
         approximated:

           ._tag{display:inline-flex;align-items:center;border-radius:999px;
                 corner-shape:round;padding:1px 8px;font-size:11px;
                 line-height:17px;font-weight:500;white-space:nowrap}
           ._tag[data-tone=info]{
                 background:color-mix(in srgb,
                   var(--dsw-alias-state-business-primary) 10%,transparent);
                 color:var(--dsw-alias-state-business-primary)}

         Done in CSS rather than by registering a model.label contribution:
         that slot is kind "single" with empty registerOptions, so a second
         registrant REPLACES core's pill instead of composing with it. A style
         rule can only add a pseudo-element, so the official marker survives.

         The stock pill is a sibling span in a flex row with gap:4px; a
         pseudo-element cannot use flex gap, so the same 4px is a margin. */
      [data-model-id$="v4.1-flash-1017"]::after {
        content: "1017";
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        corner-shape: round;
        padding: 1px 8px;
        font-size: 11px;
        line-height: 17px;
        font-weight: 500;
        white-space: nowrap;
        margin-left: 4px;
        vertical-align: baseline;
        background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
        color: var(--dsw-alias-state-business-primary);
      }
`;

    function splitContent(content) {
      const texts = [];
      const attachments = [];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
          else if (block.type === "image" && block.attachment !== undefined) attachments.push({ kind: "image", desc: block.attachment });
          else if (block.type === "file" && block.attachment !== undefined) attachments.push({ kind: "file", desc: block.attachment });
        }
      }
      return { text: texts.join(""), attachments };
    }

    /**
     * Fallback source for a message's images: the blobs DSH already rendered into the
     * row. Used only when the session read yields nothing, so an unavailable read API
     * cannot silently strip a message's images. Icons are filtered out by scheme,
     * size, and SVG exclusion, so only real attachments qualify.
     * @param row - The rendered message row.
     * @returns Readable image files, in DOM order.
     */
    async function readRowImageFiles(row) {
      const files = [];
      if (!row || typeof row.querySelectorAll !== "function") return files;
      for (const img of row.querySelectorAll("img")) {
        const src = img.currentSrc || img.src || "";
        if (!/^(blob:|data:image\/)/.test(src)) continue;
        try {
          const blob = await fetch(src).then((response) => response.blob());
          if (!blob || !blob.type.startsWith("image/") || blob.type === "image/svg+xml") continue;
          if (blob.size < 512) continue;
          const name = String(img.alt || "").trim() || `image-${files.length + 1}`;
          files.push(new File([blob], name.slice(0, 120), { type: blob.type }));
        } catch { /* not fetchable — skip it */ }
      }
      return files;
    }

    /**
     * Read a message's attachment bytes back into `File` objects, filtered by kind.
     * Shared by the inline editor (which must display the images a message already
     * carries) and the resend path (which must still forward non-image attachments).
     * @param attachments - Entries produced by `splitContent`.
     * @param kinds - Attachment kinds to include, e.g. `["image"]`.
     * @returns Readable files in message order; unreadable entries are skipped.
     */
    async function readMessageAttachmentFiles(attachments, kinds) {
      const files = [];
      if (!Array.isArray(attachments) || attachments.length === 0) return files;
      const binding = currentBinding();
      const sourceSession = (() => {
        try { return binding ? ctx.sessions.binding(binding.key)?.session : undefined; } catch { return undefined; }
      })();
      for (const attachment of attachments) {
        if (!kinds.includes(attachment.kind)) continue;
        try {
          const desc = attachment.desc ?? {};
          const attachmentId = desc.attachmentId ?? desc.id ?? desc.key;
          if (!attachmentId || typeof sourceSession?.readAttachment !== "function") continue;
          const result = await sourceSession.readAttachment(attachmentId);
          if (!result?.ok || !result.value) continue;
          const mediaType = result.value.attachment?.mediaType || desc.mediaType || "application/octet-stream";
          const name = desc.name || (attachment.kind === "image" ? "image.png" : "attachment");
          const bytes = Uint8Array.from(result.value.data ?? []);
          if (bytes.length === 0) continue;
          files.push(new File([bytes], name, { type: mediaType }));
        } catch { /* unreadable attachment — skip it */ }
      }
      return files;
    }

    function pencilSvg() {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.3 2.3a1.7 1.7 0 0 1 2.4 2.4l-7.9 7.9-3.1.7.7-3.1 7.9-7.9Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.8 3.8l2.4 2.4" stroke="currentColor" stroke-width="1.3"/></svg>';
    }

    function arrowUpSvg() {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 12V3M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    function crossSvg() {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    }

    function imageSvg() {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3.2" width="12" height="9.6" rx="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="5.8" cy="6.6" r="1.1" stroke="currentColor" stroke-width="1.1"/><path d="M2.6 11.4l3.2-3 2.6 2.4 2-1.7 3 2.7" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    }

    /** Image MIME types DSH accepts inline in a prompt (dsh-attachment-local limits). */
    const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    /** Per-message image budget shared with the host's attachment limits. */
    const MAX_EDITOR_IMAGES = 20;

    /**
     * Whether a picked file can ride a prompt as an inline image. Non-images would
     * need a staged upload receipt, which the edit path cannot bind to the child.
     * @param file - Browser file from the picker, paste, or a drop.
     * @returns true when the file is an accepted image type.
     */
    function isImageFile(file) {
      return typeof file?.type === "string" && IMAGE_MEDIA_TYPES.has(file.type.toLowerCase());
    }

    return {
      inject: ["uiSession", "sessions", "conversation", "locale", "workspaces", "uiWorkspace"],
      /**
       * Mount every UI section.
       * @param ctx - Client plugin context (uiSession, sessions, conversation, locale, workspaces).
       * @returns {void}
       */
      apply(ctx) {
        try {
          const locale = ctx.get ? ctx.get("locale") : undefined;
          if (locale?.register) {
            ctx.effect(() => locale.register(NS, {
              zh: {
                edit: "编辑", attach: "添加图片", remove: "移除",
                generalChat: "通用对话", generalChatHint: "无需工作区的对话",
                reveal: "在访达中显示", revealMissing: "找不到该路径",
                revealNearest: "未找到，已打开最近的真实目录", revealUnavailable: "此窗口不支持访达定位",
              },
              en: {
                edit: "Edit", attach: "Attach images", remove: "Remove",
                generalChat: "General", generalChatHint: "Chat without a workspace",
                reveal: "Reveal in Finder", revealMissing: "Path not found",
                revealNearest: "Not found — opened nearest folder", revealUnavailable: "Finder reveal unavailable",
              },
            }), "edit-resend: dictionaries");
          }
        } catch { /* no locale service — the t() fallback below covers copy */ }

        const styleEl = document.createElement("style");
        styleEl.textContent = STYLE;
        document.head.appendChild(styleEl);
        ctx.effect(() => () => styleEl.remove(), "edit-resend: styles");

        function currentBinding() {
          try {
            const binding = ctx.uiSession.adapter.current.getSnapshot();
            return binding && binding.key ? binding : null;
          } catch {
            return null;
          }
        }

        function chatSnapshot(binding) {
          try { return binding.hooks?.chat?.getSnapshot?.(); } catch { return undefined; }
        }

        function resolveNodeByKey(byKey, key) {
          if (!byKey) return undefined;
          if (typeof byKey.get === "function") {
            const fromMap = byKey.get(key);
            if (fromMap !== undefined) return fromMap;
          }
          return byKey[key];
        }

        function userMessageNodes(binding) {
          const snapshot = chatSnapshot(binding);
          if (!snapshot || !Array.isArray(snapshot.order) || !snapshot.nodes?.byKey) return [];
          return snapshot.order
            .filter((key) => typeof key === "string" && key.includes("input-message"))
            .map((key) => resolveNodeByKey(snapshot.nodes.byKey, key))
            .filter(Boolean)
            .filter((node) => {
              const kind = node?.kind ?? node?.data?.kind;
              return kind === "user" || kind === "steering";
            });
        }

        /**
         * Probe text for a message node: body plus attachment names, so attachment-only
         * messages can still be matched.
         * @param candidate - Chat snapshot node.
         * @returns {string} Normalized probe text.
         */
        function nodeProbeText(candidate) {
          const { text, attachments } = splitContent(candidate?.data?.content);
          const names = attachments.map((a) => a?.desc?.name).filter((n) => typeof n === "string");
          return `${text} ${names.join(" ")}`.replace(/\s+/g, " ").trim();
        }

        // Text matching only: index alignment breaks when context messages interleave,
        // and a button on the wrong message is worse than no button at all.
        function locateNode(row, nodes) {
          const rowText = (row.textContent ?? "").replace(/\s+/g, " ").trim();
          if (rowText.length < 12) return undefined;
          return nodes.find((candidate) => {
            const probe = nodeProbeText(candidate);
            return probe !== "" && (rowText.includes(probe.slice(0, Math.min(60, probe.length))) || probe.includes(rowText.slice(0, Math.min(60, rowText.length))));
          });
        }

        let branchCache = { at: 0, records: [], titles: {} };
        async function loadBranches(force = false) {
          if (!force && branchCache.at > 0 && Date.now() - branchCache.at < 4000) {
            return branchCache.records;
          }
          try {
            const response = await fetch("/edit-resend-branches");
            const body = await response.json();
            branchCache = {
              at: Date.now(),
              records: Array.isArray(body?.branches) ? body.branches : [],
              titles: body?.titles && typeof body.titles === "object" ? body.titles : {},
            };
          } catch { /* fetch/parse failure — keep the previous cache */ }
          return branchCache.records;
        }

        async function postBranch(record) {
          try {
            await fetch("/edit-resend-branches", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ record }),
            });
            branchCache.at = 0;
          } catch { /* write failed — next load re-reads the old store */ }
        }

        function liveChildIds() {
          try {
            const snapshot = ctx.sessions.list.getSnapshot();
            const ids = new Set();
            const collect = (value) => {
              if (!value) return;
              if (Array.isArray(value)) {
                for (const v of value) {
                  const id = v?.sessionId ?? v?.id ?? v;
                  if (typeof id === "string") ids.add(id);
                }
              } else if (typeof value === "object") {
                for (const v of Object.values(value)) {
                  const id = v?.sessionId ?? v?.id;
                  if (typeof id === "string") ids.add(id);
                }
              }
            };
            collect(snapshot?.byId);
            collect(snapshot?.items);
            collect(snapshot?.summaries);
            collect(snapshot);
            return ids.size > 0 ? ids : null;
          } catch {
            return null;
          }
        }

        function computeGroups(binding, records) {
          const sessionId = binding.key;
          const groups = [];
          const byAnchor = new Map();
          for (const record of records) {
            if (typeof record?.parentMsgSeq !== "number") continue;
            const key = `${record.parentId}:${record.parentMsgSeq}`;
            if (!byAnchor.has(key)) byAnchor.set(key, []);
            byAnchor.get(key).push(record);
          }
          const live = liveChildIds();
          for (const siblings of byAnchor.values()) {
            siblings.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
            const filtered = live ? siblings.filter((record) => live.has(record.childId)) : siblings;
            if (filtered.length === 0) continue;
            const parentId = filtered[0].parentId;
            const parentMsgSeq = filtered[0].parentMsgSeq;
            const anchorSeq = filtered[0].anchorSeq;
            const versions = [parentId, ...filtered.map((record) => record.childId)];
            let currentIndex = -1;
            if (sessionId === parentId) currentIndex = 0;
            else {
              const rank = filtered.findIndex((record) => record.childId === sessionId);
              if (rank >= 0) currentIndex = rank + 1;
            }
            if (currentIndex >= 0) {
              groups.push({ parentId, parentMsgSeq, anchorSeq, versions, currentIndex });
            }
          }
          return groups;
        }

        /**
         * Walk branch records upward to the root session id and the record this session forked from.
         * @param id - Session id.
         * @param records - Branch records.
         * @returns {{rootId: string, record: object|null}} Root id plus the nearest ancestor record, if any.
         */
        function rootOf(id, records) {
          let cur = id;
          let rec = null;
          for (let g = 0; g < 12; g++) {
            const r = records.find((x) => x.childId === cur);
            if (!r) break;
            rec = r;
            cur = r.parentId;
          }
          return { rootId: cur, record: rec };
        }

        /**
         * Seq of the "branch version" message in the current session: for fork branches the
         * first new user message after the anchor; for create branches the first user message.
         * @param binding - Current session binding.
         * @param branchRec - The branch record for this session.
         * @returns {number|null} Message seq, or null when undetermined.
         */
        function branchVersionSeq(binding, branchRec) {
          if (!branchRec) return null;
          const nodes = userMessageNodes(binding);
          if (branchRec.anchorSeq == null) {
            return nodes[0]?.data?.seq ?? nodes[0]?.anchorSeq ?? null;
          }
          const firstNew = nodes.find((n) => {
            const s = n?.data?.seq ?? n?.anchorSeq;
            return typeof s === "number" && s > branchRec.anchorSeq;
          });
          return firstNew?.data?.seq ?? firstNew?.anchorSeq ?? null;
        }

        function navElement(group, onSwitch) {
          const wrap = document.createElement("span");
          wrap.setAttribute(NAV_ATTR, "1");
          const makeBtn = (glyph, ariaLabel, delta) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = glyph;
            // No title: the arrow toggle stays label-free on hover like the rest of the
            // action row; aria-label carries the name for assistive tech.
            btn.setAttribute("aria-label", ariaLabel);
            const target = group.currentIndex + delta;
            btn.disabled = target < 0 || target >= group.versions.length;
            btn.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              onSwitch(target);
            });
            return btn;
          };
          const label = document.createElement("span");
          label.setAttribute("data-er-nav-label", "1");
          label.textContent = `${group.currentIndex + 1}/${group.versions.length}`;
          wrap.append(
            makeBtn("‹", t("prevBranch"), -1),
            label,
            makeBtn("›", t("nextBranch"), +1),
          );
          return wrap;
        }

        // Bypass window for arrow switches and internal opens: inside it the
        // "most recent member" redirect stays off.
        let navBypassUntil = 0;

        /**
         * Open a session in the main view. `sessions.open` disappeared in a DSH update
         * (2026-09-26); the current entry is `uiWorkspace.openSession`, with the old call
         * kept as a fallback for pre-update builds.
         * @param sessionId - Session to open.
         * @returns {Promise<void>}
         */
        async function openSession(sessionId) {
          try {
            if (typeof ctx.uiWorkspace?.openSession === "function") {
              ctx.uiWorkspace.openSession(sessionId);
              return;
            }
            await ctx.sessions.open(sessionId);
          } catch { /* open failed — caller tolerates the miss */ }
        }

        async function switchTo(sessionId) {
          navBypassUntil = Date.now() + 3000;
          await openSession(sessionId);
        }

        /**
         * Family members for a session (root plus every branch, including chained-fork descendants).
         * @param id - Session id.
         * @param records - Branch records.
         * @returns {string[]|null} Member ids, or null when the session is not part of a family.
         */
        function familyMembersOf(id, records) {
          const { rootId } = rootOf(id, records);
          const members = new Set([rootId]);
          for (const r of records) {
            if (typeof r?.parentId !== "string" || typeof r?.childId !== "string") continue;
            if (rootOf(r.parentId, records).rootId !== rootId) continue;
            members.add(r.parentId);
            members.add(r.childId);
          }
          if (members.size <= 1) return null;
          return [...members];
        }

        /**
         * The listed family member with the newest updatedAt — "the branch worked on last".
         * @param members - Family member ids.
         * @returns {string|null} The most recent member still in the session list.
         */
        function mostRecentMemberId(members) {
          let byId = {};
          try { byId = ctx.sessions.list.getSnapshot()?.byId ?? {}; } catch { /* snapshot unavailable — treat as empty */ }
          let best = null;
          let bestAt = -1;
          for (const id of members) {
            const summary = byId?.[id];
            if (!summary) continue;
            const at = typeof summary.updatedAt === "number" ? summary.updatedAt : 0;
            if (at >= bestAt) { bestAt = at; best = id; }
          }
          return best;
        }

        // ---------------- sidebar family row merging ----------------
        // dsh sidebar rows carry no session id (only role="treeitem" + title + relative time),
        // but row title and time come straight from the sessions snapshot: displayTitle +
        // timeLabel(updatedAt). timeLabel is replicated from dsh-client-ui-primitives
        // relativeTime (same buckets and locale templates) so (title, time label) pairs map
        // DOM rows back to sessions even when a cold-start title degrades to the cwd name.
        const TIME_UNITS = zh
          ? { now: () => "刚刚", minutes: (n) => `${n}分钟`, hours: (n) => `${n}小时`, days: (n) => `${n}天`, months: (n) => `${n}个月`, years: (n) => `${n}年` }
          : { now: () => "now", minutes: (n) => `${n}min`, hours: (n) => `${n}h`, days: (n) => `${n}d`, months: (n) => `${n}mo`, years: (n) => `${n}y` };

        function timeLabelOf(updatedAt, now) {
          const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
          const diff = Math.max(0, now - updatedAt);
          if (diff < MIN) return TIME_UNITS.now();
          if (diff < HOUR) return TIME_UNITS.minutes(Math.floor(diff / MIN));
          if (diff < DAY) return TIME_UNITS.hours(Math.floor(diff / HOUR));
          if (diff < 30 * DAY) return TIME_UNITS.days(Math.floor(diff / DAY));
          if (diff < 365 * DAY) return TIME_UNITS.months(Math.floor(diff / (30 * DAY)));
          return TIME_UNITS.years(Math.floor(diff / (365 * DAY)));
        }

        function sessionRowsByKey() {
          const map = new Map();
          for (const row of document.querySelectorAll('[role="treeitem"][aria-selected]')) {
            if (row.querySelector('[class*="_projectText"]')) continue;
            const title = row.querySelector('[class*="_title"], [class*="_unreadTitle"]')?.textContent ?? "";
            const time = row.querySelector('[class*="_time"]')?.textContent ?? "";
            if (!title) continue;
            const key = `${title}${time}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(row);
          }
          return map;
        }

        // React fiber bridge: row DOM → session id. Rows carry no id themselves, but
        // SessionNodeItem's props.node.id hangs on the row element's fiber chain — a
        // one-to-one mapping that bypasses (title, time) key collisions entirely.
        // The fiber key is `__reactFiber$<build-hash>`: discover by prefix, never hardcode
        // the hash (the React 16 legacy name is also matched). If a future React changes
        // internals the walk returns null and callers fall back to key matching.
        /**
         * Resolve a sidebar row to its session id through React fiber internals.
         * @param row - Sidebar row element (`role="treeitem"`).
         * @returns {string|null} Session id, or null when fiber introspection is unavailable.
         */
        function sessionIdOfRow(row) {
          try {
            const fiberKey = Object.keys(row).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
            if (!fiberKey) return null;
            let fiber = row[fiberKey];
            for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
              const props = fiber.memoizedProps ?? fiber.pendingProps;
              if (!props || typeof props !== "object") continue;
              // Signature anchor: node.id + onOpen + a rename handler together identify
              // SessionNodeItem. Search-result rows (result/onOpen) and project rows are
              // excluded by this signature, preventing misattribution. The rename prop was
              // renamed onRename -> onRenameRequest in a DSH Desktop update (2026-09-26),
              // so both names are accepted; a future rename needs the same treatment.
              const id = props.node?.id;
              const rename = props.onRename ?? props.onRenameRequest;
              if (typeof id === "string" && typeof props.onOpen === "function" && typeof rename === "function") return id;
            }
          } catch { /* fiber walk failed — caller falls back to key matching */ }
          return null;
        }

        /**
         * Exact sidebar mapping: sessionId → row element. Full coverage when the fiber
         * bridge works; empty map otherwise.
         * @returns {Map<string, Element>} Session id to row element.
         */
        function sessionRowsById() {
          const map = new Map();
          for (const row of document.querySelectorAll('[role="treeitem"][aria-selected]')) {
            if (row.querySelector('[class*="_projectText"]')) continue;
            const id = sessionIdOfRow(row);
            if (id && !map.has(id)) map.set(id, row);
          }
          return map;
        }

        /**
         * Keep one visible sidebar row per branch family: current member > running >
         * just completed > most recent. Orphaned hidden rows are restored.
         * @param records - Branch records.
         * @returns {void}
         */
        function syncBranchRows(records) {
          const claimed = new Set();
          try {
            if (!records.length) return;
            let snap;
            try { snap = ctx.sessions.list.getSnapshot(); } catch { return; }
            const byId = snap?.byId ?? {};
            const current = snap?.current;
            // Group families by rootOf: in a chained fork (A→B→C) B is both child and
            // parent, and grouping by direct parentId would split the family in two.
            const families = new Map();
            for (const record of records) {
              if (typeof record?.parentId !== "string" || typeof record?.childId !== "string") continue;
              const { rootId } = rootOf(record.parentId, records);
              if (!families.has(rootId)) families.set(rootId, new Set());
              families.get(rootId).add(record.parentId);
              families.get(rootId).add(record.childId);
            }
            if (families.size === 0) return;
            const rowsById = sessionRowsById();
            const rowsByKey = rowsById.size === 0 ? sessionRowsByKey() : null; // key matching only when fiber introspection is down
            const now = Date.now();
            for (const [rootId, members] of families) {
              const found = [];
              for (const id of members) {
                const summary = byId[id];
                if (!summary || typeof summary.displayTitle !== "string") continue;
                let row = rowsById.get(id) ?? null;
                if (!row && rowsByKey) {
                  // Fallback: (title, time label) key matching. On key collisions prefer the
                  // row whose selection state matches "this id is the current session".
                  const updatedAt = typeof summary.updatedAt === "number" ? summary.updatedAt : 0;
                  const key = `${summary.displayTitle}${timeLabelOf(updatedAt, now)}`;
                  const bucket = (rowsByKey.get(key) ?? []).filter((candidate) => !claimed.has(candidate));
                  row = bucket.find((candidate) => (candidate.getAttribute("aria-selected") === "true") === (id === current)) ?? bucket[0];
                }
                if (!row || claimed.has(row)) continue;
                claimed.add(row);
                found.push({ id, row, summary });
              }
              if (found.length === 0) continue;
              const chosen = found.find((f) => f.id === current)
                ?? found.find((f) => f.summary.running === true)
                ?? found.find((f) => f.summary.completed === true)
                ?? found.reduce((a, b) => ((b.summary.updatedAt ?? 0) > (a.summary.updatedAt ?? 0) ? b : a));
              for (const f of found) {
                if (f === chosen) {
                  if (f.row.hasAttribute("data-er-hidden")) {
                    f.row.style.display = "";
                    f.row.removeAttribute("data-er-hidden");
                  }
                } else if (!f.row.hasAttribute("data-er-hidden")) {
                  f.row.setAttribute("data-er-hidden", "1");
                  f.row.style.display = "none";
                }
              }
            }
          } finally {
            // Self-heal: a row still carrying the hidden mark but unclaimed this round
            // belongs to a deleted record or a dissolved member — show it again. The
            // finally block runs this on early-return paths too.
            for (const row of document.querySelectorAll('[role="treeitem"][aria-selected][data-er-hidden]')) {
              if (claimed.has(row)) continue;
              row.style.display = "";
              row.removeAttribute("data-er-hidden");
            }
          }
        }

        /**
         * One-time migration: rename branch sessions to the root session's title (dropping
         * old "(n)" numbering) and sync the records. Titles always follow the host-read
         * session-log truth — snapshot displayTitle can degrade to the cwd name.
         * @returns {Promise<void>}
         */
        let migrated = false;
        async function migrateBranchTitles() {
          if (migrated) return;
          const records = await loadBranches(true);
          migrated = true;
          for (const record of records) {
            try {
              const rootTitle = branchCache.titles?.[record.parentId] ?? record.parentTitle;
              if (typeof rootTitle !== "string" || rootTitle.length === 0) continue;
              const childLogTitle = branchCache.titles?.[record.childId];
              if (typeof childLogTitle === "string" && childLogTitle !== rootTitle) {
                let listed = false;
                try { listed = Boolean(ctx.sessions.list.getSnapshot()?.byId?.[record.childId]); } catch { /* list unavailable — skip rename this pass */ }
                if (listed) {
                  const session = ctx.sessions.binding(record.childId)?.session;
                  if (typeof session?.rename === "function") await session.rename(rootTitle);
                }
              }
              if (record.childTitle !== rootTitle || record.parentTitle !== rootTitle) {
                await postBranch({ ...record, parentTitle: rootTitle, childTitle: rootTitle });
              }
            } catch { /* a broken record must not block migration of the rest */ }
          }
        }

        // ---------------- inline editor ----------------
        let activeEditor = null;
        // Latched while an editor is being opened: reading the message's own image
        // attachments is async, and a second click must not interleave with it.
        let editOpening = false;

        function closeActiveEditor(restore = true) {
          if (!activeEditor) return;
          const { row } = activeEditor;
          activeEditor = null;
          const editor = row.querySelector(`[${EDITOR_ATTR}]`);
          if (editor) editor.remove();
          if (restore) {
            for (const el of row.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
              el.style.display = '';
              el.removeAttribute(HIDDEN_ATTR);
            }
          }
        }

        /**
         * Inline editor for one user message: text plus its image attachments.
         * `initialFiles` are the images the message already carries, pre-seeded so an
         * edit starts from them (and can drop individual ones) instead of a blank row.
         * Attachments leave as `File` objects through `onSend(text, files)`.
         * @param initialText - Message text to prefill.
         * @param handlers - `onSend(text, files)`, `onCancel()`, and pre-seeded `initialFiles`.
         * @returns The editor element.
         */
        function buildInlineEditor(initialText, { onSend, onCancel, initialFiles = [] }) {
          const wrap = document.createElement("div");
          wrap.setAttribute(EDITOR_ATTR, "1");

          // Files added here (button, paste, or drop) are appended to whatever the
          // original message carried, so an edit can add images without losing them.
          const picked = [];
          const strip = document.createElement("div");
          strip.setAttribute("data-er-strip", "1");
          // Hidden until something is attached: an empty row would still eat the
          // editor's flex gap.
          strip.style.display = "none";

          let renderStrip = () => {
            strip.textContent = "";
            strip.style.display = picked.length === 0 ? "none" : "flex";
            for (const entry of picked) {
              const chip = document.createElement("div");
              chip.setAttribute("data-er-chip", "1");
              // Images the message already carried are marked so the strip can show
              // them as pre-existing rather than newly attached.
              if (entry.inherited) chip.setAttribute("data-er-chip-original", "1");
              const img = document.createElement("img");
              img.src = entry.previewUrl;
              img.alt = entry.file.name;
              const name = document.createElement("span");
              name.setAttribute("data-er-chip-name", "1");
              name.textContent = entry.file.name;
              const remove = document.createElement("button");
              remove.type = "button";
              remove.setAttribute("data-er-chip-x", "1");
              remove.title = t("remove");
              remove.setAttribute("aria-label", t("remove"));
              remove.textContent = "\u00d7";
              remove.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                URL.revokeObjectURL(entry.previewUrl);
                picked.splice(picked.indexOf(entry), 1);
                renderStrip();
              });
              chip.append(img, name, remove);
              strip.appendChild(chip);
            }
          };

          const pushFile = (file, inherited) => {
            if (!file || !isImageFile(file)) return;
            if (picked.length >= MAX_EDITOR_IMAGES) return;
            picked.push({ file, previewUrl: URL.createObjectURL(file), inherited: inherited === true });
          };

          const addFiles = (list) => {
            for (const file of list) pushFile(file, false);
            renderStrip();
          };

          // The message's own images are seeded first, so an edit of an image message
          // starts from what it carried and can drop or add around them.
          for (const file of initialFiles) pushFile(file, true);
          renderStrip();

          const fileInput = document.createElement("input");
          fileInput.type = "file";
          fileInput.accept = "image/*";
          fileInput.multiple = true;
          fileInput.addEventListener("change", () => {
            addFiles(fileInput.files ?? []);
            fileInput.value = "";
          });

          const textarea = document.createElement("textarea");
          textarea.value = initialText;
          textarea.rows = 1;
          const autosize = () => {
            textarea.style.height = "auto";
            textarea.style.height = Math.min(textarea.scrollHeight, window.innerHeight * 0.4) + "px";
          };
          textarea.addEventListener("input", autosize);
          textarea.addEventListener("paste", (event) => {
            const files = [...(event.clipboardData?.files ?? [])];
            if (files.length === 0) return;
            event.preventDefault();
            addFiles(files);
          });

          const toolbar = document.createElement("div");
          toolbar.setAttribute("data-er-toolbar", "1");

          const attachBtn = document.createElement("button");
          attachBtn.type = "button";
          attachBtn.setAttribute("data-er-attach", "1");
          attachBtn.title = t("attach");
          attachBtn.setAttribute("aria-label", t("attach"));
          attachBtn.innerHTML = imageSvg();
          attachBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            fileInput.click();
          });

          const spacer = document.createElement("span");
          spacer.setAttribute("data-er-spacer", "1");

          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.setAttribute("data-er-round", "cancel");
          cancelBtn.title = t("cancel");
          cancelBtn.setAttribute("aria-label", t("cancel"));
          cancelBtn.innerHTML = crossSvg();
          cancelBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          });

          const sendBtn = document.createElement("button");
          sendBtn.type = "button";
          sendBtn.setAttribute("data-er-round", "send");
          sendBtn.title = t("send");
          sendBtn.setAttribute("aria-label", t("send"));
          sendBtn.innerHTML = arrowUpSvg();
          sendBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            submit();
          });

          const hint = document.createElement("span");
          hint.setAttribute("data-er-hint", "1");
          hint.textContent = t("sendHint");

          toolbar.append(attachBtn, hint, spacer, cancelBtn, sendBtn);
          wrap.append(strip, textarea, toolbar, fileInput);

          // The save control reflects whether anything actually changed. Editing a
          // message to the identical text is a no-op that used to look like a
          // successful save, so it is refused before it leaves the browser.
          const baseline = initialText;
          const baselineImages = initialFiles.length;
          const unchanged = () => textarea.value === baseline && picked.length === baselineImages;
          const syncSend = () => {
            const empty = textarea.value.trim().length === 0;
            sendBtn.disabled = empty || unchanged();
            sendBtn.title = unchanged() && !empty ? t("unchanged") : t("send");
            wrap.toggleAttribute("data-er-unchanged", unchanged());
          };
          textarea.addEventListener("input", syncSend);
          // renderStrip is wrapped, not replaced, so every attachment edit resyncs.
          const renderStripBase = renderStrip;
          renderStrip = () => { renderStripBase(); syncSend(); };
          syncSend();

          // One submit path for the button and the Enter key, defined after the
          // state it reads, so the disabled state cannot be routed around by a
          // keystroke and there is no temporal-dead-zone dependency on `unchanged`.
          const submit = () => {
            if (textarea.value.trim().length === 0) return;
            if (unchanged()) return;
            onSend(textarea.value, picked.map((entry) => entry.file));
          };

          // Dragging files anywhere onto the editor attaches them.
          wrap.addEventListener("dragover", (event) => {
            if (!event.dataTransfer?.types?.includes("Files")) return;
            event.preventDefault();
            wrap.setAttribute("data-er-dropping", "1");
          });
          wrap.addEventListener("dragleave", (event) => {
            if (event.target !== wrap) return;
            wrap.removeAttribute("data-er-dropping");
          });
          wrap.addEventListener("drop", (event) => {
            const files = [...(event.dataTransfer?.files ?? [])];
            if (files.length === 0) return;
            event.preventDefault();
            event.stopPropagation();
            wrap.removeAttribute("data-er-dropping");
            addFiles(files);
          });

          textarea.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.stopPropagation();
              submit();
            }
          });

          requestAnimationFrame(() => {
            autosize();
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
          });
          return wrap;
        }

        async function beginInlineEdit(row, node) {
          if (editOpening) return;
          editOpening = true;
          try {
            closeActiveEditor(true);
            const { text, attachments } = splitContent(node?.data?.content);
            const hadImages = attachments.some((entry) => entry?.kind === "image");
            // Two independent sources for the message's images: the session read (with
            // the original order and names) and, when that yields nothing, the blobs
            // DSH already rendered into the row. The second exists so a session whose
            // read API is unavailable can never silently strip a message's images.
            const binding = currentBinding();
            const session = (() => {
              try { return binding ? ctx.sessions.binding(binding.key)?.session : undefined; } catch { return undefined; }
            })();
            let originalImages = await readMessageAttachmentFiles(attachments, ["image"]).catch(() => null);
            let fromRow = 0;
            // Fall back whenever the session read produced nothing — including when the
            // content carried no image blocks at all. The row is the ground truth for
            // what the message actually shows, so the editor must never open empty for
            // an image the user can see.
            if (originalImages === null || originalImages.length === 0) {
              const rendered = await readRowImageFiles(row).catch(() => []);
              if (rendered.length > 0) {
                originalImages = rendered;
                fromRow = rendered.length;
              }
            }
            probe({
              where: "edit-open",
              kinds: attachments.map((entry) => entry?.kind ?? "?"),
              textChars: text.length,
              binding: Boolean(binding?.key),
              session: Boolean(session),
              readApi: typeof session?.readAttachment === "function",
              imagesRead: originalImages === null ? "threw" : originalImages.length,
              imagesFromRow: fromRow,
            });
            // Only the row's own bubbles are swapped out. A stale editor from an
            // interrupted open is skipped so it cannot hide itself and leave an
            // empty row behind.
            for (const part of [...row.children]) {
              if (part.hasAttribute(EDITOR_ATTR)) continue;
              part.style.display = "none";
              part.setAttribute(HIDDEN_ATTR, "1");
            }
            const editor = buildInlineEditor(text, {
              initialFiles: originalImages ?? [],
              onSend: (editedText, newFiles) => {
                // "Resolved" only when we really hold the message's images. A message
                // that had images but yielded none must stay unresolved, so the send
                // path re-reads them instead of quietly dropping them.
                const resolved = originalImages !== null && !(hadImages && originalImages.length === 0);
                void sendEdited(row, node, editedText, attachments, newFiles, resolved);
              },
              onCancel: () => closeActiveEditor(true),
            });
            row.appendChild(editor);
            activeEditor = { row };
          } finally {
            editOpening = false;
          }
        }

        /**
         * Remove inherited pending-queue messages from a child session (they would replay
         * and re-answer the original question).
         * @param childId - Child session id.
         * @param inheritedIds - Id set to remove precisely (user-queued messages are untouched);
         *   null when the inbox read failed (host fault) and cleanup must degrade to
         *   "remove everything" for safety — over-cleaning beats replay; an empty set means
         *   "confirmed nothing inherited", so nothing is touched.
         * @param state - `{clean}` latch: once confirmed clean (no inherited items, not running)
         *   the running turn is no longer interrupted; null mode never latches clean.
         * @returns {Promise<void>}
         */
        async function purgeInheritedQueue(childId, inheritedIds, state) {
          if (state?.clean) return;
          if (inheritedIds && inheritedIds.size === 0) {
            if (state) state.clean = true;
            return;
          }
          try {
            const session = ctx.sessions.binding(childId)?.session;
            if (!session) return;
            // The queue frame arrives with the open stream; remove inherited items from it.
            const items = typeof session.queueMirror?.snapshot === "function" ? session.queueMirror.snapshot() : [];
            let remaining = 0;
            for (const item of items) {
              const id = item?.id ?? item?.itemId;
              if (!id) continue;
              if (inheritedIds && !inheritedIds.has(id)) continue;
              remaining++;
              if (typeof session.updateQueue === "function") {
                try { await session.updateQueue(id, { kind: "remove" }); } catch { /* already gone — nothing to remove */ }
              }
            }
            // An inherited item may have started a turn: interrupt until clean is confirmed;
            // after that, the user's own running turn is left alone.
            if (session.running === true && typeof session.cancel === "function") {
              try { await session.cancel(); } catch { /* turn already ended */ }
            } else if (inheritedIds && remaining === 0 && session.running !== true) {
              if (state) state.clean = true;
            }
          } catch { /* session not bound yet — the caller polls again */ }
        }

        // ---------------- send: the fork happens here ----------------
        let sendInFlight = false;

        /**
         * Optimistic render: drop the editor, show the edited text bubble plus a
         * processing animation in place.
         * @param row - Message row element.
         * @param editedText - Edited message text.
         * @param newFiles - Images attached in the editor, previewed as chips so an
         *   image-only resend does not look empty while the fork opens.
         * @returns {void}
         */
        function showOptimistic(row, editedText, newFiles = []) {
          const editor = row.querySelector(`[${EDITOR_ATTR}]`);
          if (editor) editor.remove();
          const bubble = document.createElement("div");
          bubble.setAttribute("data-er-optimistic", "1");
          if (editedText.trim() === "") bubble.style.display = "none";
          bubble.textContent = editedText;
          row.append(bubble);
          const images = newFiles.filter(isImageFile);
          if (images.length > 0) {
            const preview = document.createElement("div");
            preview.setAttribute("data-er-optimistic-images", "1");
            for (const file of images) {
              const img = document.createElement("img");
              img.src = URL.createObjectURL(file);
              img.alt = file.name;
              preview.appendChild(img);
            }
            row.append(preview);
          }
          const processing = document.createElement("div");
          processing.setAttribute("data-er-processing", "1");
          processing.textContent = zh ? "深度求索中…" : "Thinking…";
          row.append(processing);
        }

        function clearOptimistic(row) {
          for (const el of row.querySelectorAll("[data-er-optimistic],[data-er-processing],[data-er-optimistic-images]")) el.remove();
          // Restore original content visibility (a no-op once the fork view switch has moved
          // on, but kept as a safety net).
          for (const el of row.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
            el.style.display = '';
            el.removeAttribute(HIDDEN_ATTR);
          }
          activeEditor = null;
        }

        async function sendEdited(row, node, editedText, attachments, newFiles = [], originalsResolved = false) {
          if (sendInFlight) return;
          sendInFlight = true;
          // Immediate effect: editor disappears, new bubble + processing animation appear.
          const sendBtn = row.querySelector('[data-er-round="send"]');
          if (sendBtn) sendBtn.disabled = true;
          showOptimistic(row, editedText, newFiles);
          const binding = currentBinding();
          if (!binding) {
            clearOptimistic(row);
            sendInFlight = false;
            return;
          }
          const sourceId = binding.key;
          const seq = node?.data?.seq ?? node?.anchorSeq;
          if (typeof seq !== "number") {
            clearOptimistic(row);
            sendInFlight = false;
            return;
          }

          const files = [];
          const sourceSession = (() => {
            try { return ctx.sessions.binding(sourceId)?.session; } catch { return undefined; }
          })();
          // When the editor resolved the message's own images, it owns them: it already
          // carries the ones the user kept plus anything added. Non-image attachments
          // are still forwarded from the source message either way.
          const forwarded = originalsResolved
            ? attachments.filter((attachment) => attachment.kind !== "image")
            : attachments;
          for (const attachment of forwarded) {
            try {
              const desc = attachment.desc ?? {};
              const attachmentId = desc.attachmentId ?? desc.id ?? desc.key;
              if (!attachmentId || typeof sourceSession?.readAttachment !== "function") continue;
              const result = await sourceSession.readAttachment(attachmentId);
              if (!result?.ok || !result.value) continue;
              const mediaType = result.value.attachment?.mediaType || desc.mediaType || "application/octet-stream";
              const name = desc.name || (attachment.kind === "image" ? "image.png" : "attachment");
              const bytes = Uint8Array.from(result.value.data ?? []);
              if (bytes.length === 0) continue;
              files.push(new File([bytes], name, { type: mediaType }));
            } catch { /* unreadable attachment — resend without it */ }
          }
          // Editor images (the message's kept originals plus newly attached ones) ride the
          // same child prompt: images are serialized inline, so they need no upload
          // receipt and cannot race the submit.
          for (const file of newFiles) {
            if (isImageFile(file)) files.push(file);
          }

          const msgTurn = node?.location?.turn?.turn;
          const turnStartSeq = node?.location?.turn?.start?.seq;
          // Anchor: the turn/end of the turn *before* the one holding the edited message.
          // No previous turn (first message) means no fork — create a fresh session instead.
          let prevTailSeq;
          try {
            if (typeof msgTurn === "number") {
              const snap = chatSnapshot(binding);
              const byKey = snap?.nodes?.byKey;
              const tails = (snap?.order ?? [])
                .filter((k) => typeof k === "string" && k.includes("turn-tail"))
                .map((k) => {
                  const tailNode = resolveNodeByKey(byKey, k);
                  return {
                    turn: tailNode?.location?.turn?.turn ?? tailNode?.data?.turn,
                    seq: tailNode?.data?.seq ?? tailNode?.anchorSeq,
                  };
                })
                .filter((tail) => typeof tail.turn === "number" && typeof tail.seq === "number")
                .sort((a, b) => a.turn - b.turn);
              const prevTail = [...tails].reverse().find((tail) => tail.turn < msgTurn && tail.seq < seq);
              if (prevTail) prevTailSeq = prevTail.seq;
            }
          } catch { /* snapshot walk failed — treated as "no previous turn", creates a fresh session */ }

          const isFirstMessageBranch = prevTailSeq === undefined;
          let childId = null;
          let atSeqUsed = null;
          if (isFirstMessageBranch) {
            // First message: no history to inherit — create a blank session and make the
            // edited draft its first message.
            try {
              childId = await ctx.sessions.create({});
            } catch { childId = null; /* creation failed — handled by the null check below */ }
          } else {
            const anchors = [prevTailSeq, typeof turnStartSeq === "number" ? turnStartSeq - 2 : undefined, typeof turnStartSeq === "number" ? turnStartSeq - 3 : undefined]
              .filter((atSeq) => typeof atSeq === "number" && atSeq >= 0);
            for (const atSeq of anchors) {
              try {
                childId = await ctx.sessions.fork({ sessionId: sourceId, atSeq, increaseTitle: false });
                atSeqUsed = atSeq;
                break;
              } catch { childId = null; /* bad anchor seq — try the next candidate */ }
            }
          }
          if (childId === null) {
            clearOptimistic(row);
            sendInFlight = false;
            return;
          }

          // Record the branch and give it the family title (deterministic naming for
          // sidebar matching). Attribute it to the root family: parentId = root session,
          // parentMsgSeq = root message seq.
          const recordsNow = await loadBranches(true);
          const { rootId, record: branchRec } = rootOf(sourceId, recordsNow);
          let groupParentMsgSeq = seq;
          if (branchRec) {
            const versionSeq = branchVersionSeq(binding, branchRec);
            if (versionSeq === seq) groupParentMsgSeq = branchRec.parentMsgSeq ?? seq;
          }
          // Family titles unify on the root session's title so header and sidebar agree.
          // Prefer the session-log truth; displayTitle may degrade to the cwd name and is
          // a last resort only.
          const parentTitle = (() => {
            const fromLog = branchCache.titles?.[rootId];
            if (typeof fromLog === "string" && fromLog) return fromLog;
            try {
              const live = ctx.sessions.list.getSnapshot()?.byId?.[rootId];
              if (typeof live?.title === "string" && live.title) return live.title;
              if (typeof live?.displayTitle === "string" && live.displayTitle) return live.displayTitle;
            } catch { /* list unavailable — fall through to the stored record title */ }
            return branchRec?.parentTitle ?? null;
          })();
          const childTitle = parentTitle;

          await postBranch({
            childId,
            parentId: rootId,
            parentTitle,
            childTitle,
            parentMsgSeq: groupParentMsgSeq,
            anchorSeq: atSeqUsed,
            createdAt: Date.now(),
          });

          // Purge before open: pre-open next-turn queue items in the child log can only be
          // inherited (the user cannot reach the child session yet), so remove exactly the
          // ids the host reported — no text matching (attachment-only messages have empty
          // text and similar prefixes cause false deletes). 404 = log not ready, retry;
          // 200 with an empty array = genuinely nothing inherited, stop polling.
          const inheritedIds = new Set();
          let inboxKnown = false;
          try {
            let items = null;
            for (let attempt = 0; attempt < 10 && items === null; attempt++) {
              const res = await fetch("/edit-resend-inbox", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId: childId }),
              });
              if (res.ok) {
                inboxKnown = true;
                const payload = await res.json();
                items = Array.isArray(payload?.items) ? payload.items : [];
              } else {
                await new Promise((resolve) => setTimeout(resolve, 200));
              }
            }
            for (const item of items ?? []) {
              if (item?.id) inheritedIds.add(item.id);
            }
            const session = ctx.sessions.binding(childId)?.session;
            for (const id of inheritedIds) {
              try { await session?.updateQueue?.(id, { kind: "remove" }); } catch { /* already gone */ }
            }
          } catch { /* inbox fetch failed — purge loop below degrades to full cleanup */ }

          navBypassUntil = Date.now() + 15000;
          await openSession(childId);

          const deadline = Date.now() + 8000;
          let childBinding = null;
          // Inbox unread (host/log fault) → purgeIds = null and purge degrades to full
          // cleanup as a safety net against replay.
          const purgeIds = inboxKnown ? inheritedIds : null;
          const purgeState = { clean: inboxKnown && inheritedIds.size === 0 };
          while (Date.now() < deadline) {
            await purgeInheritedQueue(childId, purgeIds, purgeState);
            const candidate = currentBinding();
            if (candidate?.key === childId && typeof candidate.props?.inputActions?.setDraft === "function") {
              childBinding = candidate;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          if (!childBinding) {
            clearOptimistic(row);
            sendInFlight = false;
            return;
          }

          // Rename now (the child session is ready, so rename sticks).
          if (childTitle) {
            try {
              const childSession = ctx.sessions.binding(childId)?.session;
              if (typeof childSession?.rename === "function") {
                await childSession.rename(childTitle);
              }
            } catch { /* rename race — migration retries later */ }
          }

          await purgeInheritedQueue(childId, purgeIds, purgeState);
          try { childBinding.props.inputActions.setDraft(editedText); } catch { /* draft rejected — submit below still sends the buffer */ }
          if (files.length > 0) {
            try {
              const drafts = ctx.conversation.createDrafts(childId, files);
              if (Array.isArray(drafts) && drafts.length > 0 && typeof childBinding.props.inputActions.addAttachments === "function") {
                const accepted = childBinding.props.inputActions.addAttachments(drafts.map((draft) => draft.id));
                if (accepted === false && typeof ctx.conversation.releaseDraftAttachments === "function") {
                  ctx.conversation.releaseDraftAttachments(drafts);
                }
              }
            } catch { /* attachment handoff failed — resend text-only */ }
          }

          try {
            if (typeof childBinding.props.inputActions.submit === "function") {
              childBinding.props.inputActions.submit();
            }
          } catch { /* submit failed — optimistic state already cleared by the caller */ } finally {
            sendInFlight = false;
          }
        }

        // ---------------- rendering ----------------
        /**
         * Inject edit buttons and branch arrows into message rows, and re-merge sidebar
         * family rows. Idempotent per row (rows carry a processed mark).
         * @returns {void}
         */
        function injectButtons() {
          const binding = currentBinding();
          void loadBranches().then((records) => {
            syncBranchRows(records);
            void migrateBranchTitles();
          }).catch(() => {});
          const nodes = binding ? userMessageNodes(binding) : [];

          for (const btn of document.querySelectorAll("button[aria-label]")) {
            const label = btn.getAttribute("aria-label") ?? "";
            if (!COPY_LABELS.has(label)) continue;
            if (btn.closest("[data-turn-tail]")) continue;
            const actionsRow = btn.parentElement;
            const row = actionsRow?.parentElement;
            if (!row) continue;
            if (row.hasAttribute("data-pending-steering") || row.hasAttribute("data-submission-echo")) continue;
            if (row.hasAttribute(PROCESSED_ATTR)) continue;
            if (row.querySelector(`[${EDITOR_ATTR}]`)) continue;
            // No message node, no button (index fallback is abandoned); leave the row
            // unmarked so the next DOM change retries.
            const node = binding ? locateNode(row, nodes) : undefined;
            if (!node) continue;
            row.setAttribute(PROCESSED_ATTR, "1");

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.setAttribute(BTN_ATTR, "1");
            editBtn.setAttribute("aria-label", t("edit"));
            editBtn.innerHTML = pencilSvg();
            editBtn.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              // Opening the editor awaits the message's own image attachments first.
              void beginInlineEdit(row, node);
            });
            actionsRow.insertBefore(editBtn, btn);

            void (async () => {
              try {
                const records = await loadBranches();
                const groups = computeGroups(binding, records);
                if (groups.length === 0) return;
                const msgSeq = node?.data?.seq ?? node?.anchorSeq;
                let group;
                if (binding.key === groups[0].parentId || groups.some((g) => g.parentId === binding.key)) {
                  group = groups.find((g) => g.parentMsgSeq === msgSeq);
                }
                if (!group) {
                  const mine = groups.find((g) => g.versions[g.currentIndex] === binding.key);
                  const mineAnchor = typeof mine?.anchorSeq === "number" ? mine.anchorSeq : -1;
                  if (mine && typeof msgSeq === "number") {
                    const firstNew = nodes.find((n) => {
                      const s = n?.data?.seq ?? n?.anchorSeq;
                      return typeof s === "number" && s > mineAnchor;
                    });
                    if (firstNew && (firstNew?.data?.seq ?? firstNew?.anchorSeq) === msgSeq) group = mine;
                  }
                }
                if (group) {
                  const nav = navElement(group, (targetIndex) => {
                    const target = group.versions[targetIndex];
                    if (target) void switchTo(target);
                  });
                  actionsRow.appendChild(nav);
                }
              } catch { /* records unavailable — arrows appear on the next pass */ }
            })();
          }
        }

        // ---------------- path mentions: reveal in Finder ----------------
        // Nothing here rewrites React's DOM. Path detection is a hit test against the
        // caret under the pointer, so streaming re-renders and reconciliation are
        // untouched, and DSH's own path buttons (sidebar viewer) keep their behaviour.

        /** A path run never contains spaces or prose punctuation, so a sentence can
         * never be swallowed into a match. */
        const PATH_TOKEN_RE = /[/A-Za-z0-9._~@%+=#-]+/g;
        /** Quoted or backticked paths may contain spaces and are matched separately. */
        const PATH_QUOTED_RE = /["'`](\/[^"'`\n]{1,4000})["'`]/g;
        const HINT_ID = "dsh-path-reveal-hint";
        /**
         * Rendered content that may offer path mentions. DSH sets
         * `data-markdown-variant` only on the *compact* variant, so it cannot be the
         * primary anchor; the chat row attributes always exist, and the `_markdown`
         * local-name suffix covers markdown rendered outside a chat row.
         */
        const CONTENT_SCOPE = [
          "[data-chat-flow-key]",
          "[data-chat-flow-kind]",
          "[data-chat-anchor-key]",
          "[data-markdown-variant]",
          '[class*="_markdown"]',
        ].join(", ");
        /** Targets that keep their own behaviour: DSH already made these clickable. */
        const INTERACTIVE_SCOPE = "button, a, [data-ref-chip], [contenteditable], textarea, input";

        /**
         * Report a runtime fact to the host's probe log. The client half cannot be
         * inspected from outside, so this is how a diagnosis sees what actually
         * happened at run time. Fire-and-forget: failures stay silent and never block.
         * @param payload - Serializable facts to record.
         * @returns {void}
         */
        function probe(payload) {
          try {
            void fetch("/edit-resend-probe", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            }).catch(() => {});
          } catch { /* no fetch available — nothing to record */ }
        }

        /** Drop prose punctuation, and a trailing `#L24` / `#L24-L30` anchor. */
        function trimPathToken(token) {
          let out = token.replace(/#L\d+(?:-L\d+)?$/, "");
          while (out.length > 1 && /[.,;:!?#_=-]$/.test(out) && !/\.[A-Za-z0-9]{1,8}$/.test(out)) {
            out = out.slice(0, -1);
          }
          return out;
        }

        /**
         * The path candidate covering one caret offset inside a text node, if any.
         * @param text - The text node's value.
         * @param offset - Caret offset reported for the pointer position.
         * @returns `{ path, absolute, home? }` or null.
         */
        function findPathAt(text, offset) {
          if (typeof text !== "string" || text.length === 0) return null;
          PATH_QUOTED_RE.lastIndex = 0;
          let quoted;
          while ((quoted = PATH_QUOTED_RE.exec(text)) !== null) {
            const start = quoted.index + 1;
            const end = start + quoted[1].length;
            if (offset < start || offset > end) continue;
            const token = trimPathToken(quoted[1]);
            if (token.length > 1) return { path: token, absolute: true };
          }
          PATH_TOKEN_RE.lastIndex = 0;
          let match;
          while ((match = PATH_TOKEN_RE.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (offset < start || offset > end) continue;
            // A `:` immediately before the run means a URL scheme ("https://…").
            if (text[start - 1] === ":") continue;
            const token = trimPathToken(match[0]);
            if (token.length < 2 || !token.includes("/")) continue;
            if (token.startsWith("/")) return { path: token, absolute: true };
            // `~/…` is home-relative: it must NOT be joined onto the session cwd (that
            // produced `<cwd>/~/.dsh/…`), so it passes through for the host to expand.
            if (token.startsWith("~/") || token === "~") return { path: token, absolute: false, home: true };
            if (token.startsWith("./") || token.startsWith("../")) return { path: token, absolute: false };
            // A bare relative path must end like a file name. This is what keeps
            // slash-joined prose such as "and/or" or "either/or" out.
            if (/\.[A-Za-z0-9]{1,8}$/.test(token)) return { path: token, absolute: false };
          }
          return null;
        }

        /** The active session's working directory, when the client exposes it. */
        function sessionCwd() {
          try {
            const binding = currentBinding();
            if (!binding?.key) return undefined;
            const cwd = ctx.sessions?.list?.getSnapshot?.()?.byId?.[binding.key]?.cwd;
            if (typeof cwd === "string" && cwd) return cwd;
            const header = ctx.sessions?.binding?.(binding.key)?.session?.header;
            if (typeof header?.cwd === "string" && header.cwd) return header.cwd;
          } catch { /* no cwd — relative candidates stay inert */ }
          return undefined;
        }

        /** Resolve a relative path against a base directory, textually. */
        function joinPath(base, relative) {
          const parts = String(base).split("/");
          for (const segment of String(relative).split("/")) {
            if (segment === "" || segment === ".") continue;
            if (segment === "..") parts.pop();
            else parts.push(segment);
          }
          const joined = parts.join("/");
          return joined.startsWith("/") ? joined : `/${joined}`;
        }

        /** Absolute path for a candidate, or null when it cannot be resolved. */
        function resolvePathCandidate(candidate) {
          if (candidate.absolute) return candidate.path;
          // Home-relative candidates stay in `~` form and are expanded by the host,
          // which is the only side that knows the home directory.
          if (candidate.home) return candidate.path;
          const cwd = sessionCwd();
          return cwd ? joinPath(cwd, candidate.path) : null;
        }

        /** Pointer → caret range, across engines. */
        function caretRangeAt(x, y) {
          try {
            if (typeof document.caretRangeFromPoint === "function") return document.caretRangeFromPoint(x, y);
            if (typeof document.caretPositionFromPoint === "function") {
              const position = document.caretPositionFromPoint(x, y);
              if (!position) return null;
              const range = document.createRange();
              range.setStart(position.offsetNode, position.offset);
              range.collapse(true);
              return range;
            }
          } catch { /* pointer outside the document */ }
          return null;
        }

        /**
         * Classify the pointer position: either the revealable path under it, or the
         * reason there is none. The reason is what a diagnosis needs — a hit test can
         * fail at four different stages and each looks identical from the outside.
         * @param x - Viewport x.
         * @param y - Viewport y.
         * @returns `{ path }` when a path is under the pointer, else `{ reason, ... }`.
         */
        function inspectPoint(x, y) {
          const range = caretRangeAt(x, y);
          const node = range?.startContainer;
          if (!node) return { reason: "no-caret" };
          if (node.nodeType !== 3) return { reason: `node-type-${node.nodeType}` };
          const element = node.parentElement;
          if (!element) return { reason: "no-parent" };
          if (!element.closest(CONTENT_SCOPE)) {
            return { reason: "out-of-scope", tag: element.tagName, cls: String(element.className ?? "").slice(0, 70) };
          }
          if (element.closest(INTERACTIVE_SCOPE)) return { reason: "interactive" };
          const candidate = findPathAt(node.nodeValue ?? "", range.startOffset);
          if (!candidate) {
            const text = node.nodeValue ?? "";
            return { reason: "no-match", near: text.slice(Math.max(0, range.startOffset - 24), range.startOffset + 24) };
          }
          const path = resolvePathCandidate(candidate);
          if (!path) return { reason: "unresolved", candidate: candidate.path };
          return { path };
        }

        /**
         * The revealable path under a pointer position: rendered plain text only.
         * Nodes DSH already made clickable (buttons, links, reference chips) and
         * editable fields are skipped so core behaviour is never doubled.
         * @param x - Viewport x.
         * @param y - Viewport y.
         * @returns `{ path }` or null.
         */
        function pathCandidateAtPoint(x, y) {
          const found = inspectPoint(x, y);
          return found.path ? { path: found.path } : null;
        }

        let hintEl = null;
        let hintTimer = 0;

        function hintElement() {
          if (hintEl) return hintEl;
          hintEl = document.createElement("div");
          hintEl.id = HINT_ID;
          hintEl.setAttribute("aria-hidden", "true");
          document.body.appendChild(hintEl);
          return hintEl;
        }

        function showHint(text, x, y, transient) {
          const element = hintElement();
          // Called once per animation frame while the pointer moves, so avoid
          // re-parsing unchanged text and skip position writes it already has.
          if (element.textContent !== text) element.textContent = text;
          const left = `${Math.max(6, Math.min(x + 12, window.innerWidth - 24))}px`;
          const top = `${Math.max(6, y - 32)}px`;
          if (element.style.left !== left) element.style.left = left;
          if (element.style.top !== top) element.style.top = top;
          if (element.getAttribute("data-er-visible") !== "1") {
            element.setAttribute("data-er-visible", "1");
          }
          if (transient) {
            clearTimeout(hintTimer);
            hintTimer = setTimeout(() => element.removeAttribute("data-er-visible"), 1600);
          }
        }

        function hideHint() {
          clearTimeout(hintTimer);
          if (hintEl) hintEl.removeAttribute("data-er-visible");
        }

        /**
         * Ask the host to reveal a path in Finder. The request goes to this plugin's
         * own host route, which forwards to `sessionController.openWorkspacePath` with
         * `action: "reveal"` hard-wired: that host call verifies the path through the
         * composed filesystem and uses a no-shell `open -R`, so a failure means the
         * path does not exist or is not visible to the app. The wire never chooses the
         * action, so a crafted body cannot open or execute anything.
         * @param path - Absolute path to reveal.
         * @param x - Hint anchor x.
         * @param y - Hint anchor y.
         * @returns {Promise<void>}
         */
        async function revealInFinder(path, x, y) {
          let response;
          try {
            response = await fetch("/edit-resend-reveal", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ path }),
            });
          } catch {
            showHint(t("revealUnavailable"), x, y, true);
            return;
          }
          const detail = await response.json().catch(() => undefined);
          if (!response.ok) {
            // The host distinguishes "no such path" (404) from "the reveal capability
            // is missing" (501), and the reason is recorded either way: reporting both
            // as "path not found" is exactly how a broken route masqueraded as a bad
            // path once already.
            probe({ where: "reveal-failed", path, status: response.status, error: detail?.error });
            showHint(response.status === 501 ? t("revealUnavailable") : t("revealMissing"), x, y, true);
            return;
          }
          if (detail?.exact === false && typeof detail?.revealed === "string") {
            // The mentioned path does not exist, so the nearest real folder was opened.
            // Naming it keeps the result legible instead of looking like a failure — an
            // illustrative path is a normal thing to click, not an error.
            const name = detail.revealed.split("/").filter(Boolean).pop() ?? detail.revealed;
            showHint(`${t("revealNearest")} · ${name}`, x, y, true);
            return;
          }
          hideHint();
        }

        ctx.effect(() => {
          let hoverFrame = 0;
          let hovering = false;
          let hitProbes = 0;
          let missProbes = 0;
          let selectionAtMouseDown = false;
          probe({ where: "reveal-mounted", hasCaretFromPoint: typeof document.caretRangeFromPoint === "function" });

          // Called once per animation frame while the pointer moves, so every write
          // is guarded: leaving the pointer on plain text must not touch the DOM.
          const setHover = (on, x, y) => {
            if (!on) {
              if (!hovering) return;
              hovering = false;
              document.documentElement.removeAttribute("data-er-path-hover");
              hideHint();
              return;
            }
            hovering = true;
            if (document.documentElement.getAttribute("data-er-path-hover") !== "1") {
              document.documentElement.setAttribute("data-er-path-hover", "1");
            }
            showHint(t("reveal"), x, y, false);
          };
          const clear = () => setHover(false, 0, 0);

          const onMove = (event) => {
            if (hoverFrame) return;
            const x = event.clientX;
            const y = event.clientY;
            hoverFrame = requestAnimationFrame(() => {
              hoverFrame = 0;
              const found = inspectPoint(x, y);
              // Recorded so a failure can be read back from the host, where a hit test
              // stopping at any of four stages otherwise looks identical. A hit is
              // always worth recording; a miss only when it was "close" (real text in a
              // content area), because hovering window chrome is noise that would
              // exhaust the budget before the pointer ever reached a path.
              const closeMiss = found.reason === "no-match" || found.reason === "unresolved" || found.reason === "interactive";
              if (found.path && hitProbes < 10) {
                hitProbes += 1;
                probe({ where: "hover-hit", path: found.path });
              } else if (closeMiss && missProbes < 5) {
                missProbes += 1;
                probe({ where: "hover-miss", ...found });
              }
              setHover(Boolean(found.path), x, y);
            });
          };
          const onMouseDown = () => {
            const selection = window.getSelection?.();
            selectionAtMouseDown = Boolean(selection && !selection.isCollapsed && String(selection).trim() !== "");
          };
          const onClick = (event) => {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
            // Finishing a text selection must not double as a reveal.
            if (selectionAtMouseDown) return;
            const hit = pathCandidateAtPoint(event.clientX, event.clientY);
            if (!hit) return;
            void revealInFinder(hit.path, event.clientX, event.clientY);
          };

          document.addEventListener("mousemove", onMove, true);
          document.addEventListener("mousedown", onMouseDown, true);
          document.addEventListener("click", onClick, true);
          window.addEventListener("scroll", clear, true);
          document.addEventListener("mouseleave", clear);
          return () => {
            if (hoverFrame) cancelAnimationFrame(hoverFrame);
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("mousedown", onMouseDown, true);
            document.removeEventListener("click", onClick, true);
            window.removeEventListener("scroll", clear, true);
            document.removeEventListener("mouseleave", clear);
            document.documentElement.removeAttribute("data-er-path-hover");
            hideHint();
            if (hintEl) { hintEl.remove(); hintEl = null; }
          };
        }, "edit-resend: path reveal");

        let scheduled = false;
        const scheduleInject = () => {
          if (scheduled) return;
          scheduled = true;
          let ran = false;
          const run = () => {
            if (ran) return;
            ran = true;
            scheduled = false;
            try { injectButtons(); } catch { /* inject threw — next mutation retries */ }
          };
          requestAnimationFrame(run);
          setTimeout(run, 250); // rAF never fires in hidden windows — timer fallback.
        };
        const observer = new MutationObserver(() => {
          try { if (branchCache.at > 0) syncBranchRows(branchCache.records); } catch { /* merge failure must not break injection */ }
          scheduleInject();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        injectButtons();

        // Subscribe to session switches: opening a family session redirects to the most
        // recently active member (arrow/inner opens go through the bypass window).
        let unsubscribeCurrent = null;
        try {
          unsubscribeCurrent = ctx.uiSession.adapter.current.subscribe(() => {
            try {
              if (Date.now() < navBypassUntil) return;
              const binding = currentBinding();
              if (!binding) return;
              const members = familyMembersOf(binding.key, branchCache.records);
              if (!members) return;
              const target = mostRecentMemberId(members);
              if (target && target !== binding.key) {
                navBypassUntil = Date.now() + 3000;
                void openSession(target);
              }
            } catch { /* redirect failure — user lands on the opened member anyway */ }
          });
        } catch { /* no adapter — redirect simply disabled */ }

        // Subscribe to the session list: re-merge sidebar rows on title/running changes,
        // and run the title migration once the list is ready.
        let unsubscribeList = null;
        try {
          unsubscribeList = ctx.sessions.list.subscribe(() => {
            try { if (branchCache.at > 0) syncBranchRows(branchCache.records); } catch { /* merge failure must not break the subscription */ }
            void migrateBranchTitles();
          });
        } catch { /* no list service — sidebar merge stays observer-driven */ }

        ctx.effect(() => () => {
          observer.disconnect();
          unsubscribeCurrent?.();
          unsubscribeList?.();
          closeActiveEditor(true);
        }, "edit-resend: observer");

        // ---------------- auto summary titles + pixel shimmer ----------------
        try {
          const WAVE_ATTR = "data-at-wave";
          const requestedTitles = new Set(); // `${sessionId}:${kind}` — once per page lifetime
          const userNodeCountSeen = new Map(); // sessionId → last observed user message count (0→1 jump = first message)
          let compactionSession = null;
          let compactionBaseline = 0; // compaction row count at open/switch (host-side time window guards lazy-render false triggers)
          let lastDetect = 0;

          // Title-swap blur transition: old title blurs as the light reaches it → new
          // title lands → sharpens.
          const atStyle = document.createElement("style");
          atStyle.textContent = "[data-at-blur] { filter: blur(3px); opacity: 0.55; transition: filter 180ms ease, opacity 180ms ease; }";
          document.head.appendChild(atStyle);

          /**
           * Palette: the live StateDot deep blue (follows theme recoloring), with the light
           * band dimmed to stay gentle.
           * @returns {{grid: string, light: string, core: string, shade: string}} CSS colors.
           */
          function wavePalette() {
            let base = [86, 134, 254]; // StateDot deep blue rgb(86,134,254)
            try {
              const dot = document.querySelector('[data-state="ongoing"]');
              const cell = dot?.querySelector("rect") ?? dot;
              const fill = cell ? getComputedStyle(cell).fill : "";
              const m = fill && fill.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
              if (m) base = [Number(m[1]), Number(m[2]), Number(m[3])];
            } catch { /* no live dot or unreadable style — keep the default blue */ }
            const [r, g, b] = base;
            return {
              grid: `rgba(${r}, ${g}, ${b}, 1)`, // transparent pixel grid (used at low alpha)
              light: `rgb(${Math.round(r * 0.55)}, ${Math.round(g * 0.62)}, ${Math.round(b * 0.78)})`, // shimmer: gentle and dim
              core: `rgb(${Math.round(r * 0.85)}, ${Math.round(g * 0.88)}, ${Math.round(b * 0.98)})`, // light core / lit bump cells: one step brighter, still deep blue
              shade: "rgba(0, 0, 0, 0.35)", // shadow beneath bumped cells
            };
          }

          /**
           * Title-landing effect: transparent pixel grid surfaces → a dim deep-blue shimmer
           * sweeps right to left → pixel cells under the light bump up gently (a stadium
           * wave, tamed) and settle as the light leaves → grid fades out.
           *
           * mode "full": we rename — old title blurs mid-sweep, the new title lands while
           * the light passes, then sharpens (complete orchestration). mode "adapted": dsh's
           * built-in already settled the title — no rename, the new title starts blurred
           * and sharpens after the sweep.
           *
           * The canvas sits under the text. React replaces sidebar rows wholesale, so each
           * frame re-finds the row, re-attaches the canvas, re-lifts children, and re-applies
           * blur. Driven by a setTimeout chain because rAF stalls in hidden windows.
           * Blur cleanup is double-guarded (finally + hard timeout) so no failure path
           * leaves the title blurred.
           * @param sessionId - Session whose row plays the effect.
           * @param newTitle - The landing title, or null for a pure visual pass.
           * @param mode - "full" or "adapted".
           * @returns {Promise<void>}
           */
          async function playTitleEffect(sessionId, newTitle, mode) {
            const clearBlur = () => {
              for (const el of document.querySelectorAll("[data-at-blur]")) el.removeAttribute("data-at-blur");
            };
            // Hard-timeout fallback, deliberately not cleared on return: a residual draw
            // chain on an exception path may re-apply blur, so sweep once more after the
            // animation is surely dead (560+240ms + margin).
            const blurCap = setTimeout(clearBlur, 1300);
            try {
              const pal = wavePalette();
              const CELL = 4; // 4px grid pitch + 2px solid pixels (StateDot grain: 2px blocks, 2px gaps)
              const SWEEP = 560, FADE = 240, FRAME = 40;
              const LIGHT_HALF = 32; // light band half-width px (includes soft-shoulder falloff)
              const LIGHT_SHEAR = 20; // light shear px: positive = "/" slant (top right), negative = "\"
              const BUMP_MAX = 4; // wave bump cap px (even multiple of the pitch keeps grid lines aligned)
              const start = Date.now();
              const canvas = document.createElement("canvas");
              canvas.setAttribute(WAVE_ATTR, "1");
              canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;z-index:0;border-radius:inherit;";
              const g = canvas.getContext("2d");
              if (!g) return;
              let blurred = false;
              let renameStarted = false;
              const findRow = () => [...document.querySelectorAll('[role="treeitem"][aria-selected="true"]')]
                .filter((r) => !r.querySelector('[class*="_projectText"]'))[0];
              const startRename = () => {
                if (renameStarted) return;
                renameStarted = true;
                void (async () => {
                  // A new session's binding/session may not be ready yet, and dsh's own
                  // provider title is racing us — retry a few times.
                  for (let attempt = 0; attempt < 4; attempt++) {
                    try {
                      const session = ctx.sessions.binding(sessionId)?.session;
                      if (typeof session?.rename === "function") {
                        await session.rename(newTitle);
                        break;
                      }
                    } catch { /* binding not ready yet — retry */ }
                    await new Promise((r) => setTimeout(r, 700));
                  }
                })();
              };
              let rowMissingSince = null;
              const draw = () => {
                // End in place on a mid-sweep session switch: findRow targets the aria-selected
                // row, which belongs to someone else after switching. A transiently missing
                // binding (readiness race) is not a switch — only a definite key change is.
                const cur = currentBinding();
                if (cur && cur.key !== sessionId) {
                  canvas.remove();
                  clearBlur();
                  return;
                }
                const t = Date.now() - start;
                // Terminate on time only. master is a pure opacity envelope — the fade-in
                // is lifted to (t+FRAME)/100 so the envelope is never 0 at t=0, which was
                // misread as "animation finished" and killed the effect on its first frame.
                if (t > SWEEP + FADE) {
                  canvas.remove();
                  return;
                }
                const master = Math.min(1, (t + FRAME) / 100) * (t > SWEEP ? Math.max(0, 1 - (t - SWEEP) / FADE) : 1);
                const row = findRow();
                // Rows vanish briefly on sidebar re-render/switch: tolerate up to 800ms of
                // absence before ending.
                if (!row) {
                  if (rowMissingSince === null) rowMissingSince = t;
                  if (t - rowMissingSince > 800) { canvas.remove(); return; }
                  setTimeout(draw, FRAME);
                  return;
                }
                rowMissingSince = null;
                const titleEl = row.querySelector('[class*="_title"], [class*="_unreadTitle"]');
                const tx = titleEl?.textContent ?? "";
                // React replaces rows wholesale: re-attach the canvas and lift row children
                // above the effect every frame.
                if (canvas.parentElement !== row) {
                  if (getComputedStyle(row).position === "static") row.style.position = "relative";
                  row.appendChild(canvas);
                }
                for (const child of row.children) {
                  if (child === canvas) continue;
                  if (getComputedStyle(child).position === "static") child.style.position = "relative";
                  if (child.style.zIndex !== "1") child.style.zIndex = "1";
                }
                const rect = row.getBoundingClientRect();
                const W = Math.floor(rect.width);
                const H = Math.floor(rect.height);
                if (W < 40 || H < 12) { canvas.remove(); return; }
                if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
                const cellsX = Math.ceil(W / CELL);
                const cellsY = Math.ceil(H / CELL);
                const center = cellsX * (1 - t / SWEEP); // band center in cells, sweeping right to left
                if (mode === "adapted") {
                  // Title already landed: blur before the light reaches the title area
                  // (re-applied per frame against React row swaps), sharpen after it passes.
                  if (titleEl) {
                    if (center >= cellsX * 0.55) {
                      if (!titleEl.hasAttribute("data-at-blur")) titleEl.setAttribute("data-at-blur", "1");
                    } else if (titleEl.hasAttribute("data-at-blur")) {
                      titleEl.removeAttribute("data-at-blur");
                    }
                  }
                } else {
                  // Light reaches the title's middle: blur the old title and land the new
                  // one (once).
                  if (!blurred && center < cellsX * 0.55) blurred = true;
                  if (blurred) {
                    if (newTitle != null) startRename();
                    // React swaps in a fresh title element; re-apply blur every frame until
                    // the text is the new title (the new element starts sharp).
                    if (titleEl && (newTitle == null || tx !== newTitle) && !titleEl.hasAttribute("data-at-blur")) {
                      titleEl.setAttribute("data-at-blur", "1");
                    }
                  }
                }
                g.clearRect(0, 0, W, H);
                // Transparent pixel-grid texture across the row: 2px solid blocks on a 2px
                // gap (StateDot grain, 50% void ratio).
                g.fillStyle = pal.grid;
                g.globalAlpha = 0.34 * master;
                for (let cx = 0; cx < cellsX; cx++) {
                  for (let cy = 0; cy < cellsY; cy++) {
                    g.fillRect(cx * CELL, cy * CELL, CELL - 2, CELL - 2);
                  }
                }
                // Light band: sheared parallelogram (pixel-stepped diagonal — 2px integer
                // steps per row keep the edge hard), per-pixel soft-shoulder falloff.
                // Top-right/bottom-left = "/" slant (negate LIGHT_SHEAR for "\"); the whole
                // band moves right to left during the sweep.
                const centerPx = center * CELL;
                for (let y = 0; y < H; y++) {
                  const shear = Math.round((LIGHT_SHEAR * (0.5 - y / Math.max(1, H - 1))) / 2) * 2;
                  const rowCenter = centerPx + shear;
                  for (let dx = -LIGHT_HALF; dx <= LIGHT_HALF; dx++) {
                    const x = Math.round(rowCenter + dx);
                    if (x < 0 || x >= W) continue;
                    g.fillStyle = pal.light;
                    g.globalAlpha = (1 - Math.abs(dx) / LIGHT_HALF) ** 2 * 0.42 * master;
                    g.fillRect(x, y, 1, 1);
                  }
                  // Core line: a brighter core following the shear (±1px symmetric) for the
                  // read of a single light flash (still deep blue, never glaring).
                  for (let dx = -1; dx <= 1; dx++) {
                    const x = Math.round(rowCenter) + dx;
                    if (x < 0 || x >= W) continue;
                    g.fillStyle = pal.core;
                    g.globalAlpha = (dx === 0 ? 0.62 : 0.32) * master;
                    g.fillRect(x, y, 1, 1);
                  }
                }
                // Wave: cells near the light bump up (BUMP_MAX, whole-pitch steps) and light
                // up, settling smoothly with sin as the light leaves; the vacated spot keeps
                // a shadow so the block reads as physically lifted.
                for (let cx = 0; cx < cellsX; cx++) {
                  const d = Math.abs(cx - center);
                  if (d > 8) continue;
                  const k = 1 - d / 8;
                  const bump = Math.round((BUMP_MAX / 2) * Math.sin((k * Math.PI) / 2)) * 2; // 0..BUMP_MAX, 2px steps
                  for (let cy = 0; cy < cellsY; cy++) {
                    if (bump > 0) {
                      g.fillStyle = pal.shade;
                      g.globalAlpha = 0.4 * k * master;
                      g.fillRect(cx * CELL, cy * CELL, CELL - 2, CELL - 2); // vacated spot shadow
                    }
                    g.fillStyle = pal.core;
                    g.globalAlpha = (0.3 + k * 0.5) * master;
                    g.fillRect(cx * CELL, cy * CELL - bump, CELL - 2, CELL - 2);
                  }
                }
                g.globalAlpha = 1;
                setTimeout(draw, FRAME);
              };
              draw();
              // Wait until the new title text really lands on the row (rename is async),
              // and at least until the sweep finishes before sharpening; 3s cap.
              if (newTitle != null) {
                const deadline = Date.now() + 3000;
                while (Date.now() < deadline) {
                  const el = findRow()?.querySelector('[class*="_title"], [class*="_unreadTitle"]');
                  if (el?.textContent === newTitle) break;
                  await new Promise((r) => setTimeout(r, 100));
                }
              }
              const remain = SWEEP + 80 - (Date.now() - start);
              if (remain > 0) await new Promise((r) => setTimeout(r, remain));
              blurred = false; // stop re-applying blur — the new title element starts sharp
              clearBlur();
            } catch {
              clearBlur();
            }
          }

          /**
           * Display jam fallback for the binding-readiness race: when the title truth has
           * landed but the UI never shows it, force it through rename. Rename writes
           * kind "user" (pinned) — the host already recorded the title in autotitle.json,
           * so later compact passes do not misread it as a manual rename.
           * @param sessionId - Session id.
           * @param expected - The title that must become visible.
           * @returns {Promise<void>}
           */
          async function ensureTitleDisplay(sessionId, expected) {
            try {
              const shown = () => {
                try {
                  const s = ctx.sessions.list.getSnapshot()?.byId?.[sessionId];
                  return s?.title === expected || s?.displayTitle === expected;
                } catch { return false; /* list unavailable — keep waiting */ }
              };
              const deadline = Date.now() + 4000;
              while (Date.now() < deadline && !shown()) {
                await new Promise((r) => setTimeout(r, 300));
              }
              if (shown()) return;
              for (let attempt = 0; attempt < 6; attempt++) {
                const session = ctx.sessions.binding(sessionId)?.session;
                if (typeof session?.rename === "function") {
                  try { await session.rename(expected); } catch { /* rename race — retry */ }
                  await new Promise((r) => setTimeout(r, 500));
                  if (shown()) return;
                } else {
                  await new Promise((r) => setTimeout(r, 800));
                }
              }
            } catch { /* display check failed — title truth is host-side, safe to stop */ }
          }

          /**
           * Request a title from the host and play the effect with the result.
           * @param kind - "first" or "compact".
           * @returns {Promise<void>}
           */
          async function requestAutoTitle(kind) {
            const binding = currentBinding();
            const sessionId = binding?.key;
            if (!sessionId) return;
            const key = `${sessionId}:${kind}`;
            // "first" fires once per session; "compact" never dedupes — the rising
            // compaction-row count is itself the gate (long sessions retitle on each compaction).
            if (kind === "first") {
              if (requestedTitles.has(key)) return;
              requestedTitles.add(key);
            }
            // since = the 0→1 trigger instant, so the host can freshness-check "did the title
            // settle inside this window" (old titles of old sessions skip as stale-title).
            const since = Date.now();
            try {
              // Branch-family sessions skip auto-titling: edit-resend unifies their titles
              // to the parent session's name.
              const records = await loadBranches(true);
              if (familyMembersOf(sessionId, records)) return;
              const res = await fetch("/auto-title", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ sessionId, kind, since }),
              });
              const payload = await res.json().catch(() => null);
              if (!res.ok || typeof payload?.title !== "string" || !payload.title) return;
              // Built-in title (source "builtin") already settled → adapted orchestration
              // (blur → sweep → sharp); our own title (source "ours") → full orchestration
              // with the rename inside the effect.
              const mode = payload.source === "ours" ? "full" : "adapted";
              await playTitleEffect(sessionId, payload.title, mode);
              await ensureTitleDisplay(sessionId, payload.title);
            } catch { /* request/parse failure — title falls back to host/provider display */ }
          }

          function detectAutoTitleTriggers() {
            try {
              const now = Date.now();
              if (now - lastDetect < 250) return; // streaming churns the DOM — throttle
              lastDetect = now;
              const binding = currentBinding();
              if (!binding) return;
              // A. First message: a 0→1 jump in user message count. An unseen prevCount also
              //    fires — "type the first message right after creating the session" would
              //    otherwise miss its 0 baseline; stale titles from old sessions are blocked
              //    by the host's since freshness window.
              const nodes = userMessageNodes(binding);
              const prevCount = userNodeCountSeen.get(binding.key);
              userNodeCountSeen.set(binding.key, nodes.length);
              if ((prevCount === 0 || prevCount === undefined) && nodes.length === 1) {
                // Fire on 0→1 without inspecting content. An earlier `if (content)` gate
                // swallowed the observation of empty-content nodes (the count had already
                // incremented) and the trigger was lost forever; material comes from the
                // session log host-side anyway.
                void requestAutoTitle("first");
              }
              // B. compact: compaction row count grew since open (history rows form the
              // baseline, so old sessions do not false-trigger).
              const rows = document.querySelectorAll('[class*="_compactionRow"]').length;
              if (compactionSession !== binding.key) {
                compactionSession = binding.key;
                compactionBaseline = rows;
              } else if (rows > compactionBaseline) {
                compactionBaseline = rows;
                void requestAutoTitle("compact");
              }
            } catch { /* detection failure must not break future triggers */ }
          }

          // ---------------- general chat ----------------
          /*
           * A chat-only Session needs no folder of its own. DSH still keys every
           * Session by an absolute `cwd`, so this registers (or reuses) ONE home
           * directory and opens a blank Session in it, once per click. It adds no
           * row to the workspace list and never touches the model, preset, tools,
           * or permission mode: it only removes the "pick a folder first" step.
           */
          try {
            /*
             * The General chat directory lives INSIDE the hidden DSH home rather than
             * a visible ~/General, so it never shows up in Finder or the user's home.
             * `~/.dsh/general-chat` is hidden by the leading dot and belongs to the
             * harness, which is exactly what an internal scratch workspace should be.
             */
            const GENERAL_DIR_NAME = "general-chat";
            const GENERAL_HOME_PARENT = ".dsh";
            const GENERAL_ATTR = "data-er-general";
            /*
             * `headerActions` is capped at max-width:60px with overflow:hidden. Three
             * stock buttons already need 92px, so a fourth is clipped out of sight
             * instead of appearing. Widen it to fit what is actually in the row.
             */
            const GENERAL_STYLE = `
              [class*="_headerActions"] { max-width: none !important; overflow: visible !important; }
              [${GENERAL_ATTR}] {
                display: inline-flex; align-items: center; justify-content: center;
                width: 28px; height: 28px; flex: none; padding: 0; border: none;
                border-radius: var(--dsw-radius-sm); background: transparent;
                color: var(--dsw-alias-label-secondary); cursor: pointer;
              }
              [${GENERAL_ATTR}]:hover { background: var(--dsw-alias-interactive-bg-hover); }
              [${GENERAL_ATTR}] svg { display: block; width: 16px; height: 16px; }
            `;
            const generalStyle = document.createElement("style");
            generalStyle.textContent = GENERAL_STYLE;
            document.head.appendChild(generalStyle);

            /**
             * Resolve the Client services. Both idioms appear in this repo — `ctx.get(x)`
             * and `ctx.<service>` — so accept either rather than assume one and fail closed.
             */
            function generalServices() {
              const pick = (key) => (typeof ctx.get === "function" ? ctx.get(key) : undefined) ?? ctx[key];
              const workspaces = pick("workspaces");
              const uiWorkspace = pick("uiWorkspace");
              // Only `startSession` is truly required: the fallback path below needs
              // nothing else, so requiring `create` here made the fallback unreachable.
              if (uiWorkspace?.startSession === undefined) return undefined;
              return { workspaces, uiWorkspace };
            }

            /**
             * The host account home directory.
             *
             * `ctx.remote.$host.home` is the authoritative value: DSH's own sidebar reads
             * exactly this to abbreviate workspace paths, so it is present before any
             * directory I/O and does not depend on the picker. `listDirectory()` is only
             * a fallback, because it refuses to run when the picker backend is absent
             * and that failure is what made the first version fall through to the
             * current workspace instead of the General one.
             */
            async function generalRoot(uiWorkspace) {
              const host = ctx.remote?.$host;
              const direct = host?.home;
              if (typeof direct === "string" && direct.length > 0) {
                return direct.replace(/[\\/]+$/, "");
              }
              let listing;
              try {
                listing = await uiWorkspace.listDirectory();
              } catch {
                return undefined;
              }
              const home = typeof listing?.home === "string" ? listing.home : listing?.path;
              return typeof home === "string" && home.length > 0 ? home.replace(/[\\/]+$/, "") : undefined;
            }

            function generalSvg() {
              return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">'
                + '<path d="M2.5 4.2A1.7 1.7 0 0 1 4.2 2.5h7.6a1.7 1.7 0 0 1 1.7 1.7v5.1a1.7 1.7 0 0 1-1.7 1.7H6.6L3.7 13.3v-2.3h-.2a1.7 1.7 0 0 1-1-1.6z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'
                + '</svg>';
            }

            /** Paint the button red and explain why, so a failure is never a dead click. */
            function generalFail(message) {
              const el = document.querySelector(`[${GENERAL_ATTR}]`);
              if (el !== null) {
                el.style.color = "var(--dsw-alias-state-error-primary)";
                el.title = message;
              }
              console.warn("[general-chat]", message);
            }

            let generalBusy = false;
            async function openGeneralChat() {
              if (generalBusy) return;
              const services = generalServices();
              if (services === undefined) {
                generalFail(zh ? "工作区服务不可用" : "workspace services unavailable");
                return;
              }
              const { workspaces, uiWorkspace } = services;
              generalBusy = true;
              const el = document.querySelector(`[${GENERAL_ATTR}]`);
              if (el !== null) el.style.color = "";
              try {
                // Step 1: the Home directory. `listDirectory()` with no argument
                // resolves it on the Host; without it the General folder has no parent.
                let root;
                try {
                  root = await generalRoot(uiWorkspace);
                } catch (error) {
                  // Not fatal: fall through to the plain new-chat path below rather
                  // than doing nothing, which is what made the first version dead.
                  // Warn loudly, though: a silent fallback puts the chat in whatever
                  // workspace was last used, which is the defect this replaced.
                  root = undefined;
                  console.warn("[general-chat] home unresolved, falling back to the current workspace:", error);
                }

                if (root !== undefined) {
                  const parent = root + "/" + GENERAL_HOME_PARENT;
                  const dir = parent + "/" + GENERAL_DIR_NAME;
                  const existing = workspaces.list?.getSnapshot?.()?.items ?? [];
                  let workspace = existing.find((item) => item.path === dir);
                  if (workspace === undefined) {
                    if (uiWorkspace.createDirectory === undefined || workspaces.create === undefined) {
                      generalFail(zh ? "工作区服务不完整" : "workspace services incomplete");
                      return;
                    }
                    // `~/.dsh` normally exists already; creating it is a no-op then and
                    // keeps the first-run path working.
                    try { await uiWorkspace.createDirectory(root, GENERAL_HOME_PARENT); } catch { /* exists */ }
                    // `create` registers an EXISTING path, so make it first. Failure is
                    // not fatal: it may already exist, or the Host created it concurrently.
                    try {
                      await uiWorkspace.createDirectory(parent, GENERAL_DIR_NAME);
                    } catch { /* create() below makes the final decision */ }
                    try {
                      workspace = await workspaces.create({ path: dir });
                    } catch (error) {
                      generalFail(String(error instanceof Error ? error.message : error));
                      return;
                    }
                  }
                  uiWorkspace.startSession(workspace.workspaceId);
                  return;
                }

                // Fallback: a blank Session in the current/last Workspace. Still one
                // click, still no folder picker — the whole point of the button.
                // With no Workspace at all there is nothing to attach a Session to,
                // so say so instead of clicking into silence.
                if ((workspaces.list?.getSnapshot?.()?.items ?? []).length === 0) {
                  generalFail(zh ? "请先添加一个工作区" : "add a workspace first");
                  return;
                }
                uiWorkspace.startSession();
              } catch (error) {
                generalFail(String(error instanceof Error ? error.message : error));
              } finally {
                generalBusy = false;
              }
            }

            /** Add the button beside search / view options / add-workspace, once. */
            function injectGeneralButton() {
              if (document.querySelector(`[${GENERAL_ATTR}]`) !== null) return;
              const actions = document.querySelector('[class*="_headerActions"]');
              if (actions === null) return;
              const btn = document.createElement("button");
              btn.type = "button";
              btn.setAttribute(GENERAL_ATTR, "1");
              btn.setAttribute("aria-label", t("generalChatHint"));
              btn.title = t("generalChatHint");
              btn.innerHTML = generalSvg();
              btn.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                void openGeneralChat();
              });
              // Append last so it never displaces the stock controls' order.
              actions.appendChild(btn);
            }

            const generalObserver = new MutationObserver(() => {
              try { injectGeneralButton(); } catch { /* next mutation retries */ }
            });
            generalObserver.observe(document.body, { childList: true, subtree: true });
            injectGeneralButton();
            ctx.effect(() => () => {
              generalObserver.disconnect();
              generalStyle.remove();
              for (const el of document.querySelectorAll(`[${GENERAL_ATTR}]`)) el.remove();
            }, "general-chat: observer");
          } catch { /* general chat failed to mount — the rest of the plugin stays up */ }

          const atObserver = new MutationObserver(() => {
            try { detectAutoTitleTriggers(); } catch { /* detection failure must not break the observer */ }
          });
          atObserver.observe(document.body, { childList: true, subtree: true });
          detectAutoTitleTriggers();

          ctx.effect(() => () => {
            atObserver.disconnect();
            atStyle.remove();
            for (const c of document.querySelectorAll(`canvas[${WAVE_ATTR}]`)) c.remove();
          }, "auto-title: observer");
        } catch { /* auto-title section failed to mount — the rest of the plugin stays up */ }
      },
    };
  },
});
