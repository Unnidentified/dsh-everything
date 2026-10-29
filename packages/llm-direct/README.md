# dsh-llm-direct

**Point DeepSeek Harness at any OpenAI- or Anthropic-compatible endpoint, and skip pi-ai while you do it.**

DSH's Models page writes custom providers into `llm-pi-ai`, so every request through it is served by pi-ai. This plugin goes around that: it registers its own `LlmAdapter` via `ctx.llm.registerAdapter` and speaks the provider's HTTP API directly.

pi-ai keeps working untouched. Both kinds of route live in one profile without arguing.

---

### Table of Contents

- [Install](#install)
- [Configure](#configure)
- [Provider fields](#provider-fields)
- [Pinning a vendor](#pinning-a-vendor)
- [Reasoning](#reasoning)
- [Images](#images)
- [Cache behaviour](#cache-behaviour)
- [Notes](#notes)
- [Licence](#licence)

---

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

Two things that trip people up, both avoidable:

- **The `desktop` profile has to exist first.** Open the app once, quit it fully, then run the command.
- **Restart DSH afterwards.** Plugin code loads once, at startup.

> [!NOTE]
> Pasting the repository URL into **Install plugin** needs `git` on the machine. Stock Windows does not have it, so use the tarball URL there instead.

---

## Configure

The bundle mounts the `llm-direct` row with no config, so on its own it registers nothing. Add providers in your profile's `cordis.patch.yml`, targeting the row by id:

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

`apiKeyEnv` names an **environment variable**, not the key itself. If the variable is unset the route still registers, it just fails on the first call.

Two loader rules worth reading before you edit:

- A targeting patch replaces `config` **wholesale**. It is never deep-merged, so restate every field the row needs.
- Never `insert` a second row with id `llm-direct`. Two rows sharing one id make the loader reject the entire tree, and what you *see* is every provider vanishing from the picker, not just these.

---

## Provider fields

| Field | Default | Notes |
|---|---|---|
| `displayName` | provider key | Label in the picker |
| `apiKeyEnv` | required | Env var holding the key |
| `baseURL` | required | Everything **before** the path. The adapter appends `/chat/completions` or `/v1/messages?beta=true` itself. |
| `endpoint` | required | `openai-chat` or `anthropic-messages` |
| `contextWindow` | `1048576` | Provider-level default |
| `defaultMaxTokens` | `32768` | Provider-level default |
| `defaultInput` | `[text]` | Modalities assumed when a model omits them |
| `reasoningEfforts` | unset | Map harness level names to the provider's own strings, or `false`. **Without this, no reasoning controls appear and no effort is sent.** |
| `reasoning` | unset | Which level is preselected, by name |
| `vendor` | unset | Pin the serving upstream. See below. |
| `cacheControl` | `none` | Anthropic only: `none`, `short`, `long` |
| `cacheRetention` | `none` | OpenAI only: `none`, `short`, `long` |
| `models` | `[]` | List of model entries |

A model entry takes `id` (required), `name`, `description`, `contextWindow`, `maxTokens`, `inputModalities`, `vendor`, and an optional `reasoningEfforts` map.

---

## Pinning a vendor

Gateways like Merge route one model id across several upstream vendors. **Prompt caches are per-vendor**, so an unpinned route that drifts between them pays to re-read a cold prefix every time it moves. At 60k-token prompts that is roughly an 18x spike on the affected request.

`vendor` pins the upstream, either on the provider or on one model. Per-model wins.

```yaml
providers:
  merge-direct:
    vendor: particle          # default for every model in this row
    models:
      - id: zai/glm-5.3-flash
        vendor: pareto        # overrides the row default
```

Omitted, it stays out of the request body and the gateway picks the cheapest eligible route.

> [!WARNING]
> **A pin is a capability claim, and a wrong one is a hard failure.** Pinning a vendor that cannot serve what the request needs returns `capability_unavailable` and the turn dies. `deepinfra`, for instance, serves `deepseek/deepseek-v4.1-flash-1017` cheaply but rejects `reasoning` on it outright, so any thinking turn fails there no matter how cheap the input price looks.
>
> Before pinning, confirm the vendor accepts *every* capability you use: `reasoning`, `tools`, `image`, `streaming_tools`. Pinning is worth it only for a vendor that does.

---

## Reasoning

The two protocols express reasoning differently, and the adapter covers both.

On `openai-chat` the level goes out as `reasoning_effort`. If your provider uses its own strings, map them:

```yaml
reasoningEfforts:
  low: minimal
  high: high
```

Anthropic has no effort string, only a thinking-token budget, so the selected level becomes one: **1024 / 2048 / 4096 / 8192 / 16384 / 32768**. `maxTokens` is raised to sit at least 1024 above the budget, because the provider requires the ceiling to exceed it.

Thinking is enabled on the request and reasoning deltas stream back to you. Prior reasoning blocks are **not** replayed on later turns. That needs signature round-tripping, which most Anthropic-compatible gateways do not provide.

---

## Images

Images travel through the harness attachment plane and are sent natively: `image_url` data URLs on OpenAI routes, base64 source blocks on Anthropic ones.

- The model has to advertise `inputModalities: [text, image]`. Otherwise images are projected away before sending, so a text-only model never receives one.
- A model that *does* accept images but finds no attachment service mounted fails with `UNSUPPORTED_CONTENT` instead of dropping them quietly.
- Oversized sets are trimmed oldest-first to `imageBudget` (default 20 images / 40 MB), and each dropped image becomes a visible placeholder rather than disappearing.
- `imageTarget` (default 1568x1568, 5 MB) sets the request size the attachment provider derives.

---

## Cache behaviour

Both defaults are `none`, and in most cases that is correct, because providers cache prompt prefixes automatically.

`cacheControl` adds `cache_control` markers to the system block and last tool on Anthropic routes. `cacheRetention` sends `prompt_cache_retention` on OpenAI routes, where `short` = `"in_memory"` and `long` = `"24h"`. Those are the only two values some gateways accept; `5m`, `1h` and `30m` come back 400.

On a gateway that routes one model id across several upstreams, `cacheRetention` doubles as a routing control. Each upstream keeps its own cache, so an unpinned session starts cold wherever it lands. Only the upstream that declares support for the field survives it, which pins requests to that one upstream and keeps a single cache namespace warm. The trade-off is losing automatic failover to the others.

---

## Notes

- Usage accounting works on both branches. On Anthropic routes the real numbers arrive in `message_delta`, because `message_start` reports zeros.
- Streaming only.
- `stop` maps to `stop` on OpenAI routes and `stop_sequences` on Anthropic ones.
- Files are not uploaded. A `file` block becomes a harness file handle.

---

## Licence

MIT
