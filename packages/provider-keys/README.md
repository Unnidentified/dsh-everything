# dsh-provider-keys

The **Providers** page: every credential this profile can use, every model the chat
menu may offer, and the switches that decide it — one screen instead of five.

Two sections, each a plain group of cards:

```
Model providers          Merge Gateway #1 / #2 · Concentrate AI · Isoquant · Mistral · Antigravity
Search and web tools     Exa · TinyFish #1 / #2
```

## What a card carries

| Control | What it does |
|---|---|
| key field | writes to the DSH credential store. Write-only: the field starts empty and typing replaces the stored value, so nothing secret is ever read back into the page |
| state badge | **Key set** when the key is there, **Stored, not connected** when an MCP-backed key has not reached its connection's own file, and nothing at all when no key is set |
| row switch | hides the provider's models from the chat menu |
| models button | opens one switch per model, with the provider's own count (`5/9 models`) |

An **Antigravity** row is an account rather than a key: a Google **Sign in** button,
the account line once signed in, and the live quota per model family (five-hour and
weekly windows as percentage left). Its models come from the provider's full text
catalog, so a model the account cannot serve right now is still listed — and
switchable — marked `unavailable`.

The **Search and web tools** section carries the TinyFish switches, including the
`both accounts` one in the section header. They flip the same persisted per-plugin
switch the Plugins page flips, and turning one off also moves its six skill
directories out of every scanned root so the model stops reading guidance for tools
it can no longer call.

## Hiding is not disabling

A hidden model disappears from the dropdown and nothing else happens. The adapter
keeps resolving the route, so a session already running on that model keeps working,
and flipping the switch back restores it with the same place in the menu.

Visibility is stored once, in `$DSH_HOME/storages/llm-direct-visibility.json`, and
every adapter that serves the route reads it on each `listModels` call. The page also
emits `llm/models-updated` after a write, which is the event the chat menu refreshes
on — so a switch lands without a restart.

## Install

This package ships inside the `dsh-everything` bundle. On its own:

```bash
pnpm add /path/to/packages/provider-keys
```

then add the row to your profile patch:

```yaml
- id: provider-keys
  name: dsh-provider-keys
```

## Channel

The browser half talks to the host over the harness RPC envelope
(`client-request` → `server-response`), through `connection.rpc.call`. If the
harness cannot mount a channel from the Connection service, the same prefix is
registered directly on the WebServer, speaking the identical envelope — the page
does not know which path mounted it.

| Endpoint | Purpose |
|---|---|
| `state` | providers, key state, connections and the model-picker snapshot |
| `setKey` / `clearKey` | write or remove one credential (mirrors MCP key files) |
| `setProviderHidden` / `setModelHidden` | visibility, then `llm/models-updated` |
| `setConnection` | the per-plugin switch behind a connection row |

## Licence

MIT.
