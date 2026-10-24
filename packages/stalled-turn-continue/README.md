# dsh-stalled-turn-continue

A DeepSeek Harness (DSH) host plugin that resumes a turn which ended **successfully with reasoning only** — no text part and no tool call.

## The problem

A model sometimes emits a reasoning block and then its end-of-turn token. DSH records that turn as `turn/end` with `reason.kind: "completed"`, so the agent stops mid-thought and waits for a hand-typed "continue". `dsh-client-auto-continue` does not cover this case: it reacts to `error`, `interrupted`, `max-tokens` and `host/agent-error`, and by design ignores a completed turn.

Measured on 123 local session logs: 40 of 498 completed turns (8 %) ended without visible output, across four models. The rate depends on the model (from about 1 % to over 50 %).

## What it does

On `turn/end` with `reason.kind` `completed` or `no-visible-output`, the plugin checks the turn's last assistant message. If that message has neither a `text` part nor a tool call, it waits `graceMs` and sends one follow-up message through the agent registry.

- It ignores `error`, `interrupted`, `max-tokens`, `aborted` and `blocked`, so it runs alongside `dsh-client-auto-continue` without double resumes.
- `no-visible-output` is the kind a DSH build records when it classifies this turn itself; the plugin accepts both kinds, so such a DSH upgrade keeps it working.
- A turn with visible output resets the counter; a human message or a host `turn/start` cancels an armed resume.

## Install

```sh
dsh plugin --profile web add dsh-stalled-turn-continue
```

Restart DSH. The host log then shows:

```
[stalled-turn-continue] watching; grace=3000ms cooldown=20000ms maxConsecutive=3
```

## Config

Override the row by `id` in your profile's `cordis.patch.yml`. Do not add a second `insert` with the same `id` — that fails the load with `duplicate loader entry id`.

```yaml
- id: stalled-turn-continue
  config:
    graceMs: 3000
    cooldownMs: 20000
    maxConsecutive: 3
```

| Key | Default | Meaning |
|-----|---------|---------|
| `enabled` | `true` | `false` mounts nothing |
| `graceMs` | `3000` | Wait after `turn/end` before resuming; the host may start its own turn meanwhile |
| `cooldownMs` | `20000` | Minimum time between two resumes in one session |
| `maxConsecutive` | `3` | Resumes in a row without visible output before the plugin waits for a human |
| `continueText` | see `index.js` | Text of the follow-up message |

A patch replaces the row's whole `config`, so restate every key you want to keep.

## Test

```sh
npm test
```

## Remove

```sh
dsh plugin --profile web remove dsh-stalled-turn-continue
```

## License

MIT
