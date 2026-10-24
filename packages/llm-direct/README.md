# dsh-llm-direct

Adds your own OpenAI- and Anthropic-compatible endpoints to DeepSeek Harness.

DSH's Models page writes custom providers into `llm-pi-ai`, so those requests are always
served by pi-ai. This plugin skips that layer: it registers its own `LlmAdapter` through
`ctx.llm.registerAdapter` and talks to the provider HTTP APIs directly. pi-ai keeps working
untouched, so both kinds of route coexist in one profile.

Two wire protocols are supported:

| `endpoint` | Protocol | Typical target |
|---|---|---|
| `openai-chat` | OpenAI Chat Completions | OpenRouter, Together, vLLM, most proxies |
| `anthropic-messages` | Anthropic Messages | Claude-compatible gateways |

## Install

```bash
# macOS
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add https://github.com/Unnidentified/dsh-llm-direct/archive/refs/tags/v0.1.1.tar.gz
```

```powershell
# Windows PowerShell
$DSH = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $DSH plugin --profile desktop add https://github.com/Unnidentified/dsh-llm-direct/archive/refs/tags/v0.1.1.tar.gz
```

Or paste the repository URL into the app's **Install plugin** field. That path needs `git`
on the machine, which stock Windows does not have — use the tarball URL there.

The `desktop` profile has to exist first: open the app once, quit it fully, then run the
command. Then **restart DSH**, because plugin code loads once at startup.

## Configure

The bundle mounts the `llm-direct` row with no config, so on its own it registers nothing.
Add providers in your profile's `cordis.patch.yml`, targeting the row by id:

```yaml
- id: llm-direct
  config:
    providers:
      my-route:
        displayName: My Route
        apiKeyEnv: MY_API_KEY
        baseURL: https://api.example.com/v1
        endpoint: openai-chat
        models:
          - id: some-model
            name: Some Model
            contextWindow: 200000
            maxTokens: 32768
```

`apiKeyEnv` names an environment variable, not the key itself. If the variable is unset,
the route registers but fails on first call.

Two loader rules to keep in mind:

- A targeting patch replaces `config` wholesale. It is never deep-merged, so restate every
  field the row needs.
- Do not also `insert` a row with id `llm-direct`. Two rows sharing one id make the loader
  reject the whole tree, which shows up as *every* provider vanishing from the picker, not
  just these.

### Provider fields

| Field | Default | Notes |
|---|---|---|
| `displayName` | provider key | Label in the picker |
| `apiKeyEnv` | required | Env var holding the key |
| `baseURL` | required | Everything **before** the path. The adapter appends `/chat/completions` (`openai-chat`) or `/v1/messages?beta=true` (`anthropic-messages`) itself. |
| `endpoint` | required | `openai-chat` or `anthropic-messages` |
| `contextWindow` | `1048576` | Provider-level default |
| `defaultMaxTokens` | `32768` | Provider-level default |
| `defaultInput` | `[text]` | Modalities assumed when a model omits them |
| `reasoningEfforts` | unset | Map harness level names to the provider's own strings, or `false`. **Without this, no reasoning controls appear and no effort is sent.** |
| `reasoning` | unset | Which level is preselected, by name |
| `cacheControl` | `none` | Anthropic only: `none`, `short`, `long` |
| `cacheRetention` | `none` | OpenAI only: `none`, `short`, `long` |
| `models` | `[]` | List of model entries |

Each model entry takes `id` (required), `name`, `description`, `contextWindow`,
`maxTokens`, `inputModalities`, and an optional `reasoningEfforts` map.

## Reasoning

The two protocols express this differently, and the adapter covers both.

On `openai-chat` the level goes out as `reasoning_effort`. If your provider uses different
strings, `reasoningEfforts` maps harness names to theirs:

```yaml
reasoningEfforts:
  low: minimal
  high: high
```

Anthropic has no effort string, only a thinking-token budget, so the selected level becomes
one: 1024 / 2048 / 4096 / 8192 / 16384 / 32768 tokens. `maxTokens` is raised to sit at
least 1024 above the budget, since the provider requires the ceiling to exceed it.

Thinking is enabled on the request and reasoning deltas stream back to you. Prior reasoning
blocks are **not** replayed on later turns — that would need signature round-tripping, which
most Anthropic-compatible gateways do not supply.

## Images

Images go through the harness attachment plane and are sent natively — as
`image_url` data URLs on OpenAI routes, as base64 source blocks on Anthropic routes.

- The model has to advertise image input (`inputModalities: [text, image]`). If it does not,
  images are projected away before sending, so a text-only model never receives one.
- A model that *does* accept images but finds no attachment service mounted fails with
  `UNSUPPORTED_CONTENT` rather than dropping them silently.
- Oversized sets are trimmed oldest-first to `imageBudget` (default 20 images / 40 MB), and
  each dropped image becomes a visible placeholder.
- `imageTarget` (default 1568×1568, 5 MB) picks the request size the attachment provider
  derives.

## Cache behaviour

Both defaults are `none`, and in most cases that is right: providers cache prompt prefixes
automatically.

`cacheControl` adds `cache_control` markers to the system block and last tool on Anthropic
routes. `cacheRetention` sends `prompt_cache_retention` on OpenAI routes —
`short` = `"in_memory"`, `long` = `"24h"`. Those are the only two values some gateways
accept; `5m`, `1h` and `30m` come back as 400.

On gateways that route one model id across several upstream providers, `cacheRetention` also
acts as a routing control. Each upstream keeps its own cache, so an unpinned session starts
cold wherever it lands. Only the upstream that declares `prompt_cache_retention` support
survives the field, so sending it pins requests to that one upstream and keeps a single cache
namespace warm across sessions. The trade-off is losing automatic failover to the others.

## Notes

- Usage accounting works on both branches. On Anthropic routes the real usage arrives in
  `message_delta`, because `message_start` reports zeros.
- Streaming only.
- `stop` maps to `stop` on OpenAI routes and `stop_sequences` on Anthropic ones.
- Files are not uploaded; a `file` block becomes a harness file handle.

## License

MIT
