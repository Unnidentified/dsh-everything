/**
 * Mode manifest for the natural-voice slash command.
 *
 * The skill ships one entry file (`SKILL.md`) and five reference modules. On a
 * plain `/natural-voice` gesture the model receives `SKILL.md` only and is told
 * to "load on trigger", which means it guesses which module a request needs and
 * usually loads none. This manifest replaces the guess: each mode names the
 * modules it needs, a token budget, and the output contract it must honour.
 *
 * The table is the single source of truth. `command.js` reads it, `skillDir`
 * paths in it are relative to the skill directory, and `selfcheck`-style checks
 * live in `verify.js` so a module rename in the skill fails loudly here instead
 * of silently degrading the packet.
 *
 * @module dsh-plugin-natural-voice/manifest
 */

/** Modes, in the skill's own vocabulary. `edit` is the documented default. */
export const MODES = Object.freeze([
  "edit",
  "polish",
  "write",
  "critique",
  "harmonize",
]);

export const DEFAULT_MODE = "edit";

/**
 * Per-mode packet specification.
 *
 * - `modules` are reference paths under the skill directory, in load order.
 *   `null` means "no module"; an empty array means SKILL.md alone is enough.
 * - `budget` is an advisory token ceiling for the injected packet, so a mode
 *   cannot quietly pull all 26k tokens of reference material.
 * - `contract` is injected verbatim. It is deliberately short: the model reads
 *   it every time, and SKILL.md already carries the long-form reasoning.
 * - `surface` states what the deliverable is, so a mode cannot return the wrong
 *   artefact type (the failure the skill's own §Modes was written for).
 */
export const MANIFEST = Object.freeze({
  edit: {
    label: "Edit prose the user wrote",
    // cutting.md only. prose-craft.md teaches sentence-shape variation, and
    // handing it to `edit` is exactly what produces the over-editing this mode
    // exists to prevent: the module gives the model five alternative shapes and
    // edit mode's own contract says keep the author's. The cohesion rule that
    // would otherwise come from prose-craft.md section 4.2 rides in INVARIANTS
    // instead, so dropping the module does not drop the rule.
    modules: ["references/cutting.md"],
    budget: 9000,
    surface: "the edited text, then a change note of at most five lines",
    contract: [
      "Minimal diff. Keep the author's phrasing wherever it is already doing work.",
      "You may only make the sentence shorter, split it, or reorder it. Do not re-lex it.",
      "Every sentence you touch must still open on the same subject as before.",
      "No register change: no contractions added or removed, no US/UK spelling flips,",
      "no formal-to-informal or informal-to-formal moves. Match the input's own level.",
      "If a paragraph has nothing wrong with it, change nothing in it and say so",
      "in the change note. An empty diff is a valid result.",
    ],
  },

  polish: {
    label: "Improve prose without cutting substance",
    modules: ["references/prose-craft.md"],
    budget: 12000,
    surface: "the polished text only",
    contract: [
      "Same claims, better sentence construction. No new claims, no dropped claims.",
      "Length is not a target. Do not shorten a sentence that has nothing wrong with it.",
      "Preserve paragraph count and paragraph order.",
    ],
  },

  write: {
    label: "Write new prose in the user's voice",
    modules: [
      "references/voice-es.md",
      "references/cross-lingual.md",
      "references/prose-craft.md",
    ],
    budget: 20000,
    surface: "the new text, then one line of stated assumptions",
    contract: [
      "State assumptions in one line outside the text, never inside it.",
      "Follow the measured habits in voice-es.md, including its stated negatives:",
      "a habit the file records as absent must stay absent.",
      "Do not invent a number, date, name or measurement. If the piece needs one",
      "and you do not have it, leave a marked gap and list the gaps at the end.",
    ],
  },

  critique: {
    label: "Report findings without rewriting",
    modules: ["references/cutting.md"],
    budget: 9000,
    surface: "flagged spans with a reason each, and the fix in words",
    contract: [
      "Do not rewrite. Return findings only, even when the fix is obvious.",
      "Each finding: the span, the reason, and what to do about it.",
      "Order findings by value, not by position in the text.",
      "Say when the right answer is to leave the span alone.",
    ],
  },

  harmonize: {
    label: "Unify several authors into one voice",
    modules: ["references/cross-lingual.md", "references/prose-craft.md"],
    budget: 16000,
    surface: "the unified text, then a conflict list for a human to resolve",
    contract: [
      "Unify person (nosotros or impersonal), tense, terminology and heading style.",
      "Pick one term per concept; do not rotate synonyms for the same thing.",
      "Where authors contradict each other on substance, do not choose. List the",
      "conflict and leave both readings marked.",
    ],
  },
});

/**
 * Invariants injected into every packet, in every mode.
 *
 * These are the rules the audit found the packet could not otherwise enforce.
 * Each one names the failure it prevents; a bare imperative was not enough.
 */
export const INVARIANTS = Object.freeze([
  "FACT FIDELITY. Every number, unit, identifier, flag, acronym and product name",
  "survives exactly. Beyond that: the mechanical --source check compares digits,",
  "identifiers and acronyms only, so it does NOT notice a dropped clause that",
  "contains none of those. Before you return, walk the source sentence by sentence",
  "and account for each one: kept, merged, or deliberately cut with a reason.",
  "If you cannot account for a source sentence, you have not finished.",

  "NO INVENTED SPECIFICS. A specific may come only from the source text or from a",
  "tool result. If the source is vague and the sentence needs a number, cut the",
  "sentence or leave a marked gap such as [dato: tiempo de arranque?] and list the",
  "gaps at the end. A plausible fabricated value is worse than a vague sentence.",

  "STRUCTURE AND FORMAT. Keep headings, tables, lists, code fences and front",
  "matter at their original level and position. A table stays a table. Keep the",
  "paragraph count and paragraph order; do not merge or split paragraphs.",

  "COHESION, FLOOR NOT QUOTA. Human technical prose opens a non-first sentence",
  "with a connective 10.8-11.6% of the time; machine drafts 5.3-7.7%. Every rule",
  "in the skill is subtractive, so the risk is leaving causal and contrastive",
  "relations implicit. After cutting, read each paragraph and ask whether the",
  "link is still named. Do not add one connective per sentence: a run of them",
  "marching in sequence is the opposite failure and is checked separately.",

  "CONNECTIVE FLOOR AND THE SUMMARY TENSION. `En resumen`, `in summary`,",
  "`en conclusion` and `in conclusion` count toward the cohesion figure AND fire",
  "the tie-back-summary warning. They are not free cohesion tokens. If the last",
  "paragraph only restates the body, cut it. If it adds a consequence, keep it",
  "and accept the warning is advisory.",

  "NO RE-REGISTRATION. Never change spelling system, contraction policy, or",
  "formality level while rewriting. A draft that mixes `behavior` and `optimise`",
  "keeps that mix; an eyewitness register keeps its contractions. Fixing the",
  "author's orthography is not in scope and reads as a second voice in the text.",
]);

/**
 * Where the skill's own bench can and cannot help. Injected so the model does
 * not read a PASS as coverage it does not have.
 */
export const BENCH_SCOPE = Object.freeze([
  "The bench flags patterns in a draft. It is a reading aid, not a gate.",
  "It scores CV as advisory and never as a pass/fail.",
  "It checks numbers, identifiers and acronyms for retention. Prose-level",
  "dropped clauses and fabricated prose are invisible to it; the sentence",
  "walk in FACT FIDELITY is what covers those.",
  "Below 8 non-first sentences it declines to report cohesion, because at that",
  "size a 0% rate is the likely outcome by chance.",
]);

/**
 * Resolve the module list for a mode, and report anything the manifest names
 * that the skill no longer ships. A missing module is a hard error: the packet
 * would otherwise silently lose the material the mode was chosen for.
 *
 * @param mode - one of `MODES`.
 * @param skillDir - absolute skill directory.
 * @param exists - predicate `(absolutePath) => boolean`.
 * @returns `{ mode, label, modules, budget, contract, surface, missing }` where
 *   `modules` is absolute paths and `missing` is the manifest entries absent on
 *   disk.
 */
export function resolveMode(mode, skillDir, exists) {
  const spec = MANIFEST[mode];
  if (spec === undefined) {
    throw new Error(
      `unknown mode "${String(mode)}"; expected one of ${MODES.join(", ")}`,
    );
  }
  const modules = [];
  const missing = [];
  for (const rel of spec.modules) {
    const abs = `${skillDir}/${rel}`;
    if (exists(abs)) modules.push(abs);
    else missing.push(rel);
  }
  return {
    mode,
    label: spec.label,
    modules,
    budget: spec.budget,
    contract: spec.contract,
    surface: spec.surface,
    missing,
  };
}

/**
 * Parse `/voice` input into a mode and a body.
 *
 * Grammar, kept deliberately small so a slash call stays one line:
 *   /voice <body>                     -> default mode
 *   /voice <mode> <body>              -> named mode
 *   /voice <mode>                     -> mode, empty body
 *   /voice --help                     -> usage
 * A word counts as a mode only in first position and only if it is a known
 * mode name, so `/voice Polish the intro` is not read as mode `polish`.
 *
 * @param rawInput - the command's text after `/voice`, verbatim.
 * @returns `{ kind, mode?, body?, unknownMode? }`.
 */
export function parseVoiceInput(rawInput) {
  const text = rawInput.trim();
  if (text.length === 0) return { kind: "help" };
  if (text === "--help" || text === "-h" || text === "help") {
    return { kind: "help" };
  }

  const [first, ...rest] = text.split(/\s+/);
  const candidate = first.toLowerCase();

  // A leading word in mode position is a mode claim. If it is a near-miss of a
  // real mode name, say so rather than treating it as prose: silently editing
  // the word "Polsih" as body text is how a typo becomes a silent default.
  const near = MODES.find((m) => levenshtein(m, candidate) <= 2);
  if (MODES.includes(candidate)) {
    return { kind: "run", mode: candidate, body: rest.join(" ").trim() };
  }
  if (near !== undefined && looksLikeModeAttempt(first)) {
    return { kind: "unknown-mode", unknownMode: first, near };
  }
  return { kind: "run", mode: DEFAULT_MODE, body: text };
}

/**
 * Heuristic for "this leading token was meant as a mode, not as prose". Two
 * signals: it is a single word with no sentence punctuation, and the body
 * behind it is non-empty. A one-word body that merely resembles a mode is far
 * more likely a typo than an instruction.
 */
function looksLikeModeAttempt(token) {
  return /^[A-Za-z-]+$/.test(token);
}

/**
 * Bounded edit distance, used only to name a likely typo. Not a general
 * implementation: it stops early past `max`.
 */
function levenshtein(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Usage text for `/voice --help` and for a mode typo. */
export function usage() {
  return [
    "Usage: /voice [<mode>] <text|@file>",
    "",
    `Modes: ${MODES.join(", ")}  (default: ${DEFAULT_MODE})`,
    "",
    "  edit       minimal diff on prose you wrote; keeps your phrasing",
    "  polish     better sentences, same substance",
    "  write      new text in your measured voice",
    "  critique   findings only, no rewrite",
    "  harmonize  several authors into one voice, conflicts listed",
    "",
    "Body forms:",
    "  /voice edit <pasted text>",
    "  /voice edit @notes/draft.md",
    "  /voice edit @draft.md @source.md    (second file is the fact source)",
    "",
    "The command runs the skill's bench on the draft and injects SKILL.md plus",
    "only the reference modules the mode needs, so the turn starts with findings",
    "in hand instead of a list of files to consider loading.",
  ].join("\n");
}

/** Modes that must not return a rewritten text. */
export const READ_ONLY_MODES = Object.freeze(["critique"]);
