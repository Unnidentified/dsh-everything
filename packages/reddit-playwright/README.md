# dsh-plugin-reddit-playwright

A DeepSeek Harness (DSH) bundle plugin that registers one agent tool,
`reddit_extract`, which turns a Reddit thread URL into text the model can read.

Reddit serves plain HTTP clients a bot wall, so `web_fetch` and `curl` fail on
thread URLs. This tool drives a headless browser instead, then formats the
result three ways.

## What it registers

| | |
| :--- | :--- |
| Tool name | `reddit_extract` |
| Arguments | `url` (required), `format`, `expand_all_comments` |
| Formats | `agent-digest` (default), `markdown`, `json` |
| Slash command | `/reddit on \| off \| status` |

The plugin declares `inject = ['tools']`, so the loader brings up the tool
registry before `apply()` runs.

## Output formats

- **`agent-digest`** (default) — one comment per line, each with an id, an
  explicit parent reference (`[c3 re:c2]`), author, and score. Nesting survives
  flattening with no indentation to lose, and the format is dense enough to
  stay intact through downstream processing.
- **`markdown`** — headings and a nested bullet tree, with each comment's author
  and score. Best when a human reads the result.
- **`json`** — the structured tree, for programmatic use.

## Completeness, and what "partial" looks like

Two independent limits decide how many comments you get, and the plugin is
explicit about both.

**Which comments exist to be fetched.** The primary path asks Reddit's JSON API
from *inside* the loaded page, so the request carries the browser's cookies and
clearance. That returns the whole comment tree in one response. Scraping the
rendered DOM instead only sees what has scrolled into view and been expanded —
on the same thread, the API returned 193 comments where the DOM yielded 135.
The DOM path remains as a fallback when the API is refused, and it clicks every
expansion control it can find before giving up.

Reddit also withholds some comments from any anonymous client (collapsed
threads, `continue this thread` stubs). The `[THREAD]` header therefore reports
what actually arrived and what did not:

```
[THREAD] title="…" subreddit="r/…" author="u/…" score=389 comments=193
         of_reported=202 withheld=1 via="reddit JSON API (in-page fetch)" url="…"
```

`comments=193 of_reported=202` means Reddit advertises 202 and 193 arrived;
`withheld=1` counts the `more` stubs the payload itself declared. A gap here is
a fact about the thread, not a silent truncation.

**How much of it fits in one tool result.** A large thread's digest is written
to a file in full, and the tool returns a bounded preview that names the file:

```
[FULL_THREAD_SAVED] All 193 extracted comments (34092 bytes, format=agent-digest) are saved at:
  /var/folders/…/reddit-extract/1wzuto0.agent-digest.txt
Use the read tool on that path to get every comment verbatim.

Preview (top comments by score) follows:

[THREAD] …
[COMMENTS shown=81 of=193 ranked=top_by_score omitted=112]
```

This exists for a concrete reason. `dsh-plugin-save-token`, which is commonly
active in a profile, compresses tool results over its `minBytes` and rewrites
anything past `maxLines`; measured against digest-shaped text, that begins
around 40 KB. A rewritten result is worse than a large one, because the elision
is *unmarked* — the caller cannot tell a whole thread from a truncated one.
`read` is exempt from that compression, so the file is a genuinely lossless
channel, and the preview states its own `shown=N of=M` so the gap is visible.

## Installation

The plugin mounts through a profile bundle layer, the same mechanism
`dsh-plugin-save-token` uses.

1. **Install it into the profile as a `link:` dependency.** A `link:` entry is
   a symlink to the source, so later edits take effect without reinstalling:

   ```sh
   cd ~/.dsh/profiles/<profile>
   pnpm add "link:/path/to/reddit-plugin"
   ```

   Prefer `link:` over `file:`. A `file:` dependency is copied into the
   profile, and pnpm will not refresh that copy unless the package version
   changes — which makes source edits silently invisible.

2. **List it as a bundle** in the profile manifest's `dsh.profile.bundles`:

   ```json
   "bundles": [ "...", "dsh-plugin-reddit-playwright" ]
   ```

3. **Restart DSH.** Plugin rows are mounted at startup, so a running session
   will not see the tool until it restarts.

No entry is needed in the profile's own `cordis.patch.yml`: the package's
`dsh.bundle.patch` (`cordis.patch.yml` here) supplies the row.

## Toggling the tool

`/reddit on|off` registers and unregisters the tool through the exact disposer
`ctx.tools.register()` returns. Turning it off removes `reddit_extract` from
the agent's tool list rather than leaving a disabled stub behind.

## Verification

`scripts/verify.mjs` exercises the plugin against the **real** DSH runtime — a
genuine `ToolRuntime` from `@deepseek-ai/dsh-tools`, not a stand-in. Run it
from the DSH app root so the SDK resolves:

```sh
cd /path/to/reddit-plugin
DSH_RUNTIME_DIR=/path/to/dsh/node_modules-parent node scripts/verify.mjs
```

`DSH_RUNTIME_DIR` names a directory whose `node_modules` contains
`@deepseek-ai/dsh-tools` and `@deepseek-ai/cordis` — the DSH app's own tree, or
an npm cache entry for it.

It covers module shape, registration, the compiled parameter schema, the
default format, live extraction in all three formats, the spill path (that the
file holds every comment and the preview admits what it omitted), argument
rejection, and the `/reddit` toggle.

### Contract notes

Two rules of the DSH tool schema cost real debugging time, and both are
enforced by the runtime rather than documented in the error you first see:

- `tools.register()` throws unless the definition carries
  `output: { schema, render }`. `render` is what a PTC-mode program receives
  when it calls the tool.
- The two schemas use **different** vocabularies. In the parameter map,
  `required: true` marks an argument mandatory (and `required: false` is
  rejected — omit it instead). In `output.schema`, which uses the value DSL,
  `required` is not a member of the vocabulary at all, and
  `additionalProperties` must be explicitly `true` or `false`.

### Runtime dependency

`@deepseek-ai/dsh-tools` is resolved by DSH's own loader at runtime; it is not
importable from a plugin's directory by a bare `node` process. The import is
therefore wrapped: the tool is built with the SDK's `defineTool` when it is
reachable, and otherwise with an equivalent raw definition carrying the same
contract. Both paths are verified.

## Layout

```
reddit-plugin/
├── index.js                  # plugin entry: tool definition, /reddit command
├── package.json              # dsh.bundle.patch manifest
├── cordis.patch.yml          # the profile row this bundle inserts
├── src/
│   ├── reddit-extractor.js   # Playwright navigation and DOM extraction
│   ├── markdown-formatter.js # markdown / agent-digest / json formatters
│   └── cli.js                # standalone command-line runner
└── scripts/
    └── verify.mjs            # verification against the real DSH runtime
```

## Standalone use

The extractor also runs outside DSH:

```sh
node src/cli.js "https://www.reddit.com/r/<sub>/comments/<id>/<slug>/"
```
