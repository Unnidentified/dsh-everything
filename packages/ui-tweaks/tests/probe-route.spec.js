/**
 * Coverage for the client probe route.
 *
 * The browser half cannot be inspected from outside the renderer, so it reports the
 * runtime facts a diagnosis needs to this route, which appends them to a JSONL file.
 * The route is small but load-bearing: if it silently drops or mangles a report, a
 * failure becomes undiagnosable again.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { callHandler, cleanup, home, mount, resetStores } from "./helpers.js";

afterAll(cleanup);
beforeEach(resetStores);

const probeLog = join(home, "data", "probe.log");
const post = (routes, body) => callHandler(routes.get("/edit-resend-probe"), "POST", body);

describe("/edit-resend-probe", () => {
  it("appends one JSON line per report and echoes success", async () => {
    const { routes } = mount();

    const first = await post(routes, { where: "edit-open", imagesRead: 2 });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true });

    const second = await post(routes, { where: "hover", reason: "out-of-scope" });
    expect(second.status).toBe(200);

    const lines = (await readFile(probeLog, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ where: "edit-open", imagesRead: 2 });
    expect(typeof lines[0].at).toBe("string");
    expect(lines[1]).toMatchObject({ where: "hover", reason: "out-of-scope" });
  });

  it("rejects a non-POST method", async () => {
    const { routes } = mount();
    const out = await callHandler(routes.get("/edit-resend-probe"), "GET", undefined);
    expect(out.status).toBe(405);
  });

  it("rejects a body that is not JSON", async () => {
    const { routes } = mount();
    const out = await callHandler(routes.get("/edit-resend-probe"), "POST", "definitely not json");
    expect(out.status).toBe(400);
  });
});
