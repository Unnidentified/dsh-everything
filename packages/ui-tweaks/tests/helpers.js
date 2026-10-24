/**
 * Shared test doubles and fixtures (standards rule 20: harness lives here, never in a spec).
 *
 * Sandbox first: `$HOME` is redirected before the plugin module loads so the kimi
 * credential lookup and the sessions root both resolve inside the fixture tree —
 * running the suite can never touch real user data (rule 27).
 */
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ZSTD = "/opt/homebrew/bin/zstd";

export const home = await mkdtemp(join(tmpdir(), "ui-tweaks-test-"));
// Production spawns bare "zstd"; make sure it resolves regardless of the runner's PATH.
if (!process.env.PATH?.includes("/opt/homebrew/bin")) {
  process.env.PATH = `/opt/homebrew/bin:${process.env.PATH ?? ""}`;
}
process.env.HOME = home;
process.env.DSH_UI_TWEAKS_DATA_DIR = join(home, "data");
await mkdir(join(home, ".dsh", "sessions"), { recursive: true });
await mkdir(join(home, "data"), { recursive: true });

const { apply } = await import("../index.js");

let counter = 0;
/** A unique session id per call so caches and in-flight latches never cross tests. */
export const sid = () => `session-test-${++counter}-${Date.now()}`;

/**
 * Mount the plugin and capture route handlers.
 * @param llm - Optional llm service double (defaults to a stream that yields nothing).
 * @param services - Extra host services to expose through `ctx.get` (a route that
 *   reaches for an optional service is otherwise only testable on its failure path).
 * @returns {{routes: Map<string, Function>, llm: object, service: Function}} Handlers by
 *   path, the llm double, and the `ctx.get` lookup the plugin was mounted with.
 */
export function mount(llm, services = {}) {
  const routes = new Map();
  const service = llm ?? { stream: () => (async function* () {})() };
  const lookup = (name) => {
    if (name === "llm") return service;
    if (name === "webServer") return { register: () => () => {} };
    return services[name];
  };
  apply({
    effect(fn) {
      fn();
      return () => {};
    },
    get: lookup,
    webServer: {
      register(route) {
        routes.set(route.path, route.handler);
        return () => routes.delete(route.path);
      },
    },
    llm: service,
  });
  return { routes, llm: service, service: lookup };
}

/**
 * Invoke a captured route handler with request/response doubles.
 * @param handler - The registered handler.
 * @param method - HTTP method.
 * @param body - Request body, stringified unless already a string.
 * @returns {Promise<{status: number, body: object}>} Parsed response.
 */
export async function callHandler(handler, method, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const req = {
    method,
    async *[Symbol.asyncIterator]() {
      yield text;
    },
  };
  const out = { status: 0, body: null };
  const res = {
    writeHead(status) {
      out.status = status;
    },
    end(payload) {
      out.body = payload ? JSON.parse(payload) : null;
    },
  };
  await handler(req, res);
  return out;
}

/**
 * An llm double that records calls and answers from a script (rule 24: llm is the
 * one mocked boundary). The script may return an Error to fail that tier.
 * @param script - `(opts, callIndex) => string | Error`.
 * @returns {{calls: object[], stream: Function}} Recording double.
 */
export function llmStub(script) {
  const calls = [];
  return {
    calls,
    stream(opts) {
      calls.push(opts);
      return (async function* () {
        const out = script(opts, calls.length - 1);
        if (out instanceof Error) throw out;
        yield { type: "text-delta", text: out };
        yield { type: "finish", reason: { kind: "ok" } };
      })();
    },
  };
}

/**
 * Write a real zstd-compressed session log the production readers can parse.
 * @param id - Session id; the log lands in its own workspace directory.
 * @param events - Events to serialize as JSONL.
 * @returns {Promise<void>}
 */
export async function writeSessionLog(id, events) {
  const dir = join(home, ".dsh", "sessions", "ws-test", id);
  await mkdir(dir, { recursive: true });
  const plain = join(dir, "session.jsonl");
  await writeFile(plain, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  await execFileAsync(ZSTD, ["-q", "-f", plain, "-o", join(dir, "session.v3.jsonl.zstd")]);
  await rm(plain);
}

// --- event fixtures ------------------------------------------------------

export const titleEvent = (title, kind = "provider", time = Date.now()) => ({
  type: "session/title",
  time,
  data: { title, source: { kind } },
});

export const userMessage = (text) => ({
  type: "user/message",
  data: { source: { kind: "user" }, content: [{ type: "text", text }] },
});

export const requestHeader = (provider, model) => ({
  type: "request/header",
  data: { header: { config: { provider, model } } },
});

export const turnEnd = () => ({ type: "turn/end" });

export const inboxSplice = (items, target = "next-turn") => ({
  type: "agent/inbox/spliced",
  data: { target, inserted: items.map((it) => ({ id: it.id, content: [{ type: "text", text: it.text }] })) },
});

export const compaction = (summary, time = Date.now()) => [
  { type: "compaction/start", seq: 1, data: { compactionId: "c1" } },
  { type: "compaction/summary", data: { compactionId: "c1", summary: [{ type: "text", text: summary }] } },
  { type: "compaction/end", time, data: { compactionId: "c1" } },
];

/**
 * Read a store file back from disk ("verify the world", rule 25).
 * @param name - File name inside the sandbox data dir.
 * @returns {Promise<object>} Parsed store.
 */
export async function readStore(name) {
  return JSON.parse(await readFile(join(home, "data", name), "utf8"));
}

/**
 * Write a store file directly (to preset pin-protection or branch records).
 * @param name - File name inside the sandbox data dir.
 * @param value - Store payload.
 * @returns {Promise<void>}
 */
export async function writeStore(name, value) {
  await writeFile(join(home, "data", name), JSON.stringify(value));
}

/**
 * Reset both stores to empty so tests never observe each other's writes
 * (rule 26: order-independent, parallel-safe).
 * @returns {Promise<void>}
 */
export async function resetStores() {
  await writeStore("branches.json", { version: 1, branches: [] });
  await writeStore("autotitle.json", { version: 1, titles: {} });
}

/** Remove the sandbox. Register with `afterAll(cleanup)`. */
export async function cleanup() {
  await rm(home, { recursive: true, force: true });
}
