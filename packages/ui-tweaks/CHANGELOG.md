# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Compatibility with the 2026-09-26 DSH Desktop update: session opening now goes through `uiWorkspace.openSession` (the older `sessions.open` entry is kept as a fallback), and the sidebar fiber signature accepts both `onRename` and `onRenameRequest`.
- Editing a message that already carried images opened a blank attachment strip: the message's own images were invisible in the editor and could not be removed individually. The inline editor now reads them up front and opens with them in the strip, outlined with a dashed border to mark them as the message's own. If that read fails, the resend path still falls back to re-reading the originals so nothing is silently dropped.
- Path mentions were not clickable at all in ordinary messages: the content anchor was `data-markdown-variant`, which DSH renders only for the *compact* markdown variant (`variant === "compact" ? variant : void 0`), so every normal message failed the scope test. The anchor is now the chat row's own attributes (`data-chat-flow-key`/`-kind`/`-anchor-key`) plus the `_markdown` local-name suffix for markdown rendered outside a row, and a regression test pins it.
- Editing an image message could still open an empty strip when the session read API returned nothing, because an empty result was treated as "the message had no images" — and the send path then skipped re-reading them, silently dropping them. The images are now also recovered from the already-rendered message row (blob/data URLs, icons filtered by scheme, size and SVG exclusion), and an empty read no longer counts as resolved.
- "Finder reveal unavailable": the reveal asked the client for the `remote` session namespace, which is not reachable through `ctx.get` in this composition, so every click failed after the hint appeared. The reveal now goes through the plugin's own host route, which forwards to `sessionController.openWorkspacePath` with `action: "reveal"` hard-wired; the two unused client module injects are reverted, so the client no longer depends on the remotes graph at all. `tests/reveal-route.spec.js` pins the route contract, including that the wire can never choose the action.
- The inline editor's send and cancel buttons were painted fixed blue and red; they now use DSH's own primary-button tokens (`button-primary-fill` / `label-primary-foreground`) and DSH's own danger idiom — a local re-map of the primary tokens onto `state-error-primary` — so they follow the active theme and its overrides. The drag-over and optimistic-bubble highlights follow the theme tokens too.
- Every path click reported "Path not found", including for paths that exist. Two causes: the host call omitted the abort signal that `openWorkspacePath(request, signal)` aborts through, so it threw before examining any path; and a `~/…` mention was resolved against the session folder, producing `<cwd>/~/.dsh/…`. The route now resolves the path before revealing anything, expands `~` where the home directory is actually known, and reports 501 separately from 404 so a missing capability can never masquerade as a bad path.
- The reveal no longer depends on the verified host call succeeding: `verifyDesktopPath` round-trips the path through the session filesystem, which rejects anything outside it and anything whose real path differs (any path with a symlinked component, such as the `~/.dsh` home symlink) — exactly the paths a user is most likely to click. A fallback uses the same OS primitive that call uses internally, an argv `open -R` with no shell, and stays reveal-only. `tests/reveal-route.spec.js` covers the signal, the existence check, the `~` expansion, the capability split, and that the wire can never choose the action.
- The hover diagnostic recorded the first eight pointer evaluations, which window chrome exhausted before the pointer ever reached a path. It now always records a path hit (up to ten) and only records a "close" miss — real text inside content — so the log reflects what a diagnosis needs.
- A click on a path that does not exist did nothing but report failure, which is the common case for illustrative or incomplete mentions. It now reveals the deepest existing ancestor folder and names it in the hint, so every mention is clickable; a walk that reaches the volume root still reports "Path not found", because opening the root helps nobody.

### Added

- Automated test suite (`tests/`, vitest): host route contracts, all `/auto-title` skip branches, title-tier ordering, material framing, and title sanitization — driven through the real route handlers with only the llm service and clock mocked. Running the suite leaves user data untouched.
- `docs/standards.md`: testing standards (writing, coverage, format) traced to the official `docs/testing.md`, official package test layout, and official spec style.

### Changed

- Message action toggles are icon-only: the chat action rows no longer render hover label text (copy, branch, and any plugin tooltip mounted into the same row), the edit button and branch arrows drop their native `title` tooltips, and like/dislike feedback buttons are hidden. Every toggle keeps its `aria-label`.
- Session-log discovery also accepts the `session.v4.jsonl.zstd` name before falling back to v3 and the legacy name.

### Added

- Images can be attached while editing a previous message: a paperclip button, paste, or drag-and-drop adds preview chips (png/jpeg/webp/gif, up to 20) that ride the edited message's first turn in the child session. A message that already carried images opens with them already in the strip, so an edit starts from what the message had. Text may be empty when images are attached.
- `tests/inline-editor-images.spec.js`: the inline editor's attachment path is now covered at runtime — the spec lifts the real function bodies out of `lib/client.js`, compiles them against a minimal DOM double, and asserts chip seeding, per-image removal, paste append order, the image budget cap, and the attachment reader's kind filter and failure tolerance.
- Path mentions are clickable and reveal the path in Finder. Detection is a hit test against the text under the pointer, so no React-owned DOM is rewritten; DSH's own path buttons keep opening the sidebar viewer. Absolute paths, quoted paths containing spaces, and relative paths ending in a file extension are supported, and the reveal goes through DSH's verified `openWorkspacePath({ action: "reveal" })` host API.
- `tests/path-reveal.spec.js` with the shared `tests/source-extract.js` extractor: the path-mention matching rules are covered at runtime against the shipping source, both for the paths that must be found and for the prose that must never become clickable (URLs, version numbers, `and/or`, bare relative directories). The content anchor is pinned by its own regression test.
- `/edit-resend-probe`: the browser half can report runtime facts (which stage a path hit test stopped at; how many of a message's images were found in the content and how many were recovered from the rendered row) to an append-only `probe.log` beside the plugin. The renderer cannot be inspected from outside, so this is what makes a client-side failure diagnosable; `tests/probe-route.spec.js` covers the route.

## [0.3.0] - 2026-09-25

### Added

- Sidebar row-to-session mapping now resolves exact session ids through React fiber internals (`sessionIdOfRow`), eliminating the residual key-collision surface; the (title, time-label) key match remains as a fallback when fiber introspection is unavailable.
- Chained forks (branching from a branch) merge into a single sidebar family row.
- Self-healing row restore: rows hidden by a removed branch record become visible again on the next sync.

### Fixed

- Title generation now prefers the session's own conversation model (read from the session log `request/header`), falling back to a three-tier chain (K3 → MiMo flash → DeepSeek flash).
- Prompt-injection hardening for title material: material is JSON-framed with an explicit "data, not instructions" declaration, and `sanitizeTitle` rejects prose-like outputs.
- First-message titles no longer go dark when the built-in title generator fails silently: a 12s wait is followed by an own-generation fallback.

## [0.2.0] - 2026-09-23

### Added

- Auto summary titles for first messages and `/compact` (the latter is plugin-only; DSH has no built-in compact retitling).
- Pixel shimmer title effect: pixel-grid texture, sheared light band with core line, and a 2px-step wave bump, orchestrated in two modes (ours renames mid-sweep; adopted titles sweep then clarify).
- Three-tier title-generation fallback chain with OAuth-staleness awareness.

### Fixed

- Effect never played (first-frame suicide in the master envelope).
- Light band too narrow; pixel texture imperceptible (2px blocks on a 2px gap grid, quantified via `getImageData`).

## [0.1.0] - 2026-09-20

### Added

- Edit-and-resend: inline editing of persisted user messages with fork-on-send (anchor = the previous turn's `turn/end` seq), inherited next-turn queue cleanup, and `‹ n/N ›` arrow switching between original and branch versions.
- Sidebar branch-family grouping: one visible row per family (current > running > just-completed > most recent), native StateDot status, and family-unified titles.
- Auto-redirect to the most recently updated family member when opening a family session.

[0.3.0]: https://github.com/ProgrammerAsahi/dsh-client-ui-tweaks/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ProgrammerAsahi/dsh-client-ui-tweaks/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ProgrammerAsahi/dsh-client-ui-tweaks/releases/tag/v0.1.0
