# dsh-loop-detector (local compatibility fix)

Upstream: [`viego-qiin/dsh-loop-detector`](https://github.com/viego-qiin/dsh-loop-detector) v1.0.0 (MIT).
This directory is the **locally fixed install copy** for this machine, in the same
spirit as `save-token-fix`, `antigravity-auth-0.2.0-fix` and `turn-rewind-0.2.0-fix`.

Detects and hard-interrupts two kinds of agent dead-loop:

1. **Text repetition** - three layered detectors over the streaming
   `assistant/chunk` text (and, with `checkReasoning`, reasoning-delta):
   period scan (period 8..256), 64-char n-gram seen 3x in the last 2048 chars,
   and a 512-char tail anchor reappearing earlier.
2. **Search-topic repetition** - watches search tool calls, keeps a topic token
   set from the last 3 queries, and treats two consecutive queries with under
   25% novel tokens as an intent-level loop.

On a hit it steers a corrective message into the agent; after `maxRetries` it
cancels the turn with `agent.cancel({ kind: 'hook', ... })`.

## Why this copy exists

Upstream v1.0.0 does not load or misbehaves on DSH `0.1.5-rc.2` /
DeepSeek Harness app `0.2.0-rc.2`. Two fixes were needed:

### 1. TypeScript entry point would not load

Upstream declares `"main": "src/index.ts"`, and the published tarball ships the
`.ts` source only. Node refuses to strip types for files under `node_modules`,
so the loader cannot import it. This copy ships a plain ESM build at
`lib/index.js` (transpiled from `src/index.ts` with esbuild, all
`@deepseek-ai/*` imports left external) and points `main`/`exports` at it.

### 2. Search-topic detection was dead code

Upstream read the search query as a **string**:

```js
const args = exec.arguments
const query = typeof args?.query === 'string' ? args.query : ''
```

But the native DSH `web_search` tool (`@deepseek-ai/dsh-tool-web`) declares:

```js
parameters: { queries: { type: 'array', items: { type: 'string' } } }
```

so `args.query` was always `undefined` and the intent-level detector returned
early on every call. Meanwhile MCP search tools (exa and friends) really do use
`query: 'string'`. The two shapes are now both handled by `extractQueries()`,
which returns every query string in the call and runs the existing per-query
topic logic over each. The tool-name filter is also configurable via
`searchTools` and defaults to `web_search` + `mcp__exa__web_search_exa`.

Everything else is upstream behaviour, including the thresholds.

## Config

```yaml
- id: loop-detector
  config:
    minLen: 512          # only detect after this many chars
    maxRetries: 1        # steer retries before a hard cancel
    checkReasoning: true # also scan reasoning-delta
    searchTools:         # tools treated as "search" for topic-loop detection
      - web_search
      - mcp__exa__web_search_exa
```

The bundle patch in this package already inserts the row with those values.
Override it from the profile patch layer (applied afterwards) rather than
adding a second insert with the same `id`.

## Verified against the installed host

- `ctx.on('session/event', (session, event) => ...)` - matches
  `dsh-session`'s emit args `[session, event]`.
- `event.data.chunk.{type,text}` for `assistant/chunk` - matches the
  `dsh-session-format` disposition (`turn`, `step`, `chunk`).
- `ctx.agents.get(sessionId)` returns the live `AgentLoop`, which really does
  expose `steer`, `followup` and `cancel`.
- `agent.cancel(cause)` takes the cause positionally; the `{ kind: 'hook',
  reason }` object ends up as `turn/end -> { kind: 'aborted', reason: ... }`,
  which the session event schema does not constrain.
- `ctx.on('tools/execute', (exec, next) => ...)` - matches the
  `ctx.waterfall(carrier, 'tools/execute', exec, ...)` dispatch.
- `createUserMessage({ content, source })` from `@deepseek-ai/dsh-llm`.

## Rebuild after editing `src/index.ts`

```sh
cd /Users/gefaass/Documents/dsh/loop-detector-fix/package
/Users/gefaass/.local/share/opencode/plugins/opencode-antigravity-auth/node_modules/.bin/esbuild \
  src/index.ts --format=esm --platform=node --target=node22 \
  --outfile=lib/index.js --packages=external
```

Then restart the harness (the loader caches module instances at boot).

## Revert

Remove the `dsh-loop-detector` dependency in
`~/.dsh/profiles/desktop/package.json` and its entry in
`dsh.profile.bundles`, then `pnpm install` in that profile and restart.
