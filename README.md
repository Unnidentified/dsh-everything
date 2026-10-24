# dsh-everything

Every plugin, theme and tweak for DeepSeek Harness in one installable bundle.

One command puts the whole set back — the plugins, the appearance mods, the MCP
servers, the compaction engine, the model adapters — already wired to each
other. No API keys are included; you add your own afterwards.

## Install

Open DeepSeek Harness once, then quit it. That creates the profile the CLI
needs.

**From a terminal:**

```bash
./dsh-everything           # macOS / Linux, defaults to the desktop profile
./dsh-everything web       # another profile by name
.\dsh-everything.ps1       # Windows PowerShell
```

**Or paste this into Settings → Plugins → Add plugin:**

```
https://github.com/Unnidentified/dsh-everything
```

Then quit and reopen DeepSeek Harness.

On Windows, the repo link needs `git` on PATH, which a stock install does not
have. Use the PowerShell wrapper there — it downloads a tarball over HTTPS and
needs no git.

## Add your keys

Nothing here ships a key. Each provider row names an environment variable, and
the plugin's own Settings page is where you paste it.

| What | Where the key goes |
|---|---|
| Merge Gateway | Settings → **Merge Gateway** → paste → Save key |
| DeepSeek / other `llm-direct` providers | environment, per the table below |
| Antigravity | Settings → **Antigravity** → sign in |

| Variable | Used by |
|---|---|
| `MERGE_GATEWAY_API_KEY` | Merge Gateway (direct) |
| `MERGE_GATEWAY_API_KEY_2` | Merge Gateway, second account |
| `CONCENTRATE_API_KEY` | Concentrate AI (direct) |
| `DEEPSEEK_API_KEY` | DeepSeek API key provider |
| `ZAI_API_KEY`, `ORCAROUTER_API_KEY`, `COMMANDCODE_API_KEY` | the matching `llm-direct` rows |

Keys pasted into a Settings page live in the DSH credential store and are never
read back into the browser. Keys named in `apiKeyEnv` are read from the
environment of the process that starts DeepSeek Harness.

## What's in it

### Models and providers

| Plugin | What it does |
|---|---|
| `dsh-llm-direct` | Native OpenAI- and Anthropic-compatible adapters, no `pi-ai` in the path. Carries the Concentrate / Merge provider rows. |
| `dsh-merge-preset` | Merge Gateway models with its own Settings page. Needs `dsh-llm-direct` for the adapter — both are here. |
| `dsh-antigravity-auth` | Antigravity account. Four rows: the account plus search, image and video capabilities. |
| `vision-relay` | Lets a text-only model act on images: a vision model describes the image first. |

### Context and cost

| Plugin | What it does |
|---|---|
| `dsh-compaction-instant` | Deterministic, near-lossless compaction that replaces the built-in engine. Installed as the `compaction-basic` alias so built-in presets keep working. Adds `tool-recall` and `command-recall` for pulling originals back. |
| `dsh-plugin-save-token` | Structure-aware compression of large tool output, plus the saved-tokens strip above the composer. |
| `@ychris12138/dsh-usage-stats` | Token and cache accounting per session. |
| `dsh-loop-detector` | Catches a model stuck repeating itself, steers once, then cancels. |

### Interface

| Plugin | What it does |
|---|---|
| `dsh-client-ui-tweaks` | The appearance mod: context ring sized to the stat pills, path reveal in messages, and the other layout fixes. |
| `dsh-plugin-theme-tuner` | Live theme colour editing. |
| `dsh-plugin` | The **Plugins** settings page — enable, disable and configure rows without hand-editing YAML. |
| `@michengai/dsh-archive-manager` | Sidebar workspace archiving. |
| `@hucj/dsh-move-session` | Move a session between workspaces. |

### Tools and integrations

| Plugin | What it does |
|---|---|
| `dsh-plugin-exa-search` | `exa_search` and `exa_contents` as native agent tools. |
| `dsh-plugin-reddit-playwright` | `reddit_extract` — reads Reddit threads past the cookie wall as clean Markdown. |
| `@local/packet-tracer-mcp` | Cisco Packet Tracer as an MCP server. Needs its own Python environment; see below. |
| `dsh-plugin-natural-voice` | The `/voice` command, sharing one `SKILL.md` with the skill. |
| `dsh-filesnap` | File-level snapshots, so a bad edit can be rolled back. |
| `dsh-stalled-turn-continue` | Resumes a turn that stalled instead of leaving it hung. |

## The one piece that needs setup

Packet Tracer talks to a Python process, and that process needs `packet_tracer_mcp`
installed. The bundle does not ship a Python environment.

```bash
python3 -m venv ~/.local/share/dsh-mcp/packet-tracer
~/.local/share/dsh-mcp/packet-tracer/bin/pip install "mcp[cli]>=1.13,<2" "pydantic>=2.11,<3" packet-tracer-mcp
```

That is the default path the row looks for. Keep the venv somewhere else and
point at it with `DSH_PACKET_TRACER_PYTHON`, or override the row in your
profile's own `cordis.patch.yml`:

```yaml
- id: packet-tracer-mcp
  config:
    command: /your/path/bin/python
```

`playwright` comes as a normal dependency, but its Chromium download does not.
If the Reddit tool complains about a missing browser:

```bash
npx playwright install chromium
```

## If you already had these plugins installed

Do not keep both. This bundle inserts every row by id, and the Loader refuses
two entries sharing one id — the whole plugin tree fails to load rather than
just the duplicate.

Remove the individual installs first:

```bash
dsh plugin --profile desktop remove dsh-client-ui-tweaks
# ... and the rest, or start from a fresh profile
```

A clean profile is the reliable way:

```bash
dsh plugin --profile fresh add https://github.com/Unnidentified/dsh-everything
```

## After installing

| Check | Expected |
|---|---|
| Settings lists **Plugins**, **Merge Gateway**, **Antigravity**, **Theme Tuner** | plugins registered |
| The model picker offers Merge / Concentrate models | `llm-direct` rows mounted |
| The composer shows the saved-tokens strip and context ring | client halves loaded |
| `@` mentions Packet Tracer tools | MCP server connected |

## Layout

```
cordis.patch.yml        one insert list, every row, each id once
package.json            the 19 packages as file: deps, plus hoisted runtime deps
packages/<name>/        one self-contained plugin per directory
```

Each `packages/*` keeps its own `cordis.patch.yml` so it still installs on its
own. The root `cordis.patch.yml` is the merged roster. Install **either** this
bundle **or** the individual packages, never both.

Runtime dependencies of the nested packages (`playwright`, `zod`, `turndown`,
`filesnap`, `@cortexkit/antigravity-auth-core`, `@deepseek-ai/schemastery`) are
declared at the root. `file:` deps are symlinked into the bundle, so pnpm never
installs their own dependencies — hoisting them here is what makes the install
resolve.

## License

MIT for this packaging. Each `packages/*` keeps its upstream license.
