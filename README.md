# dsh-everything-1.1.44

Every plugin, theme and tweak for [DeepSeek Harness](https://github.com/deepseek-ai), in one install.

Model adapters, the compaction engine, MCP servers, appearance mods, the settings pages that tie them together. Twenty plugins that would need their own CLI incantation, collapsed into one command.

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

1. Open DeepSeek Harness once, then fully quit it. Not just the window, quit the app. This creates the profile that the CLI writes into, and without it there is nothing to install into.

2. Install the bundle. Either route works:

```bash
./dsh-everything            # macOS / Linux
.\dsh-everything.ps1        # Windows PowerShell
```

Or paste this into **Settings > Plugins > Add plugin**:

```
https://github.com/Unnidentified/dsh-everything/archive/refs/tags/v1.1.44.tar.gz
```

Reopen the app. That is it: twenty plugins, already preconfigured and wired to each other correcly.

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
| **TinyFish #1 / #2** | the `tinyfish` and `tinyfish-2` MCP connections | [agent.tinyfish.ai](https://agent.tinyfish.ai/) |

Each row tells you whether a key is stored, never what it is. Press **Save**, or **Clear** to remove it. An environment variable of the same name wins over anything saved here.

A TinyFish key is delivered twice on save: into the credential store, and into the owner-only file its MCP connection reads. Those two states are reported separately, so a stored key that has not reached its connection reads **Stored, not connected** rather than looking healthy while the tools fail.

### Turning a whole connection off

The same page ends with a **Connections** section: **TinyFish** (both accounts at once), **TinyFish #1 only**, **TinyFish #2 only**, and **Cisco Packet Tracer**.

These flip the same persisted per-plugin switch the **Plugins** page flips, so there is no second setting to drift out of sync. Turning one off unmounts the `mcp-client` row entirely: its tools leave the model's tool list and its server instructions leave the system prompt. Measured on this machine, 80 TinyFish tools were listed while enabled and 0 after switching them off.

TinyFish also ships six **skills** — guidance describing when to use each of its tools. That guidance is served by a different plugin, so switching the MCP rows off does not remove it, and a model would otherwise keep reading instructions for tools it can no longer call. The TinyFish switch therefore moves those six skill directories into a sibling `skills.disabled` folder outside every scanned root, and restores them when switched back on. It is a rename within one filesystem, so the files are untouched: same contents, same permissions. If a skill is left behind, the row says how many are still loaded rather than reporting a clean off.

> [!NOTE]
> Two Merge accounts, two keys (the `#1` and `#2` suffixes are not purely for cosmetics). This allows you to switch between your two 10$/month free allowance, using a temp-mail account or a temporal number (you can actually use the same credit card).

---

## What you actually get

### Models provider

`dsh-llm-direct` talks to OpenAI- and Anthropic-compatible endpoints directly instead of routing every request through pi-ai. `dsh-merge-preset` adds Merge Gateway models with their own Settings page. `dsh-antigravity-auth` brings the Google account, plus search, image and video. `vision-relay` lets a text-only model reason about an image.

The picker shows **`DeepSeek-V4.1-Flash-Merge#1`**, **`GLM5.3-Flash-Merge#1`**, and the matching `#2` pair for your second account. Flash rows carry the same blue **1017** pill the official DeepSeek model uses. Default is Flash on account #2, high thinking.

### Context stuff

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
