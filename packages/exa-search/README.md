# dsh-plugin-exa-search

[Exa.ai](https://exa.ai) neural web search as native **DeepSeek Harness** (`dsh`) tools.

Registers two agent tools, both backed by `api.exa.ai` over plain `fetch` — no SDK
dependency, no build step.

| Tool | Purpose |
|---|---|
| `exa_search` | Neural/keyword web search with ranked results, extracted page text, and optional grounded structured synthesis. |
| `exa_contents` | Clean parsed content for URLs you already have. |

## Why use this instead of the built-in `web_search`

Exa is a *neural* search engine: it matches meaning rather than keywords, and it
returns the page content alongside the link — not just a list of URLs. The tools
are worth preferring when:

- the question is conceptual or research-shaped ("what do practitioners say about X"),
- you want page text you can reason over directly, not a synthesized answer,
- you need grounded **structured** output — pass `outputSchema` and Exa returns
  synthesized JSON in `output.content` with field-level citations in `output.grounding`,
- you have URLs already and want clean text, an LLM summary per URL, or a cache refresh.

## Install

```bash
dsh plugin --profile desktop add /path/to/dsh-plugin-exa-search
```

Or add both the dependency and the bundle entry to
`~/.dsh/profiles/<profile>/package.json` by hand:

```json
{
  "dependencies": {
    "dsh-plugin-exa-search": "file:/path/to/dsh-plugin-exa-search"
  },
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-plugin-exa-search"]
    }
  }
}
```

Then reload the profile. The tools appear in the agent's tool list on the next turn.

## API key

Resolution order:

1. **`EXA_API_KEY`** in the Harness process environment. This wins.
2. A value stored with **`/exa key <value>`**, kept owner-only (`0600`) at
   `<DSH home>/storages/exa-search.json`.

The fallback exists because a GUI-launched Harness does not inherit your shell
profile, so an `export EXA_API_KEY=…` in `~/.zshrc` is *not* visible to the host
process. `/exa key` stores a key that is.

Get a key at <https://dashboard.exa.ai>.

## Commands

```
/exa status         — key source, registered tools, which SDK path is active
/exa key <value>    — store a key for hosts started without EXA_API_KEY
/exa forget         — remove the stored key (an environment key is unaffected)
```

## Tool reference

### `exa_search`

| Argument | Notes |
|---|---|
| `query` | **required** — natural language, singular and specific. |
| `type` | `auto` (default), `fast`, `instant`, `deep-lite`, `deep`, `deep-reasoning`. |
| `numResults` | 1–100, default 10. |
| `contentMode` | `highlights` (**default** for search) returns cheap query-relevant excerpts, `text` returns the extracted page body, `summary` returns one LLM-written summary per result. Pick exactly one. |
| `maxCharacters` | How much page text Exa may return per result when `contentMode` is `text`. Default 20000. Raising it raises both the fetched and the inline amount. |
| `maxAgeHours` | `24` fresh-ish, `1` near-real-time, `0` always livecrawl, `-1` cache only, omit for balanced. |
| `includeDomains` / `excludeDomains` | Optional hostname (or hostname+path) filters. |
| `startPublishedDate` / `endPublishedDate` | Optional ISO date bounds. |
| `category` | e.g. `research paper`, `news`, `github`, `pdf`. |
| `systemPrompt` | Steers synthesis when `outputSchema` is set. |
| `outputSchema` | JSON Schema; enables grounded structured output. |

Latency is worth planning around: `auto` ≈ 1s, `deep` 4–15s, `deep-reasoning` 12–40s.
Synthesis (`outputSchema`) and always-livecrawl (`maxAgeHours: 0`) stack on top.

**Search and fetch are two steps on purpose.** `exa_search` defaults to
`highlights` because a search is usually exploratory: ten results of excerpts cost
about 2 KB, where the same ten with page bodies cost about 42 KB. The tool
description tells the model to escalate — a second `exa_search` with
`contentMode: "text"` (optionally narrowed with `includeDomains`) or an
`exa_contents` call on the specific URL — once a highlight shows that a page
actually matters. Escalate for the results you need, not the whole set.

### `exa_contents`

| Argument | Notes |
|---|---|
| `urls` | **required** — absolute URLs. |
| `contentMode` | `text` (**default** here), `highlights`, `summary`. |
| `maxCharacters` / `maxAgeHours` | As above. |

The two tools default in opposite directions, deliberately. `/contents` already
names exact URLs, so the caller has decided the pages matter; returning excerpts
there would answer a question nobody asked.

> **Note the asymmetry the plugin already handles for you:** on `/search` the
> content fields nest inside `contents`; on `/contents` they are top-level. The
> two builders are separate functions so this cannot be got wrong from the tool
> arguments.

## Design notes

**Parameter errors are refused before the request.** Combinations Exa answers with
HTTP 400 — `category: "company" | "people"` together with `excludeDomains` or a
date filter — are rejected locally with an instruction that says which side to
drop. The deprecated and nonexistent parameters from older guides
(`useAutoprompt`, `includeUrls`, `tokenNum`, `numSentences`, `livecrawl: "always"`)
are not accepted at all.

**Nothing fetched is thrown away.** The spill triggers on two independent
conditions: the render exceeds 60 KB, *or* the render left out content Exa
returned (trimmed page text, or omitted results). The second condition is the
important one. Keying the spill on size alone was a real bug: a render trimmed to
fit *under* the threshold never spilled, so the untrimmed text was downloaded,
paid for, and became unreachable. Triggering on truncation makes the inline
budget a display choice rather than a boundary past which information is gone.
Highlight overflow does not count as loss — highlights are a ranked sample by
design, and treating a narrowed sample as loss would fire the notice on nearly
every search.

**Page text is budgeted per result.** Exa returns up to 20 000 characters of page
text per result. Rendering that for ten results would be a ~200 KB tool result,
so the default inline budget is 4 000 characters per result — enough to be useful
directly, with the rest one `read` away. Passing an explicit `maxCharacters`
raises that budget, because a caller who asks for more text should not have it
fetched and then discarded. Text keeps its paragraph structure; only the
highlights and summaries are flattened to one line.

**HTTP failures are classified.** 401 says the key was rejected, 402 says to top up
credits, 429 says to retry, 400 quotes Exa's own explanation, and timeouts mention
that a deep search legitimately takes 40 s.

**Validation comes from DSH itself.** The tools are built with the SDK's
`defineTool` so argument validation and schema compilation are the harness's own.
Because the Harness loader resolver is not reachable from a bare `node` process,
the import is wrapped and an equivalent raw definition is emitted when the SDK is
absent — so the plugin still loads for offline testing.

## Layout

```
lib/index.js        DSH wiring: tools, /exa command, key resolution
lib/exa-client.js   Exa HTTP client + renderers (no @deepseek-ai/* imports)
cordis.patch.yml    Bundle patch that inserts the plugin row
```

`lib/exa-client.js` imports nothing from the harness, so it can be exercised
directly with `node` against the live API.

## License

MIT
