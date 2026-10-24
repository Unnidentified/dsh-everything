// The packet the model actually receives, rendered by the real renderer.
//
// This file exists because the other three suites only measured packet SIZES. None of
// them called `renderPacket`, so a packet that shipped the literal string
// "Base directory for this skill: undefined" passed every check for as long as it
// existed. Assert on rendered content, not on arithmetic about it.
//
// `lib/command.js` needs no module hooks: it imports only `node:` builtins and its
// own siblings. It used to import `@deepseek-ai/dsh-llm`, which this suite had to
// stub through `registerHooks` — that import was the reason /voice never registered
// from a `link:` install, so its removal is asserted below rather than accommodated.
import { writeFile, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveMode } from "../lib/manifest.js";
import { stripFrontmatter } from "../lib/text.js";

const SKILL = "/Users/gefaass/Desktop/Documents/agent stuff/other/skill-creator/natural-voice";
let fail = 0;
const check = (label, ok, extra = "") => {
  if (ok) console.log(`  ok   ${label}`);
  else { fail++; console.log(`  FAIL ${label} ${extra}`); }
};

const { renderPacket } = await import("../lib/command.js");

console.log("=== renderPacket names a real base directory ===");
const resolved = resolveMode("edit", SKILL, existsSync);
const skillText = stripFrontmatter(await (await import("node:fs/promises"))
  .readFile(join(SKILL, "SKILL.md"), "utf8"));

const packet = renderPacket({
  resolved,
  skillDir: SKILL,
  skillText,
  moduleTexts: [],
  bench: { enabled: true, draft: undefined },
  body: "",
  references: [],
  notes: [],
});

check("base directory is the real path",
  packet.includes(`Base directory for this skill: ${SKILL}`),
  packet.split("\n").slice(0, 4).join(" | "));
check("the string 'undefined' appears nowhere in the packet",
  !/\bundefined\b/.test(packet),
  (packet.match(/.{0,40}undefined.{0,40}/) || [""])[0]);
check("skill instructions are wrapped, not raw",
  packet.includes("<skill_instructions>") && packet.includes("</skill_instructions>"));
check("the wrapper is closed",
  packet.includes("</skill_content>"));

console.log("\n=== a missing skillDir fails loudly instead of rendering 'undefined' ===");
{
  let threw = false;
  let msg = "";
  try {
    renderPacket({ resolved, skillText, moduleTexts: [],
      bench: { enabled: true, draft: undefined },
      body: "", references: [], notes: [] });
  } catch (e) { threw = true; msg = String(e?.message ?? e); }
  check("throws when no directory is named", threw, msg);
  check("the error says which argument is missing", msg.includes("skillDir"), msg);
}

console.log("\n=== the fallback path still works for callers passing it inside `resolved` ===");
{
  let out = null;
  try {
    out = renderPacket({ resolved: { ...resolved, skillDir: SKILL }, skillText,
      moduleTexts: [], bench: { enabled: true, draft: undefined },
      body: "", references: [], notes: [] });
  } catch (e) { /* reported below */ }
  check("accepts resolved.skillDir as a fallback",
    typeof out === "string" && out.includes(`Base directory for this skill: ${SKILL}`));
}

console.log("\n=== the inject list must not name a service the plugin never reads ===");
{
  const { readFile } = await import("node:fs/promises");
  const cmd = await readFile(new URL("../lib/command.js", import.meta.url), "utf8");
  const m = cmd.match(/export const inject = (\[[^\]]*\])/);
  const list = JSON.parse(m[1]);
  check("inject is declared", Array.isArray(list));
  check("`commands` is injected -- registration needs it", list.includes("commands"), JSON.stringify(list));
  // A hard top-level inject gates apply() itself: while any named service is
  // unbound the row sits pending, apply() never runs, and the command never
  // registers. `["commands","agents"]` did exactly that and /voice never appeared.
  check("`agents` is NOT injected",
    !list.includes("agents"),
    "injecting agents made the row pend on a service it never reads; "
    + "use ctx.inject?.(...) in apply() if a service is ever needed optionally");
  check("ctx.agents is not read anywhere in lib/",
    !/ctx\.agents/.test(cmd.replace(/\/\*[\s\S]*?\*\//g, "")),
    "if this fails, the plugin DOES need agents and the inject list must be reconsidered");
}

console.log("\n=== the plugin must import nothing the profile cannot supply ===");
{
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = new URL("../lib/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".js"));
  const offenders = [];
  for (const file of files) {
    const src = await readFile(new URL(file, dir), "utf8");
    // Strip comments so a docstring that *names* a package is not a failure.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(/(?:^|\n)\s*import[^;]*?from\s+"([^"]+)"/g)) {
      const spec = m[1];
      if (!spec.startsWith("node:") && !spec.startsWith("./") && !spec.startsWith("../")) {
        offenders.push(`${file} imports ${spec}`);
      }
    }
  }
  // This is the bug that took /voice off the menu. A `link:`-installed plugin
  // resolves bare specifiers from its realpath — outside the profile — so the
  // Host's runtime resolution never supplies `@deepseek-ai/*` there, and the
  // whole row fails to import:
  //   Cannot find package '@deepseek-ai/dsh-llm' imported from lib/command.js
  check("no bare package specifiers in lib/ (imports are node: builtins or siblings)",
    offenders.length === 0,
    offenders.join("; ") + " -- a bare import fails the row from a link: install");
}

console.log("\n=== the packet is delivered as a turn, not merely appended ===");
{
  const { readFile } = await import("node:fs/promises");
  const cmd = await readFile(new URL("../lib/command.js", import.meta.url), "utf8");
  const code = cmd.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // `session.append` writes history and wakes nothing; `followup` is
  // `send(message, "next-turn", true)` and is what the Host's own /prompt uses.
  check("delivery goes through agent.followup (which wakes the driver)",
    /invocation\.agent\.followup\(/.test(code),
    "session.append alone leaves the model idle: the packet is filed, not run");
  check("the inert runMaintenance/append path is gone",
    !/runMaintenance/.test(code) && !/session\.append/.test(code),
    "runMaintenance holds the agent busy while appending, which suppresses the turn");
  check("source kind is one the Host declares",
    /kind:\s*"skill-invocation"/.test(code),
    "`plugin` is not a member of the Host's MessageSourceMap");
}

console.log(fail ? `\n${fail} FAILED` : "\nall render checks pass");
process.exit(fail ? 1 : 0);
