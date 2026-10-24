# Development

Standards and their sources live in [standards.md](standards.md) — check it before writing code or docs.

## Source is the runtime

The package is loaded from this checkout through a `link:` dependency — editing files changes the live plugin.

- `index.js` (host half): restart DSH Desktop to apply.
- `lib/client.js` (browser half): page reload applies.

Keep every commit working: run `node --check index.js && node --check lib/client.js` after each edit.

## Naming consistency

Five name fields must stay identical (`dsh-client-ui-tweaks`): `package.json` `name`, the `export const name` in `index.js`, the ModuleLoader `id` in `lib/client.js`, the `name` in `cordis.patch.yml`, and the profile registration entry.

## Code layout

- `lib/client.js` is a single ModuleLoader file with independent sections (`// ---- section name ----`). Mount each section in its own `try` block so one failure never takes the others down.
- Host routes are prefixed per feature (e.g. `/edit-resend-*`); don't overload old prefixes with new features.
- User-visible strings go through the `t()` helper with `zh` detection at the top of the file. Code comments and JSDoc are English and state the non-obvious contract or motive only — never restate the code.

## Tests

`npm test` runs the vitest suite (`tests/*.spec.js`, shared harness in `tests/helpers.js`).
The suite mounts `apply(ctx)` with a ctx double and drives the captured route handlers —
it covers the host half only. The sandbox redirects `$HOME` and `DSH_UI_TWEAKS_DATA_DIR`
before the plugin loads, so a run can never touch `branches.json`/`autotitle.json`
(standards rules 23–28).

## Verification checklist

Before finishing a change:

1. `npm test`, then `node --check` both halves.
2. Five-name consistency (above).
3. Reload smoke: edit buttons and arrows appear after a page reload.
4. Host routes respond: `GET /edit-resend-branches` (200), `POST /edit-resend-inbox` with a session id (200).
5. For behavior changes, run the CDP regression below.

## CDP regression

Restart DSH Desktop with debugging enabled:

```sh
pkill -x "DSH Desktop"
open -a "DSH Desktop" --args --remote-debugging-port=9222
```

The target page is listed at `http://127.0.0.1:9222/json`. Always finish with a clean restart (`pkill -x "DSH Desktop"` then `open -a "DSH Desktop"` without the flag); the slider sentinel self-heals afterwards, which is expected.

Required checks (against a disposable test session):

1. **Edit flow**: send two short messages, edit the second, send — the fork lands, the branch record is created, and the edited text becomes the branch's first message.
2. **Family rows**: the sidebar shows exactly one visible row for the family; unrelated rows stay visible.
3. **Arrows**: `‹ n/N ›` switches between versions in both directions.
4. **Host routes**: the three routes respond (200).

## Test discipline

- Use disposable one-off test sessions only. Delete them afterwards through the native UI (parent and child), and remove their records from `branches.json` and `autotitle.json`.
- Never touch real user sessions or their data files. `branches.json` and `autotitle.json` are user data (git-ignored) — do not delete or reset them.
- Session logs for debugging: `~/.dsh/sessions/<workspace-dir>/<sessionId>/session.v3.jsonl.zstd`, decompressed with `/opt/homebrew/bin/zstd -dc`. The events that matter: `session/title` (title truth, `source.kind` distinguishes user/provider/fallback), `session/title-llm-request` (no result event = silent failure), `request/header` (the session's model route), `compaction/summary` (compact title material).

## Commits

- Chinese commit messages, real development timestamps.
- Each commit keeps the plugin working (`node --check`, naming consistency, smoke check).
- Behavior changes update README.md and README.zh.md in the same commit; re-record both blob hashes in `README.i18n.yaml`.
