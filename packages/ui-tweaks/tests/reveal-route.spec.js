/**
 * Coverage for the reveal route: the only path from a chat message to the operating
 * system.
 *
 * Three contracts matter. Safety: the wire can never choose the action, so a crafted
 * request can highlight a path in Finder but never open or execute anything. Honest
 * reporting: "path not found" must mean the path does not exist, not that a capability
 * was missing. Function: the verified host call needs an abort signal and rejects any
 * path the session filesystem cannot round-trip, so a fallback reveal must exist —
 * this route shipped once without either, and reported "Path not found" for every path.
 */
import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { callHandler, cleanup, mount, resetStores } from "./helpers.js";

afterAll(cleanup);
beforeEach(resetStores);

/** A path that exists in every environment: this spec file. */
const existing = fileURLToPath(import.meta.url);

const post = (routes, body) => callHandler(routes.get("/edit-resend-reveal"), "POST", body);

/** A controller double that records calls, optionally failing. */
const controllerDouble = (failure) => {
  const calls = [];
  return {
    calls,
    async openWorkspacePath(request, signal) {
      calls.push({ request, signal });
      if (failure !== undefined) throw failure;
      return { opened: true };
    },
  };
};

describe("/edit-resend-reveal", () => {
  it("rejects a non-POST method and a body that is not JSON", async () => {
    const { routes } = mount();
    const get = await callHandler(routes.get("/edit-resend-reveal"), "GET", undefined);
    expect(get.status).toBe(405);
    const bad = await callHandler(routes.get("/edit-resend-reveal"), "POST", "not json");
    expect(bad.status).toBe(400);
  });

  it("rejects a missing, empty, oversized or non-string path", async () => {
    const { routes } = mount(undefined, { sessionController: controllerDouble() });
    for (const path of [undefined, "", "x".repeat(4097), 42]) {
      const out = await post(routes, { path });
      expect(out.status).toBe(400);
    }
  });

  it("reveals the deepest existing ancestor of a path that does not exist", async () => {
    // An illustrative or incomplete mention is normal in prose; clicking it must land
    // the user somewhere real rather than failing. `/tmp/<missing>/deep/x.js` walks up
    // to `/tmp`, which exists.
    const controller = controllerDouble();
    const { routes } = mount(undefined, { sessionController: controller });
    const missing = join(tmpdir(), "dsh-definitely-missing-dir", "deep", "x.js");
    const out = await post(routes, { path: missing });
    expect(out.status).toBe(200);
    expect(out.body.exact).toBe(false);
    expect(out.body.revealed).toBe(tmpdir());
    expect(controller.calls[0].request.path).toBe(tmpdir());
    expect(controller.calls[0].request.path).not.toBe(missing);
  });

  it("reveals an existing path exactly, and says so", async () => {
    const controller = controllerDouble();
    const { routes } = mount(undefined, { sessionController: controller });
    const out = await post(routes, { path: existing });
    expect(out.status).toBe(200);
    expect(out.body.exact).toBe(true);
    expect(out.body.revealed).toBe(existing);
    expect(controller.calls[0].request.path).toBe(existing);
  });

  it("answers 404 only when the walk finds nothing but the volume root", async () => {
    const controller = controllerDouble();
    const { routes } = mount(undefined, { sessionController: controller });
    // Nothing under this path exists except `/` itself, which helps nobody.
    const out = await post(routes, { path: "/dsh-nothing-here/deep/x.js" });
    expect(out.status).toBe(404);
    expect(out.body.error).toBe("path does not exist");
    expect(controller.calls).toHaveLength(0);
  });

  it("refuses a non-absolute path, so a leading dash cannot reach `open` as an option", async () => {
    const controller = controllerDouble();
    const { routes } = mount(undefined, { sessionController: controller });
    for (const path of ["-R", "relative/x.js", "../escape"]) {
      const out = await post(routes, { path });
      expect(out.status).toBe(400);
      expect(out.body.error).toContain("absolute");
    }
    expect(controller.calls).toHaveLength(0);
  });

  it("passes a usable abort signal, which the host aborts through", async () => {
    // Regression: `openWorkspacePath(request)` without the signal throws
    // "Cannot read properties of undefined (reading 'aborted')" for every path.
    const controller = controllerDouble();
    const { routes } = mount(undefined, { sessionController: controller });
    const out = await post(routes, { path: existing });
    expect(out.status).toBe(200);
    expect(out.body.via).toBe("verified");
    expect(controller.calls).toHaveLength(1);
    const { signal } = controller.calls[0];
    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);
    expect(typeof signal.throwIfAborted).toBe("function");
  });

  it("hard-wires the reveal action and forwards the path unchanged", async () => {
    const controller = controllerDouble();
    const { routes } = mount(undefined, { sessionController: controller });
    await post(routes, { path: existing });
    expect(controller.calls[0].request).toEqual({ path: existing, action: "reveal" });
  });

  it("expands a home-relative path on the host instead of leaving `~` literal", async () => {
    // Regression: a `~/.dsh/...` mention used to be joined onto the session cwd,
    // producing `<cwd>/~/.dsh/...`, which no path verifier can accept.
    const controller = controllerDouble();
    const { routes } = mount(undefined, { sessionController: controller });
    // The test sandbox creates `<temp home>/.dsh/sessions`, so this resolves and exists.
    const out = await post(routes, { path: "~/.dsh/sessions" });
    expect(out.status).toBe(200);
    expect(controller.calls[0].request.path).toBe(join(homedir(), ".dsh/sessions"));
    expect(controller.calls[0].request.path).not.toContain("~");
  });

  it("never takes the action from the wire", async () => {
    const controller = controllerDouble();
    const { routes } = mount(undefined, { sessionController: controller });
    await post(routes, { path: existing, action: "open", application: "Terminal" });
    expect(controller.calls[0].request.action).toBe("reveal");
    expect(controller.calls[0].request.application).toBeUndefined();
  });

  it("documents the contract in source: no body-supplied action or application", async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const source = await readFile(join(root, "index.js"), "utf8");
    const start = source.indexOf('path: "/edit-resend-reveal"');
    const body = source.slice(start, source.indexOf("edit-resend: reveal route", start));
    expect(body).toContain('action: "reveal"');
    expect(body).not.toMatch(/body\??\.(action|application)/);
  });

  it("documents the fallback in source: argv `open -R`, macOS-only, never a shell", async () => {
    // The fallback runs a real OS command, so it cannot be exercised in the suite
    // without popping Finder windows; its safety-relevant shape is pinned instead.
    // `open -R` only reveals the target — never `open <path>`, which would launch it.
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const source = await readFile(join(root, "index.js"), "utf8");
    const start = source.indexOf('path: "/edit-resend-reveal"');
    const body = source.slice(start, source.indexOf("edit-resend: reveal route", start));
    expect(body).toContain('execFileAsync("open", ["-R", revealTarget]');
    expect(body).toContain('process.platform !== "darwin"');
    expect(body).not.toMatch(/shell\s*:\s*true/);
    expect(body).not.toMatch(/["'`]open["'`]\s*,\s*\[(?!\s*"-R")/);
  });
});
