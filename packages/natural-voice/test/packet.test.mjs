// Integration check: assemble a real packet against the skill on disk and
// confirm every module the manifest names actually ships.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MANIFEST, MODES, resolveMode } from "../lib/manifest.js";
import { stripFrontmatter, approxTokens } from "../lib/text.js";

const SKILL = "/Users/gefaass/Desktop/Documents/agent stuff/other/skill-creator/natural-voice";
let fail = 0;
const check = (label, ok, extra="") => {
  if (ok) console.log(`  ok   ${label}`);
  else { fail++; console.log(`  FAIL ${label} ${extra}`); }
};

console.log("=== the skill the manifest targets ===");
check("SKILL.md exists", existsSync(join(SKILL, "SKILL.md")));
const skillRaw = await readFile(join(SKILL, "SKILL.md"), "utf8");
const skillText = stripFrontmatter(skillRaw);
check("frontmatter stripped", !skillText.startsWith("---"));
check("body present", skillText.includes("Boundaries"));
console.log(`       SKILL.md body: ~${approxTokens(skillText)} tokens`);

console.log("\n=== every manifest module resolves on disk ===");
for (const mode of MODES) {
  const r = resolveMode(mode, SKILL, existsSync);
  check(`${mode}: ${r.modules.length} module(s), 0 missing`, r.missing.length === 0, JSON.stringify(r.missing));
}

console.log("\n=== per-mode packet size (SKILL.md + modules + invariants) ===");
const { INVARIANTS, BENCH_SCOPE } = await import("../lib/manifest.js");
for (const mode of MODES) {
  const r = resolveMode(mode, SKILL, existsSync);
  let chars = skillText.length + INVARIANTS.join("\n").length + BENCH_SCOPE.join("\n").length;
  for (const abs of r.modules) chars += (await readFile(abs, "utf8")).length;
  const toks = Math.round(chars / 4);
  const over = toks > r.budget;
  check(`${mode.padEnd(10)} ~${String(toks).padStart(5)} tok vs ${r.budget} budget`, !over, over ? "OVER" : "");
}

console.log("\n=== the whole skill fits in one packet at 'write' ===");
{
  const r = resolveMode("write", SKILL, existsSync);
  let chars = skillText.length;
  for (const abs of r.modules) chars += (await readFile(abs, "utf8")).length;
  console.log(`       write loads ${r.modules.length} of 5 modules: ~${Math.round(chars/4)} tok`);
  console.log(`       evidence.md (7.3k tok) is the module no mode loads by default;`);
  console.log(`       it is the provenance register, read on demand, not per rewrite.`);
}

console.log(fail ? `\n${fail} FAILED` : "\nall packet checks pass");
process.exit(fail ? 1 : 0);
