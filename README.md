# dsh-everything-1.1.59

Every plugin, theme and tweak for [DeepSeek Harness](https://github.com/deepseek-ai), in one install.

Model adapters, the compaction engine, MCP servers, appearance mods, the settings pages that tie them together. Twenty plugins that would need their own CLI incantation, collapsed into one command.

---

### Table of Contents

- [Quick Start](#quick-start)
- [Bring your own keys](#bring-your-own-keys)
- [Choosing which models the chat menu offers](#choosing-which-models-the-chat-menu-offers)
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
https://github.com/Unnidentified/dsh-everything/archive/refs/tags/v1.1.59.tar.gz
```

Reopen the app. That is it: twenty plugins, already preconfigured and wired to each other correcly.

---

## Bring your own keys

Every provider here reads its key from either the credential store or an environment variable. **Settings > Providers** handles all of them on one page, two sections deep: **Model providers**, then **Search and web tools**.

| Provider | For | Get one |
|---|---|---|
| **Merge Gateway #1** | the `merge-direct` provider | [gateway.merge.dev](https://gateway.merge.dev/settings/api-keys) |
| **Merge Gateway #2** | the `merge-direct-2` provider | [gateway.merge.dev](https://gateway.merge.dev/settings/api-keys) |
| **Concentrate AI** | `concentrate-direct` | [api.concentrate.ai](https://api.concentrate.ai/) |
| **Isoquant** | the `isoquant` provider (DeepSeek V4.1 Flash 1017, GLM-5.3-Flash) | [isoquant.ai](https://isoquant.ai/) |
| **Mistral** | the `mistral` provider (nine models, including its DeepSeek and GLM rows) | [docs.mistral.ai](https://docs.mistral.ai/) |
| **Antigravity** | Gemini routes, search, image, video | [suntianc/dsh-antigravity-auth](https://github.com/suntianc/dsh-antigravity-auth) |
| **Exa** | the Exa search tool | [dashboard.exa.ai](https://dashboard.exa.ai/api-keys) |
| **TinyFish #1 / #2** | the `tinyfish` and `tinyfish-2` MCP connections | [agent.tinyfish.ai](https://agent.tinyfish.ai/) |

The badge tells you whether a key is set, never what it is; a row with no key shows no badge at all. Press **Save**, or **Clear** to remove it. An environment variable of the same name wins over anything saved here.

**Antigravity is an account, not a key.** Its row carries a Google **Sign in** button, the account line once signed in, and the live quota per model family — five-hour and weekly windows as percentage left. The first sign-in asks you to acknowledge that Google does not support third-party Antigravity login tools, and only then records the consent and opens the browser. **Log out** clears local state.

A TinyFish key is delivered twice on save: into the credential store, and into the owner-only file its MCP connection reads. Those two states are reported separately, so a stored key that has not reached its connection reads **Stored, not connected** rather than looking healthy while the tools fail. A key that only ever reached the file still works, and **Clear** removes it.

The DeepSeek key used by the built-in web search is *not* on this page — the harness has its own **Settings > Web search** section for it.

### Turning a whole connection off

The **Search and web tools** section carries the switches: **TinyFish, both accounts** in the section header, plus one per account below it.

These flip the same persisted per-plugin switch the **Plugins** page flips, so there is no second setting to drift out of sync. Turning one off unmounts the `mcp-client` row entirely: its tools leave the model's tool list and its server instructions leave the system prompt. Measured on this machine, 80 TinyFish tools were listed while enabled and 0 after switching them off.

TinyFish also ships six **skills** — guidance describing when to use each of its tools. That guidance is served by a different plugin, so switching the MCP rows off does not remove it, and a model would otherwise keep reading instructions for tools it can no longer call. The TinyFish switch therefore moves those six skill directories into a sibling `skills.disabled` folder outside every scanned root, and restores them when switched back on. It is a rename within one filesystem, so the files are untouched: same contents, same permissions. If a skill is left behind, the row says how many are still loaded rather than reporting a clean off.

> [!NOTE]
> Two Merge accounts, two keys (the `#1` and `#2` suffixes are not purely for cosmetics). This allows you to switch between your two 10$/month free allowance, using a temp-mail account or a temporal number (you can actually use the same credit card).

---

## Choosing which models the chat menu offers

Every provider row carries a switch, and its **models** button opens one switch per model. They are the same control at two zoom levels: the row switch hides the whole provider, the inner ones hide individual models.

Switching something off only empties the dropdown. The adapter keeps resolving the route, so a session already running on that model keeps working, and nothing has to be re-added — flip it back on and it returns with the same position in the menu.

The list is the provider's own catalog, not just what your account can serve at that moment: **Antigravity** shows every text model it knows and marks the ones unavailable to the current account, so you can hide a model before it ever appears. Hiding is instant; the chat menu re-reads the list as soon as the switch moves.

---

## What you actually get

### Models provider

`dsh-llm-direct` talks to OpenAI- and Anthropic-compatible endpoints directly instead of routing every request through pi-ai. `dsh-merge-preset` adds Merge Gateway models with their own Settings page. `dsh-antigravity-auth` brings the Google account, plus search, image and video; its sign-in, quota and per-model switches live in that same Providers page. `vision-relay` lets a text-only model reason about an image.

The picker shows **`DeepSeek-V4.1-Flash-Merge#1`**, **`GLM5.3-Flash-Merge#1`**, and the matching `#2` pair for your second account. Flash rows carry the same blue **1017** pill the official DeepSeek model uses. Default is Flash on account #2, high thinking.

Mistral's DeepSeek row is simply **`DeepSeek-V4.1-Flash`**. Its reasoning ladder is the one the API actually accepts — none, low, high, xhigh, max — as are the ladders of the other Mistral rows (large-4 adds medium, both GLM rows add max, and the Ministral/Codestral rows declare none because the API rejects the field for them).

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
