# Merge Gateway for DeepSeek Harness

Adds Merge Gateway models to DSH, configured in **Settings → Providers** instead of a YAML
file.

## Install

Open DeepSeek Harness once, then quit it. This creates the `desktop` profile the CLI needs.

Then install it, either way:

**Settings → Plugins → Add plugin**, paste:

```
https://github.com/Unnidentified/dsh-merge-preset
```

**Or from a terminal:**

```bash
./dsh-merge          # macOS / Linux
.\dsh-merge.ps1      # Windows PowerShell
```

Relaunch DSH when it finishes.

> On Windows, the repo link needs `git` on PATH, which a stock Windows install does not have.
> Use the terminal wrapper there — it downloads a tarball over HTTPS and needs no git.

## Add your key

Settings → **Providers** → the Merge Gateway row → paste the key → **Save**.

The key goes into the DSH credential store. The row only ever shows *Key set* or *Not set* —
the value is never sent back to the browser.

## What you get

| Model | Context | Max output |
|---|---|---|
| `deepseek/deepseek-v4.1-flash-1017` | 1,000,000 | 384,000 |
| `zai/glm-5.3-flash[1m]` | 1,000,000 | 131,072 |

The switch on that row decides whether these models appear in the chat model menu. Switching
it off only empties the menu: a session already using one keeps running.
