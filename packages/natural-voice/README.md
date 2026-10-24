# dsh-plugin-natural-voice

A slash-command front end for the `natural-voice` skill, for the DeepSeek
Harness desktop profile.

```
/voice polish @apuntes/tema4.md
/voice critique @draft.md
/voice write a short README section on snapshot verification
```

## The problem this solves

The skill ships as `SKILL.md` plus five reference modules (26k tokens of `.md`
between them). The Host's own `/natural-voice` gesture injects `SKILL.md`
(2.3k tokens) and nothing else, then tells the model to load references "on
trigger". Nothing in the injected text says which trigger applies to the
request in front of it, so the rewrite runs on the priority table alone. Every
rule that decides whether an edit is an improvement — the minimal-diff
discipline, the cohesion floor, the per-mode contract — lives in a module that
never got opened.

`/voice` closes that gap in one turn, and it does the four things the model
would otherwise have to decide for itself:

| Step | What the command does | Why not leave it to the model |
|---|---|---|
| Route | Reads the mode from the first word | The default (`edit`) is wrong for a review request, and "which mode?" costs a round trip |
| Load | Injects `SKILL.md` plus **only** the modules that mode names | Loading all five costs 26k tokens and dilutes the contract |
| Audit | Runs `eval_bench.py` on the draft and prints the transcript into the step | The model cannot run the bench without a tool round trip, and often does not think to |
| Contract | Injects the mode's surface + invariants verbatim | Every failure found in the rewrite audit traced back to a rule that was in a module and not in the packet |

## Modes and what each loads

| Mode | Modules | Packet | Deliverable |
|---|---|---|---|
| `edit` (default) | `cutting.md` | ~7.2k tok | minimal diff + change note |
| `polish` | `prose-craft.md` | ~10.6k tok | same substance, better sentences |
| `write` | `voice-es.md`, `cross-lingual.md`, `prose-craft.md` | ~17.6k tok | new text + assumptions line |
| `critique` | `cutting.md` | ~7.2k tok | findings only, no rewrite |
| `harmonize` | `cross-lingual.md`, `prose-craft.md` | ~13.1k tok | unified text + conflict list |

`evidence.md` (7.3k tokens) is the provenance register — every rule traced to a
source. No mode loads it by default; it is the one file you open deliberately.

**Why `edit` deliberately does not load `prose-craft.md`.** That module teaches
five sentence-shape variations. Handing it to a minimal-diff mode is what
produces the over-editing the mode exists to prevent: five alternative shapes
plus "keep the author's phrasing" resolves in favour of the shapes. The
cohesion rule the module also carries is moved into the always-injected
invariants, so dropping the module does not drop the rule.

## Body forms

```
/voice <text>                     inline body, default mode
/voice <mode> <text>              named mode
/voice <mode> @file               read the draft from a file
/voice <mode> @draft @source      second file is the fact source (--source)
/voice --help                     usage
```

`@path` is resolved by the command, not by the model. A bad path is an error
message; it is never rewritten as the literal string `@draft.md`.

A leading word that **is** a mode name is read as the mode, case-insensitively,
so `/voice Polish the intro` selects `polish` and edits "the intro". The reply
names the mode that was chosen, so a misread is visible in the next line rather
than silent. A near-miss (`polsih`) is reported as a typo with the intended
mode named, not silently treated as prose.

## Install

The plugin is authored as an ordinary workspace package, then installed into the
profile with `plugin_manager`. Do not hand-edit the profile's `package.json` or
`cordis.patch.yml`; `install_bundle` performs those steps.

```
plugin_manager  action=install_bundle  target=<abs path to this package dir>
```

Then confirm the row is live:

```
plugin_manager  action=list_plugins
```

Both calls need approval unless the session already has Full access. Changes
persist across sessions in that profile.

### Restart, then confirm

`/voice` is registered when the profile is **composed at startup**. A running
app does not pick up a new row, so restart the harness after installing. If
`/` still does not list `voice`, the row failed to import and the harness says
so on stderr at boot:

```
dsh: warning: 1 entry did not activate
natural-voice (dsh-plugin-natural-voice): failed to import
```

Run `dsh --profile <name> --dump-config-schema` for the precise reason; each
row carries a `status`, and an import failure appears under diagnostics as a
`Cannot find package …` line naming the file that asked for it. (The `desktop`
profile refuses this from the CLI — copy the profile directory to a new name
and dump that.)

### Install mode decides which imports are legal

This is the failure that kept `/voice` off the menu, and it is invisible from
the package's own test suite because the tests run with plain `node`, whose
resolution differs from the Host's.

`plugin_manager` installs a local path as a **`link:`** — a symlink in the
profile's `node_modules`. The Host resolves a plugin's bare imports
(`@deepseek-ai/*`) out of the *profile's* module scope. For a linked plugin,
Node resolves from the symlink's realpath, which is outside the profile, so the
Host's resolution never applies there. A linked plugin must therefore import
**only** `node:` builtins and its own relative files.

| plugin | install | imports `@deepseek-ai/*` | loads |
|---|---|---|---|
| `dsh-plugin-exa-search` | `link:` | no | ✅ |
| `dsh-plugin-natural-voice` | `link:` | **no** (was `dsh-llm`) | ✅ |
| `vision-relay` | `file:` | 3 packages | ✅ |
| `dsh-compaction-instant` | `file:` | 7 packages | ✅ |

So: a `link:` install must be dependency-free, and a package that needs
`@deepseek-ai/*` must be a `file:` copy inside the profile. This package takes
the first route — `lib/command.js` builds its own user message rather than
calling `createUserMessage` from `@deepseek-ai/dsh-llm`, which is three lines
and one `randomUUID()`. `test/render.test.mjs` fails if a bare specifier ever
comes back.

Because the profile's `package.json` uses `link:` for this package, edits to
this directory take effect on the next restart with no reinstall.

Configure the skill directory if it moves. The default is the path the skill
currently lives at; `$DSH_NATURAL_VOICE_DIR` overrides it, and a `skillDir` in
the profile patch is the explicit form:

```yaml
- id: natural-voice
  name: dsh-plugin-natural-voice
  config:
    skillDir: /abs/path/to/natural-voice
    python: /abs/path/to/python3     # optional; defaults to PATH python3,
                                     # then to the DSH bundled runtime
```

### Why a command and not a skill

Both paths can coexist and they target different jobs:

- `/natural-voice` (the skill gesture) injects `SKILL.md` and lets the model
  decide. Keep it for the case where you want the model to choose.
- `/voice` (this command) fixes the mode, does the routing, runs the bench, and
  injects exactly the modules that mode needs. Use it when you know what you
  want done.

Neither replaces the other, and both read the same `SKILL.md`, so a rule change
lands in one file.

### How the packet reaches the model

Through `agent.followup(...)`, which is `send(message, "next-turn", true)`. The
`true` is the point: it calls `wakeDriver`, so the agent actually runs. The
Host's own `/prompt` admission uses the same call, and `/goal` uses it from a
command handler exactly as this one does.

This matters because the two near-miss alternatives both look correct and both
leave the model idle:

- `session.append("user/message", …)` writes the message to the durable log and
  wakes nothing. `wakeDriver` is reachable only from `send`. The packet lands in
  the transcript, the command reports success, and no turn ever starts — the
  transcript claims the work was handed over when it was only filed.
- `runMaintenance(() => …)` takes the agent out of `idle` and holds it in
  `maintenance` for the duration, which suppresses the wake it was wrapped
  around. Inside a command handler it is the wrong tool; it is for work that
  must *not* be interrupted by a turn.

The source kind is `skill-invocation` (`{ kind, name, form: "instructions" }`),
the union member the Host defines for "these are a skill's instructions". The
built-in skill gesture emits it and the chat UI renders it as a skill banner.
The earlier `{ kind: "plugin", … }` is not in the Host's `MessageSourceMap`;
it passes runtime validation, which only checks that `kind` is a nonempty
string, so nothing complained.

### A note on the name

`/voice` is a short alias. Skill names and command names resolve in separate
namespaces, but a skill named `voice` would collide in the `/` menu's display.
The skill is `natural-voice`; the command is `voice`. If you prefer them to
match, rename the command's `name` field — it is one line in `lib/command.js`.

## Verify the install

```bash
node --check lib/index.js && node --check lib/command.js && node --check lib/manifest.js
node test/manifest.test.mjs    # grammar, mode table, path splitting
node test/packet.test.mjs      # every manifest module exists on disk; budgets hold
node test/e2e.test.mjs         # real bench, both interpreters, real packet sizes
node test/render.test.mjs      # the rendered packet names a real base directory
```

`render.test.mjs` is the one that asserts on the packet's CONTENT. The other three
measured its size, which is how `Base directory for this skill: undefined` survived
every check: the arithmetic was right and the string was wrong. `packet.test.mjs` is
the one that matters after a skill edit: it fails loudly if
a reference module is renamed or removed, instead of the packet silently losing
the material the mode was chosen for.

## Known limits

- **The bench needs a file.** Inline bodies are written to
  `<skillDir>/runs/scratch/` so the audit can run. Nothing is written to your
  workspace.
- **The bench sees numbers, identifiers and acronyms.** It does not notice a
  dropped clause that contains none of those, and it does not notice fabricated
  prose. This is why the `FACT FIDELITY` invariant asks for a sentence-by-sentence
  walk; the bench cannot substitute for it.
- **`fractal_summary` is advisory and fires on a legitimate closing paragraph.**
  `en resumen` also counts toward the cohesion figure, so the two signals
  conflict by design. The invariant says which way to resolve it.
- **Approximate token counts** are `chars / 4`, not a real tokenizer.
