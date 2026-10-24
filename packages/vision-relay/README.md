# vision-relay

Vision relay for DeepSeek Harness: when a request is about to reach a model
that cannot accept image input, a configured **vision model** looks at every
image in the request and its description travels instead — so text-only
models act on screenshots and photos instead of seeing
`[image omitted because this model accepts text only]`.

- Intercepts at the `llm/stream` waterfall, so it covers conversation turns,
  subagents, compaction, and any other model call — but never touches the
  session log: the chat still shows the real attachment, and only the wire
  request changes.
- Descriptions are cached by durable attachment id in
  `~/.dsh/storages/vision-relay.json`, so a re-sent image costs one vision
  call per image, ever, not per turn.
- Models that accept images pass through untouched; requests without images
  pass through untouched; if the vision call fails, the block falls back to
  the built-in placeholder text.

## Install

```sh
dsh plugin --profile desktop add file:/Users/gefaass/Documents/dsh/vision-relay
```

and add an insert row to the profile patch:

```yaml
- insert:
    - id: vision-relay
      name: vision-relay
      config: {}
```

## Configure

| Command | Effect |
|---|---|
| `/visionrelay` | Status: on/off, current vision model |
| `/visionrelay on` / `off` | Toggle the relay |
| `/visionrelay model <provider> <model>` | Set the vision model (must accept image input) |
| `/visionrelay clear` | Drop the description cache |

Defaults: vision model `merge-gateway / zai/glm-5.3-flash[1m]`, 60 s timeout,
2000 output tokens, reasoning effort `off`. Settings live in
`~/.dsh/storages/vision-relay.json` (same store as the cache).

## Notes

- The vision call is an isolated auxiliary request; its output enters model
  context only through the description text, clearly labeled as coming from
  a vision model.
- Offloaded image blocks (dropped to fit request image limits) are left for
  the harness's built-in projection — there is nothing to describe.
