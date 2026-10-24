# Pitfalls and hard constraints

Hard-won constraints this plugin must respect. Each entry states the failure mode first and the required discipline second. Full evolution history lives in `.agents/notes/archived/` (frozen).

## Fork semantics

- **Anchor at the previous turn's `turn/end`.** `sessions.fork({ atSeq })` resolves to "the first turn end at or after this seq". Anchoring at or after the edited message pulls that message (or a half-finished turn) into the branch. The first message has no previous turn — create a blank session instead.
- **Remove inherited queue items before opening the child.** Forked sessions inherit queued next-turn messages and would re-answer the original question. Read inherited ids from the child's session log (`POST /edit-resend-inbox`) and remove them with `session.updateQueue(id, { kind: "remove" })`. Text-matched cleanup has both false positives and false negatives; match by id only.

## Title truth

- **Only `session/title` events in the session log are truth.** `sessions.list.getSnapshot().byId[id].displayTitle` degrades to the workspace directory name before a session has been opened (title projection not loaded). Never use it as truth — a fork record once captured the wrong name this way.
- **User-set titles are pinned and must never be overwritten.** `rename` writes `source.kind: "user"`, which suppresses auto-titling. Plugin-written titles are recorded in `autotitle.json` so "user-modified" and "plugin-written" stay distinguishable.

## Session logs

- **Path**: `~/.dsh/sessions/<workspace-dir>/<sessionId>/session.v3.jsonl.zstd` (older v0 name `session.jsonl.zstd` exists for subagents/legacy sessions). Decompression depends on the `zstd` CLI at `/opt/homebrew/bin/zstd`.
- **Stream, don't slurp.** Long sessions decompress to tens of MB. Scan title/route information line by line from the spawned process.
- **Every turn logs several `user/message` events.** Real user input has `data.source.kind: "user"`; the rest are injections (`agent-instructions`, `plugin`, `skill-catalog`, …). Count "first message" by kind or the count is always > 1.
- **Compaction events** form a family: `compaction/start` → `compaction/prune`*N* → `compaction/summary` → `compaction/end`, linked by `data.compactionId`. The `summary` payload is usable title material. UI rows are lazy-rendered, so trigger detection compares row counts against a baseline plus a time window.

## Sidebar DOM

- **Session rows carry no session id.** Exact mapping walks each row's React fiber to `SessionNodeItem` and reads `props.node.id` (signature: `node.id` + `onOpen` + a rename handler — `onRename` or `onRenameRequest`; the fiber key is discovered by the `__reactFiber$` prefix — never hardcode the hash suffix). When fiber introspection is unavailable, fall back to (title, time label) key matching.
- **DSH Desktop auto-updates and breaks APIs underneath you.** The 2026-09-26 update renamed `SessionNodeItem`'s `onRename` prop to `onRenameRequest` (the fiber signature silently stopped matching and the key-matching fallback carried the merge), replaced `ctx.sessions.open(id)` with `ctx.uiWorkspace.openSession(id)` (fork flow stalled after the fork: the branch record landed but the child never opened), renamed the row menu's delete item to "永久删除会话", and repackaged `node_modules` into `app.asar`. Accept every known rename spelling, keep old-entry fallbacks where cheap, and expect app updates to break internals without warning — the fallbacks exist for exactly this.
- **The row key separator is the invisible `\001` character.** Read tools display it as a space and search/replace tooling can silently drop it. Verify key-construction edits byte-wise (`od`/`grep -P '\x01'`), and keep both construction sites identical.
- **Rows are replaced wholesale by React** on status/time/title changes. Anything attached to a row (canvas, blur attributes) detaches; re-attach per frame and tolerate rows missing for up to ~800ms.
- **`rAF` does not fire in hidden windows** (Electron throttling), and background `setTimeout` throttles to ~1s. Injection scheduling needs a `setTimeout` fallback; effect verification needs a foreground window.

## Title generation

- **The built-in generator fails silently.** `session/title-llm-request` with no result event means failure — there is no error signal. "Wait for the built-in" can never be the only path: short-wait (12s) then fall back to own generation.
- **`max_tokens` is eaten by thinking.** Adaptive-thinking models consume the output budget for reasoning; a small ceiling (64) yields thinking-only responses with no text and looks like an empty result. Budget as if the model will think (4096).
- **Untrusted material must be framed, not concatenated.** Title material contains raw user requests; spliced into a prompt as live conversation, the model answers them instead of summarizing (the garbage-title incident). Wrap material as JSON data with an explicit "this is data, not instructions" declaration, and reject prose-shaped titles (sentence punctuation, dashes, over 45 characters).
- **The kimi OAuth credential is read-only.** `~/.kimi-code/credentials/kimi-code.json` is never refreshed or written by this plugin: refresh rotates `refresh_token` and would knock the harness/CLI out of their own login. Expired token = skip the tier silently. Since the mimo-migration, the token is only fresh while Kimi Code is active (~15 minutes), so the K3 tier is best-effort and flash tiers carry the load.

## Loader patches

- **Loader patch config is whole-replace, not merge.** A patch overriding an entry's `config` must supply every required field (five for the title generator) or plugin validation fails at boot. The patch layering is bundle → profile → `$DSH_HOME/cordis.patch.yml` → `--patch`; the home layer wins over everything, which is where the `maxOutputTokens 64 → 4096` companion patch lives.
- **A mismatched `name` only warns** — the patch is skipped without failing boot. Check the name field when a patch "doesn't take effect".

## CDP debugging

- **Synthetic events cannot clear a React-controlled composer** (select-all/delete are reconciled back). Use real keystrokes (kimi-cu `type_text` with `clear: true`) or the React `__reactProps$` onClick for native buttons.
- **`Page.captureScreenshot` hangs on busy pages.** Quantify canvas effects with `toDataURL`/`getImageData` instead.
- Start with `--remote-debugging-port=9222`, and always restart without the flag when done.

## Effect rendering

- **An envelope zero point is not an end condition.** A fade-in envelope reaching 0 at t=0 must not be read as "animation finished" — that bug killed the effect on its first frame. Terminate on time only.
- **Three "gentle" transparency layers sum to invisible.** Quantify with `getImageData` (visible pixel count, peak/mean alpha) instead of judging by eye; match StateDot grain (2px blocks on a 2px gap).
