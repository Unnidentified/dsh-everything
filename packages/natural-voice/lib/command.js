/**
 * `/voice` — the human-facing entry point for the natural-voice skill.
 *
 * Why this exists rather than "type `/natural-voice` and hope". A plain skill
 * gesture injects `SKILL.md` (about 2.4k tokens) and nothing else; every rule
 * that matters for a given request lives in one of five reference modules, and
 * the model is expected to "load on trigger" — which it usually does not,
 * because nothing in the injected text says which trigger applies. The result
 * is a rewrite governed by the priority table alone.
 *
 * This command closes that gap in one turn:
 *
 *   1. resolve the body (inline text, or `@path` references resolved by the
 *      Host, not by the model, so a path typo is an error and not a rewrite of
 *      the literal string "@draft.md")
 *   2. run the skill's own `eval_bench.py` against the draft, and against the
 *      source when a second file is given
 *   3. read `SKILL.md` plus exactly the modules the mode declares
 *   4. append the known-findings transcript outside the skill wrapper, so the
 *      model starts from findings rather than from a list of files
 *
 * Everything the model needs arrives in the step. It is not asked to run the
 * bench, decide which references to open, or infer the output contract.
 *
 * @module dsh-plugin-natural-voice/command
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  BENCH_SCOPE,
  INVARIANTS,
  MODES,
  parseVoiceInput as parse,
  resolveMode,
  usage,
} from "./manifest.js";
import { approxTokens, splitReferences, stripFrontmatter } from "./text.js";

const run = promisify(execFile);

export const name = "command-natural-voice";

/**
 * Build one user message without importing `@deepseek-ai/dsh-llm`.
 *
 * This plugin used to call `createUserMessage` from that package. It does the
 * same thing in three lines:
 *
 *     createMessage({ ...input, role: "user" })
 *     createMessage(input) => deepFreeze(structuredClone({ ...input, id: brandString(randomUUID()) }))
 *
 * and `brandString` is the identity function, so the whole dependency bought
 * one `randomUUID()` and a deep freeze that `session.append` performs anyway
 * (`snapshotJsonValue` + `deepFreeze` on every event it admits).
 *
 * It was not free. Bare `@deepseek-ai/*` specifiers are resolved by the Host
 * out of the profile's own module scope, and a `link:`-installed plugin —
 * which is what this package is, a symlink under the profile's `node_modules`
 * pointing at this directory — resolves its imports from its realpath, which
 * is outside the profile, where the Host supplies nothing. The row therefore
 * failed to import and `/voice` never registered. This package then lived at
 * `~/Desktop/nv-audit/plugin-natural-voice`, so the boot diagnostic read:
 *
 *     dsh: error: [/198] Cannot find package '@deepseek-ai/dsh-llm'
 *       imported from .../plugin-natural-voice/lib/command.js
 *     dsh: warning: 1 entry did not activate
 *     natural-voice (dsh-plugin-natural-voice): failed to import
 *
 * It now lives inside the skill, at `<skill>/nv-audit/plugin-natural-voice`.
 * The location is incidental — the symlink is what makes the peer import
 * unresolvable — so moving it changed nothing about this constraint.
 *
 * Every plugin that loads from this profile holds the same invariant: the
 * `link:` ones (`exa-search`, `reddit-playwright`) import no `@deepseek-ai/*`
 * at all, and the ones that do (`vision-relay`, `compaction-instant`) are
 * `file:` copies that live inside the profile. This package is `link:`, so it
 * must own its message shape. Keep this function dependency-free: a single
 * re-added peer import takes `/voice` off the menu with no other symptom.
 *
 * The shape it must satisfy, from the Host's own types: `id` a nonempty
 * string, `role` exactly `user`, `source` an object with a nonempty `kind`,
 * `content` an array. `plugin` is deliberately not one of the union's source
 * kinds — `skill-invocation` is the kind the built-in skill gesture uses, and
 * it is what the chat UI renders as a skill banner.
 *
 * @param {{ content: readonly object[], source: object }} input - message body and provenance.
 * @returns a detached user message carrying a fresh stable identity.
 */
export function createUserMessage(input) {
  return { ...input, id: randomUUID(), role: "user" };
}

/**
 * `commands` owns registration, and nothing else is needed.
 *
 * This said `["commands", "agents"]` and that made `/voice` never appear. A hard
 * top-level `inject` gates `apply()` itself: while any named service is unbound the
 * row sits pending, `apply()` never runs, and the command is never registered. The
 * loader reports it as "pending (waiting for service: agents)" and carries on.
 *
 * `agents` was never read. The handler receives its agent through
 * `invocation.agent`, which every Agent-backed invocation supplies, so injecting the
 * registry as well was both unnecessary and fatal: an unmet service in this list
 * costs the whole row. `commands` is genuinely required, so it stays.
 *
 * `@deepseek-ai/dsh-plugin-exa-search` shows the idiom for a service that is
 * optional at mount time: `ctx.inject?.(['commands'], (c) => ...)` inside `apply()`.
 * Use that rather than adding a name here.
 */
export const inject = ["commands"];

const DEFAULT_SKILL_DIR = join(
  homedir(),
  "Desktop/Documents/agent stuff/other/skill-creator/natural-voice",
);

const BENCH_TIMEOUT_MS = 60_000;
const MAX_BENCH_BYTES = 200_000;
const MAX_INLINE_BODY_CHARS = 40_000;

/** Resolve the skill directory: explicit config, env var, then the default. */
export function resolveSkillDir(config = {}) {
  const configured = config.skillDir ?? process.env.DSH_NATURAL_VOICE_DIR;
  const dir = configured === undefined || configured === ""
    ? DEFAULT_SKILL_DIR
    : resolve(configured);
  if (!isAbsolute(dir)) {
    throw new Error(`natural-voice: skillDir must be absolute, got ${dir}`);
  }
  return dir;
}

/**
 * Resolve the python interpreter. There is no shell involved and no PATH
 * lookup beyond what the OS does for a bare name, so a missing interpreter
 * surfaces as a bench error the model can read, never as a silent skip.
 */
export function resolvePython(config = {}) {
  if (typeof config.python === "string" && config.python.length > 0) {
    return config.python;
  }
  const runtimeRoot = process.env.DSH_PRIMARY_RUNTIME;
  if (typeof runtimeRoot === "string" && runtimeRoot.length > 0) {
    const bundled = join(runtimeRoot, "dependencies", "python", "bin", "python");
    if (existsSync(bundled)) return bundled;
  }
  return "python3";
}

/** Validate configuration once, at mount time, so a bad path fails loudly. */
export function resolveConfig(config = {}) {
  const skillDir = resolveSkillDir(config);
  const python = resolvePython(config);
  return {
    skillDir,
    python,
    bench: config.bench === false ? false : true,
  };
}

/** Read one reference. A read failure is reported, never substituted. */
async function readReference(path, baseDir) {
  const abs = isAbsolute(path) ? path : resolve(baseDir, path);
  const text = await readFile(abs, "utf8");
  return { path, abs, text, words: text.split(/\s+/).length };
}

/**
 * One bench invocation. Returns either the transcript or a reason it is
 * missing; a bench failure never blocks the rewrite, because the packet is
 * still worth injecting.
 */
async function benchOnce(python, benchPath, file, config, sourcePath) {
  const args = [benchPath, "--file", file];
  if (sourcePath !== undefined) args.push("--source", sourcePath);
  try {
    const { stdout } = await run(python, args, {
      timeout: BENCH_TIMEOUT_MS,
      maxBuffer: MAX_BENCH_BYTES,
      cwd: config.skillDir,
      windowsHide: true,
    });
    return { ok: true, text: stdout.trim() };
  } catch (error) {
    // A non-zero exit is the bench reporting a FAIL verdict, which is a
    // finding, not an error. Only report a failure when there is no output.
    const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
    if (stdout.length > 0) return { ok: true, text: stdout };
    const detail = error?.code === "ENOENT"
      ? `interpreter not found: ${python}`
      : String(error?.message ?? error);
    return { ok: false, text: detail };
  }
}

/**
 * Run the bench over a temp-free path strategy: `eval_bench.py` accepts
 * `--file`, so the draft must exist on disk. Inline text is written to a
 * scratch file under the skill's `runs/scratch/` directory, which is ignored
 * by the skill's own leakage checks.
 */
async function writeScratch(dir, name, text) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, text, "utf8");
  return path;
}

/**
 * Assemble the packet text that rides ahead of the model's step.
 *
 * Deliberately shaped like the Host's own skill wrapper so the model treats it
 * as trusted local content, with the bench transcript appended after the
 * closing tag so it never looks like part of the skill's own instructions.
 */
export function renderPacket({ resolved, skillDir, skillText, moduleTexts, bench, body, references, notes }) {
  // `skillDir` arrives as a sibling key, not inside `resolved`: `resolveMode` returns
  // the mode's modules, budget and contract, and has no skill directory to give.
  // Reading `resolved.skillDir` rendered the literal string "undefined" into every
  // packet, so the model was told to resolve relative paths against a directory that
  // was never named. Keep the second read as a fallback for any caller that passes it
  // there, and fail loudly rather than shipping "undefined" again.
  const baseDir = skillDir ?? resolved?.skillDir;
  if (typeof baseDir !== "string" || baseDir.length === 0) {
    throw new Error("renderPacket: skillDir is required to name the base directory");
  }
  const parts = [
    `<skill_content name="natural-voice">`,
    "<skill_resources>",
    `Base directory for this skill: ${baseDir}`,
    "Resolve relative paths mentioned by this skill against the base directory before using them.",
    "</skill_resources>",
    "",
    "<skill_instructions>",
    skillText,
    "</skill_instructions>",
    "</skill_content>",
  ];

  for (const [relPath, text] of moduleTexts) {
    parts.push(
      "",
      `<skill_module path="${relPath}">`,
      text,
      "</skill_module>",
    );
  }

  parts.push(
    "",
    "---",
    "",
    `# /voice packet: mode \`${resolved.mode}\` (${resolved.label})`,
    "",
    "This packet was assembled by the `/voice` command from the natural-voice",
    "skill. The mode below is already chosen: do not re-derive it, and do not",
    "ask which mode is wanted.",
    "",
    "## Deliverable",
    "",
    `${resolved.surface}.`,
    "",
    "Return the artefact, not a commentary about the artefact. No preamble, no",
    '"here is your improved text", no self-assessment.',
  );

  if (resolved.modules.length > 0) {
    parts.push(
      "",
      "## Mode contract",
      "",
      ...resolved.contract.map((line) => (line.length === 0 ? "" : line)),
    );
  } else {
    parts.push("", "## Mode contract", "", ...resolved.contract);
  }

  parts.push(
    "",
    "## Invariants (every mode)",
    "",
    ...INVARIANTS,
    "",
    "## Scope of the bench",
    "",
    ...BENCH_SCOPE,
  );

  if (references.length > 0) {
    parts.push("", "## Input", "");
    for (const r of references) {
      parts.push(`- \`${r.path}\` (${r.words} words)`);
    }
  }
  if (body.length > 0) {
    parts.push("", "## Text to work on", "", "<draft>", body, "</draft>");
  }

  parts.push("", "## Bench transcript", "");
  if (bench.enabled === false) {
    parts.push("The bench was disabled for this invocation.");
  } else if (bench.draft === undefined) {
    parts.push(
      "No draft file was available to audit (inline text only, or a bench error).",
      "Read the text in `<draft>` yourself and apply the invariants above.",
    );
  } else if (bench.draft.ok) {
    parts.push("```", bench.draft.text, "```");
  } else {
    parts.push(
      `The bench could not run: ${bench.draft.text}`,
      "Proceed without it. Do not claim a bench result you do not have.",
    );
  }

  if (bench.source !== undefined) {
    parts.push("", "### Fact retention against the source", "");
    if (bench.source.ok) parts.push("```", bench.source.text, "```");
    else parts.push(`Fact retention could not run: ${bench.source.text}`);
  }

  if (notes.length > 0) {
    parts.push("", "## Notes from the command", "", ...notes);
  }

  return parts.join("\n");
}

/**
 * Execute one `/voice` invocation.
 *
 * Errors are returned as `kind: "error"` results with a readable reason. The
 * command must never turn a bad path or a missing file into a rewrite of the
 * literal string the user typed.
 */
async function execute(invocation, config) {
  const parsed = parse(invocation.rawInput);
  if (parsed.kind === "help") return { kind: "success", text: usage() };
  if (parsed.kind === "unknown-mode") {
    return {
      kind: "error",
      text: `Unknown mode "${parsed.unknownMode}". Did you mean \`${parsed.near}\`?\n\n${usage()}`,
    };
  }

  const notes = [];
  const { paths, inline } = splitReferences(parsed.body);
  const baseDir = invocation.agent?.session?.header?.cwd ?? config.skillDir;

  let references = [];
  if (paths.length > 0) {
    try {
      references = await Promise.all(
        paths.map((p) => readReference(p, baseDir)),
      );
    } catch (error) {
      return {
        kind: "error",
        text: `Could not read ${String(error?.path ?? "a reference")}: ${String(error?.message ?? error)}`,
      };
    }
  }

  const draftText = references.length > 0
    ? references.map((r) => r.text).join("\n\n")
    : inline;

  if (draftText.trim().length === 0) {
    return {
      kind: "error",
      text: `No text to work on.\n\n${usage()}`,
    };
  }
  if (inline.length > MAX_INLINE_BODY_CHARS) {
    return {
      kind: "error",
      text: `Inline body is ${inline.length} characters, over the ${MAX_INLINE_BODY_CHARS} cap. Write it to a file and use \`@path\`.`,
    };
  }

  const resolved = resolveMode(parsed.mode, config.skillDir, existsSync);
  if (resolved.missing.length > 0) {
    // The skill was reorganised and this manifest was not. Say so: a packet
    // missing a module the mode depends on is a silent quality regression.
    return {
      kind: "error",
      text: [
        `Mode \`${parsed.mode}\` needs reference modules this skill does not ship:`,
        ...resolved.missing.map((m) => `  - ${m}`),
        "",
        `Skill directory: ${config.skillDir}`,
        "Fix the manifest in dsh-plugin-natural-voice/lib/manifest.js.",
      ].join("\n"),
    };
  }

  const skillPath = join(config.skillDir, "SKILL.md");
  let skillRaw;
  try {
    skillRaw = await readFile(skillPath, "utf8");
  } catch (error) {
    return {
      kind: "error",
      text: `Could not read ${skillPath}: ${String(error?.message ?? error)}`,
    };
  }
  const skillText = stripFrontmatter(skillRaw);

  const moduleTexts = [];
  for (const abs of resolved.modules) {
    try {
      moduleTexts.push([
        `references/${abs.split("/references/")[1] ?? abs}`,
        await readFile(abs, "utf8"),
      ]);
    } catch (error) {
      return {
        kind: "error",
        text: `Could not read module ${abs}: ${String(error?.message ?? error)}`,
      };
    }
  }

  // The bench needs a file. Inline text is written to the skill's own scratch
  // directory so the invocation leaves no artefact in the user's workspace.
  let draftPath;
  try {
    draftPath = await writeScratch(
      join(config.skillDir, "runs", "scratch"),
      `voice-${Date.now()}.txt`,
      draftText,
    );
  } catch (error) {
    notes.push(
      `Could not write a scratch file for the bench: ${String(error?.message ?? error)}`,
    );
  }

  const bench = { enabled: config.bench };
  if (config.bench && draftPath !== undefined) {
    const benchPath = join(config.skillDir, "eval_bench.py");
    bench.draft = await benchOnce(config.python, benchPath, draftPath, config);
    if (references.length >= 2) {
      bench.source = await benchOnce(
        config.python,
        benchPath,
        draftPath,
        config,
        references[1].abs,
      );
    }
    if (bench.draft.ok && /FAIL/.test(bench.draft.text)) {
      notes.push(
        "The bench returned FAIL on at least one check. FAIL is a reading cue,",
        "not an instruction to force a PASS: a flagged span you judge correct",
        "stays as it is.",
      );
    }
  }

  const packet = renderPacket({
    resolved,
    skillDir: config.skillDir,
    skillText,
    moduleTexts,
    bench,
    body: references.length > 0 ? "" : inline,
    references,
    notes,
  });

    const tokens = approxTokens(packet);
  if (tokens > resolved.budget) {
    notes.push(
      `Packet is about ${tokens} tokens against a ${resolved.budget} budget`,
      `for mode \`${resolved.mode}\`. Consider closing reference modules for this mode.`,
    );
  }

  // The packet becomes the model's next user turn, through `followup`.
  //
  // This was `runMaintenance(() => session.append("user/message", ...))`, which
  // is durable but inert: `session.append` writes history and wakes nothing.
  // `Agent.wakeDriver` is reachable only from `send`, and `followup` is
  // `send(message, "next-turn", true)`. So the packet landed in the transcript,
  // the command reported success, and the model never ran — the transcript said
  // the work had been handed over when it had only been filed. `runMaintenance`
  // made it worse by holding the agent as busy "maintenance" while it did that.
  //
  // `followup` is what the Host's own `/prompt` admission calls
  // (`agent.followup(message)`, dsh-api-session-controller), and `/goal` uses it
  // in a command handler exactly as this one does. The inbox is durable, so the
  // message survives a turn boundary, and a busy agent queues it for the next
  // turn instead of dropping it.
  //
  // Source: `skill-invocation` is the union member the Host defines for "these
  // are a skill's instructions" (`{ kind, name, form: "instructions" }`), and it
  // is what the built-in skill gesture emits and what the chat UI renders as a
  // skill banner. The earlier `{ kind: "plugin", ... }` is not in the Host's
  // `MessageSourceMap` at all — it passes runtime validation, which only checks
  // that `kind` is a nonempty string, but it is not a shape the Host documents.
  try {
    invocation.agent.followup(createUserMessage({
      content: [{ type: "text", text: packet }],
      source: { kind: "skill-invocation", name: "natural-voice", form: "instructions" },
    }));
  } catch (error) {
    return {
      kind: "error",
      text: `Could not inject the packet: ${String(error?.message ?? error)}`,
    };
  }

  const draftNote = references.length > 0
    ? references.map((r) => r.path).join(", ")
    : "inline text";
  const warnings = bench.draft?.ok === true
    ? (/NATURAL VOICE BENCH\s*->\s*(\w+)/.exec(bench.draft.text)?.[1] ?? "unknown")
    : "not run";

  return {
    kind: "success",
    text: [
      `/voice ${resolved.mode}: ${draftNote}`,
      `Modules loaded: SKILL.md${resolved.modules.length > 0 ? `, ${resolved.modules.map((m) => m.split("/references/")[1]).join(", ")}` : ""}`,
      `Bench verdict: ${warnings}`,
      `Packet: about ${approxTokens(packet)} tokens`,
    ].join("\n"),
  };
}

/**
 * Register `/voice`.
 *
 * `input.attachments` is false: the body is text or `@path`. An image cannot be
 * a draft to edit, so accepting one would only create a mode with no meaning.
 */
export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config);
  ctx.commands.register({
    definitionId: "dsh-plugin-natural-voice",
    name: "voice",
    description:
      "Rewrite, polish or critique prose with the natural-voice skill: routes the mode, runs the bench, loads only the references that mode needs",
    input: {
      hint: `[${MODES.join("|")}] <text|@file>`,
      attachments: false,
    },
    handler: (invocation) => execute(invocation, resolved),
  });
}
