# dsh-everything

**Every plugin, theme and tweak for [DeepSeek Harness](https://github.com/deepseek-ai), in one install.**

Model adapters, the compaction engine, MCP servers, appearance mods, the settings pages that tie them together. Twenty plugins that each need their own CLI incantation, collapsed into one command.

No API keys ship in this repo, you need to bring your own.

---

### Table of Contents

- [Quick Start](#quick-start)
- [Bring your own keys](#bring-your-own-keys)
- [What you actually get](#what-you-actually-get)
- [The two tools that need a runtime](#the-two-tools-that-need-a-runtime)
- [Updating](#updating)
- [Under the hood](#under-the-hood)
- [Licence](#licence)

---

## Quick Start

Just two steps:

**1. Open DeepSeek Harness once, then fully quit it.** Not just the window, quit the app. This creates the profile that the CLI writes into, and without it there is nothing to install into.

**2. Install.** Either route works:

```bash
./dsh-everything            # macOS / Linux
.\dsh-everything.ps1        # Windows PowerShell
```

Or paste this into **Settings > Plugins > Add plugin**:

```
https://github.com/Unnidentified/dsh-everything/archive/refs/tags/v1.1.1.tar.gz
```

Reopen the app. That is it: twenty plugins, already wired to each other.

> [!IMPORTANT]
> **Use the `.tar.gz` link, never the bare repository URL.**
> `https://github.com/Unnidentified/dsh-everything` is a *git* dependency, so pnpm shells out to `git` to resolve it. A stock Windows install has no `git` on `PATH` and fails with `ERR_PNPM_GIT_RESOLVE_FAILED`. The tarball link is plain HTTPS and needs nothing extra.

---

## Bring your own keys

Every provider here reads its key from either the credential store or an environment variable. **Settings > Provider keys** handles all of them on one page:

| Provider | For | Get one |
|---|---|---|
| **Merge Gateway #1** | the `merge-direct` provider | [gateway.merge.dev](https://gateway.merge.dev/settings/api-keys) |
| **Merge Gateway #2** | the `merge-direct-2` provider | [gateway.merge.dev](https://gateway.merge.dev/settings/api-keys) |
| **Concentrate AI** | `concentrate-direct` | [api.concentrate.ai](https://api.concentrate.ai/) |
| **Exa** | the Exa search tool | [dashboard.exa.ai](https://dashboard.exa.ai/api-keys) |
| **DeepSeek** | the built-in `web_search` provider | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| **Antigravity** | Gemini routes, search, image, video | sign in on **Settings > Antigravity** |

Each row tells you whether a key is stored, never what it is. Press **Save**, or **Clear** to remove it. An environment variable of the same name wins over anything saved here.

> [!TIP]
> **Two Merge accounts, two keys.** The `#1` and `#2` suffixes are not cosmetic. They let the model picker show both accounts side by side, and a single Merge key sometimes carries only one account's balance.

---

## What you actually get

### Models

`dsh-llm-direct` talks to OpenAI- and Anthropic-compatible endpoints directly instead of routing every request through pi-ai. `dsh-merge-preset` adds Merge Gateway models with their own Settings page. `dsh-antigravity-auth` brings the Google account, plus search, image and video. `vision-relay` lets a text-only model reason about an image.

The picker shows **`DeepSeek-V4.1-Flash-Merge#1`**, **`GLM5.3-Flash-Merge#1`**, and the matching `#2` pair for your second account. Flash rows carry the same blue **1017** pill the official DeepSeek model uses. Default is Flash on account #2, high thinking.

### Context and cost

`dsh-compaction-instant` replaces the built-in engine with near-lossless compaction, and adds `tool-recall` and `command-recall` so a compacted turn can still reach its own history. `dsh-plugin-save-token` compresses oversized tool output and shows the saved-token strip in the composer. `usage-stats` does the token and cache accounting. `dsh-loop-detector` catches a model repeating itself before it burns your budget.

### Interface

`dsh-client-ui-tweaks` is the appearance mod. `theme-tuner` edits theme colours live. `dsh-plugin` *is* the Plugins settings page. `archive-manager` puts archiving in the sidebar, `move-session` moves a session between workspaces.

### Tools

`exa-search`, `reddit-playwright` (reads Reddit past the cookie wall), `packet-tracer-mcp`, `natural-voice` (`/voice`), `filesnap`, and `stalled-turn-continue`, which resumes a turn that hung instead of making you retype it.

---

## The two tools that need a runtime

Both work out of the box on a normal machine.

**Reddit** uses a browser you already have: Chrome, Edge or Chromium. If there is not one, it fetches Playwright's Chromium on first use. Nothing to do.

**Packet Tracer** needs a Python that can `import packet_tracer_mcp`. It checks your venv at `~/.local/share/dsh-mcp/packet-tracer` first, then system `python3`. If neither has the module:

```bash
python3 -m venv ~/.local/share/dsh-mcp/packet-tracer
~/.local/share/dsh-mcp/packet-tracer/bin/pip install "mcp[cli]>=1.13,<2" "pydantic>=2.11,<3" packet-tracer-mcp
```

```powershell
# Windows: same thing, Scripts\ instead of bin/
python -m venv $env:USERPROFILE\.local\share\dsh-mcp\packet-tracer
& $env:USERPROFILE\.local\share\dsh-mcp\packet-tracer\Scripts\pip install "mcp[cli]>=1.13,<2" "pydantic>=2.11,<3" packet-tracer-mcp
```

Override either path: `DSH_PACKET_TRACER_PYTHON` for the interpreter, `DSH_REDDIT_CHROMIUM` for the browser.

---

## Updating

Re-run the installer. It replaces the bundle in place; nothing else needs touching.

---

## Under the hood

```
cordis.patch.yml     one insert list, every plugin row, each id exactly once
package.json         the packages as file: deps, plus hoisted runtime deps
packages/<name>/     one self-contained plugin per directory
```

Bundle rows restate `config` in full on purpose. A targeting patch **replaces** `config` wholesale rather than merging into it, so a partial copy would silently drop the rest.

Want one plugin on its own instead? Every `packages/<name>` installs independently.

---

## Licence

MIT for this packaging. Each `packages/*` keeps its upstream licence.
