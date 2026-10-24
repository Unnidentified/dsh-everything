import { parseVoiceInput, resolveMode, usage, MODES, MANIFEST, INVARIANTS } from "../lib/manifest.js";
import { splitReferences, stripFrontmatter, approxTokens } from "../lib/text.js";

let pass = 0, fail = 0;
function t(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
}

console.log("=== parseVoiceInput ===");
t("empty -> help", parseVoiceInput("").kind, "help");
t("--help -> help", parseVoiceInput("--help").kind, "help");
t("bare text -> default edit", parseVoiceInput("make this clearer").mode, "edit");
t("mode first", parseVoiceInput("critique this").mode, "critique");
t("mode + body", parseVoiceInput("critique this").body, "this");
t("uppercase mode", parseVoiceInput("POLISH it").mode, "polish");
t("typo -> unknown-mode", parseVoiceInput("polsih the intro").kind, "unknown-mode");
t("typo names the near mode", parseVoiceInput("polsih x").near, "polish");
// Documented tradeoff: a leading word that IS a mode name is read as the
// mode, case-insensitively. The command's own reply names the mode chosen, so
// a misread is visible in the next line of the transcript rather than silent.
t("leading mode word wins, as documented", parseVoiceInput("Polish the introduction").mode, "polish");
t("body after a leading mode word is kept", parseVoiceInput("Polish the introduction").body, "the introduction");
t("words that merely resemble modes are prose", parseVoiceInput("Make it clearer").mode, "edit");
t("mode with no body", parseVoiceInput("write").body, "");
t("all modes reachable", MODES.every(m => parseVoiceInput(`${m} x`).mode === m), true);

console.log("\n=== resolveMode ===");
const exists = (p) => p.endsWith("SKILL.md") || p.includes("references/");
const r = resolveMode("edit", "/skill", exists);
t("edit loads cutting.md only", r.modules.map(m => m.split("/").pop()), ["cutting.md"]);
t("edit nothing missing", r.missing, []);
t("missing modules surface", resolveMode("edit", "/skill", () => false).missing.length, 1);
// The reason edit does NOT load prose-craft.md: that module teaches five
// sentence-shape variations, which is the over-editing this mode exists to
// prevent. The cohesion rule it also carries must still be reachable, so it
// rides in INVARIANTS for every mode.
t("edit avoids the shape-variation module", MANIFEST.edit.modules.includes("references/prose-craft.md"), false);
t("cohesion rule survives in INVARIANTS", INVARIANTS.some(l => l.includes("COHESION, FLOOR NOT QUOTA")), true);
t("every mode receives the invariants", MODES.every(m => resolveMode(m, "/skill", exists) !== undefined), true);
t("no mode loads evidence.md by default", MODES.every(m => !MANIFEST[m].modules.includes("references/evidence.md")), true);
t("every mode loads at most 3 modules", MODES.every(m => MANIFEST[m].modules.length <= 3), true);
t("unknown mode throws", (() => { try { resolveMode("nope", "/s", exists); return "no throw"; } catch { return "throw"; } })(), "throw");
t("every mode resolves", MODES.every(m => resolveMode(m, "/skill", exists).missing.length === 0), true);
t("every mode has a budget", MODES.every(m => typeof MANIFEST[m].budget === "number"), true);
t("write mode loads voice-es", MANIFEST.write.modules.some(m => m.includes("voice-es")), true);
t("critique mode is modules-only-no-prose-craft", MANIFEST.critique.modules.includes("references/prose-craft.md"), false);

console.log("\n=== splitReferences ===");
t("plain text", splitReferences("just prose").paths, []);
t("@file at start", splitReferences("@draft.md").paths, ["draft.md"]);
t("@file then inline", splitReferences("@draft.md make it shorter").paths, ["draft.md"]);
t("inline kept", splitReferences("@draft.md make it shorter").inline, "make it shorter");
t("two refs", splitReferences("@a.md @b.md").paths, ["a.md", "b.md"]);
t("email stays prose", splitReferences("write to me@example.com").paths, []);
t("absolute path ref", splitReferences("@/tmp/d.md").paths, ["/tmp/d.md"]);
t("nested path ref", splitReferences("@notes/sub/draft.md").paths, ["notes/sub/draft.md"]);
t("ref then prose with period", splitReferences("@d.md. Also fix the title.").paths, ["d.md"]);

console.log("\n=== stripFrontmatter ===");
t("strips", stripFrontmatter("---\nname: x\n---\nBody here"), "Body here");
t("no frontmatter passes", stripFrontmatter("Just body"), "Just body");
t("crlf frontmatter", stripFrontmatter("---\r\nname: x\r\n---\r\nBody"), "Body");
t("body with --- inside is kept", stripFrontmatter("Body\n---\nmore").startsWith("Body"), true);

console.log("\n=== usage ===");
t("lists every mode", MODES.every(m => usage().includes(m)), true);
t("names the default", usage().includes("default: edit"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
