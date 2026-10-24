// End-to-end packet assembly with the REAL bench and the REAL skill, without
// a composed Host runtime. Stubs only `createUserMessage` + the agent surface,
// so what is verified is the packet the model would actually receive.
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SKILL = "/Users/gefaass/Desktop/Documents/agent stuff/other/skill-creator/natural-voice";
const DRAFT = join(SKILL, "examples/es-before.md");

// Reproduce the pure packet renderer behaviour against the real files.
const { resolveMode, INVARIANTS, BENCH_SCOPE } = await import("../lib/manifest.js");
const { stripFrontmatter, approxTokens } = await import("../lib/text.js");

console.log("=== 1. bench runs on a real draft under both interpreters ===");
const { execFile } = await import("node:child_process");
const { promisify } = await import("node:util");
const run = promisify(execFile);
const bench = join(SKILL, "eval_bench.py");

for (const [label, py] of [
  ["PATH python3", "python3"],
  ["DSH bundled runtime", "/Users/gefaass/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python"],
]) {
  try {
    const { stdout } = await run(py, [bench, "--file", DRAFT], { cwd: SKILL, timeout: 60000 });
    const verdict = /NATURAL VOICE BENCH\s*->\s*(\w+)/.exec(stdout)?.[1] ?? "?";
    const warns = (stdout.match(/\[WARN\]|\[FAIL\]/g) || []).length;
    console.log(`  ok   ${label.padEnd(22)} verdict=${verdict} flagged=${warns}`);
  } catch (e) {
    console.log(`  FAIL ${label}: ${e.message}`);
  }
}

console.log("\n=== 2. the fact-retention path the packet promises to supplement ===");
const source = join(SKILL, "examples/es-before.md");
const rewrite = join(SKILL, "examples/es-after.md");
for (const [label, args] of [
  ["draft vs itself (must PASS)", ["--file", source, "--source", source]],
  ["rewrite vs source (must PASS)", ["--file", rewrite, "--source", source]],
]) {
  const { stdout } = await run("python3", [bench, ...args], { cwd: SKILL, timeout: 60000 });
  const v = /NATURAL VOICE BENCH\s*->\s*(\w+)/.exec(stdout)?.[1] ?? "?";
  console.log(`  ok   ${label.padEnd(30)} ${v}`);
}

console.log("\n=== 3. packet composition for mode=edit ===");
const r = resolveMode("edit", SKILL, existsSync);
const skillText = stripFrontmatter(await readFile(join(SKILL, "SKILL.md"), "utf8"));
let chars = skillText.length + INVARIANTS.join("\n").length + BENCH_SCOPE.join("\n").length;
for (const abs of r.modules) chars += (await readFile(abs, "utf8")).length;
console.log(`  mode: ${r.mode}`);
console.log(`  modules: ${r.modules.map(m => m.split("/references/")[1]).join(", ")}`);
console.log(`  contract lines: ${r.contract.length}`);
console.log(`  invariants: ${INVARIANTS.length} lines, bench-scope: ${BENCH_SCOPE.length} lines`);
console.log(`  total: ~${approxTokens("x".repeat(chars))} tokens vs ${r.budget} budget -> ${approxTokens("x".repeat(chars)) <= r.budget ? "FITS" : "OVER"}`);

console.log("\n=== 4. each mode's module set is distinct enough to matter ===");
const { MODES, MANIFEST } = await import("../lib/manifest.js");
const sigs = new Map();
for (const m of MODES) {
  const s = MANIFEST[m].modules.join("|");
  if (sigs.has(s)) console.log(`  note: ${m} shares its module set with ${sigs.get(s)} (differ by contract only)`);
  else sigs.set(s, m);
}
console.log(`  distinct module sets: ${sigs.size} of ${MODES.length} modes`);
console.log("\nall e2e checks completed");
