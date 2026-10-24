# dsh-everything

Every plugin, theme and tweak for [DeepSeek Harness](https://github.com/deepseek-ai) in one install.

Plugins, appearance mods, MCP servers, the compaction engine, the model adapters, and the settings that tie them together — default model, provider rows, font size, chat layout. One command and it's all back.

**No API keys are included.** You add your own. Every provider here reads its key from an environment variable or a Settings page, and neither lives in this repo.

### Installation

1. open DeepSeek Harness once, then **fully quit it** (this creates the profile the CLI needs)

2. install it — either way works:

```bash
./dsh-everything          # macOS / Linux
.\dsh-everything.ps1      # Windows PowerShell
```

or paste this into **Settings → Plugins → Add plugin**:

```
https://github.com/Unnidentified/dsh-everything/archive/refs/tags/v1.0.0.tar.gz
```

3. reopen DeepSeek Harness

> Use the `.tar.gz` link, not `https://github.com/Unnidentified/dsh-everything`. The bare repo link is a **git** dependency, and pnpm shells out to `git` to resolve it — which a stock Windows install doesn't have, so it fails with `ERR_PNPM_GIT_RESOLVE_FAILED`. The tarball link downloads over plain HTTPS and needs nothing extra.

### Adding your keys

Nothing here contains a key. Here's where each one goes:

| What | Where |
|---|---|
| Merge Gateway #1 | Settings → **Merge Gateway** → paste → Save key |
| Merge Gateway #2 | needs `MERGE_GATEWAY_API_KEY_2` in the environment |
| Antigravity | Settings → **Antigravity** → sign in |
| Exa search | `/exa key <value>`, or `EXA_API_KEY` in the environment |
| Concentrate AI | `CONCENTRATE_API_KEY` in the environment |
| DeepSeek API key | `DEEPSEEK_API_KEY` in the environment |

Keys pasted into a Settings page land in the DSH credential store and are never read back into the browser. Keys named as environment variables are read from the process that starts DeepSeek Harness.

Two things need a one-time setup of their own:

```bash
# Packet Tracer — it talks to a Python process
python3 -m venv ~/.local/share/dsh-mcp/packet-tracer
~/.local/share/dsh-mcp/packet-tracer/bin/pip install "mcp[cli]>=1.13,<2" "pydantic>=2.11,<3" packet-tracer-mcp

# Reddit tool — Playwright's browser isn't bundled
npx playwright install chromium
```

### What's inside

**Models** — `dsh-llm-direct` (native OpenAI/Anthropic adapters, no pi-ai), `dsh-merge-preset` (Merge Gateway models with their own Settings page), `dsh-antigravity-auth` (account + search, image, video), `vision-relay` (lets a text-only model act on images).

**Context and cost** — `dsh-compaction-instant` (near-lossless compaction, replaces the built-in engine, adds `tool-recall` and `command-recall`), `dsh-plugin-save-token` (compresses big tool output, shows the saved-tokens strip), `usage-stats` (token and cache accounting), `dsh-loop-detector` (catches a model repeating itself).

**Interface** — `dsh-client-ui-tweaks` (the appearance mod), `theme-tuner` (live theme colours), `dsh-plugin` (the Plugins settings page), `archive-manager` (sidebar archiving), `move-session` (move a session between workspaces).

**Tools** — `exa-search`, `reddit-playwright` (reads Reddit past the cookie wall), `packet-tracer-mcp`, `natural-voice` (`/voice`), `filesnap` (file snapshots), `stalled-turn-continue` (resumes a hung turn).

Model picker shows `DeepSeek-V4.1-Flash-Merge#1`, `GLM5.3-Flash-Merge#1`, and the `#2` pair for the second account. The Flash rows carry a small orange **1017** pill, the same marker the official DeepSeek model uses. Default is Flash on account #2 at high thinking.

### Updating

Re-run the installer. It replaces the bundle in place.

### If you already had these plugins

Don't install both this bundle and the individual packages — each `packages/*` carries its own patch, so the same plugin ends up as two rows with one id. It boots, but you'd have two copies of a plugin and no clear winner. Remove the individual installs first:

```bash
dsh plugin --profile desktop remove dsh-client-ui-tweaks
# ...and the rest
```

### Layout

```
cordis.patch.yml     one insert list, all 23 plugin rows, each id once, plus 13 core overrides
package.json         the 19 packages as file: deps, and their hoisted runtime deps
packages/<name>/     one self-contained plugin per directory
```

Want a plugin on its own instead of the bundle? Each `packages/<name>` installs by itself.

### License

MIT for this packaging. Each `packages/*` keeps its upstream license.
