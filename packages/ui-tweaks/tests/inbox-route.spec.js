import { afterAll, describe, expect, it } from "vitest";
import {
  callHandler,
  cleanup,
  inboxSplice,
  mount,
  sid,
  turnEnd,
  userMessage,
  writeSessionLog,
} from "./helpers.js";

afterAll(cleanup);

const post = (routes, body) => callHandler(routes.get("/edit-resend-inbox"), "POST", body);

describe("/edit-resend-inbox", () => {
  it("answers 404 when the session log does not exist yet", async () => {
    const { routes } = mount();
    const out = await post(routes, { sessionId: sid() });
    expect(out.status).toBe(404);
    expect(out.body).toHaveProperty("error");
  });

  it("lists queued next-turn items recorded after the last turn end", async () => {
    const { routes } = mount();
    const id = sid();
    await writeSessionLog(id, [
      userMessage("first question"),
      turnEnd(),
      inboxSplice([{ id: "q-1", text: "replayed question" }]),
    ]);
    const out = await post(routes, { sessionId: id });
    expect(out.status).toBe(200);
    expect(out.body.items).toEqual([{ id: "q-1", text: "replayed question" }]);
  });

  it("ignores splices that were consumed before the last turn end", async () => {
    const { routes } = mount();
    const id = sid();
    await writeSessionLog(id, [
      inboxSplice([{ id: "q-old", text: "already answered" }]),
      turnEnd(),
    ]);
    const out = await post(routes, { sessionId: id });
    expect(out.status).toBe(200);
    expect(out.body.items).toEqual([]);
  });

  it("ignores splices aimed at queues other than next-turn", async () => {
    const { routes } = mount();
    const id = sid();
    await writeSessionLog(id, [
      turnEnd(),
      inboxSplice([{ id: "q-side", text: "steering note" }], "steering"),
    ]);
    const out = await post(routes, { sessionId: id });
    expect(out.status).toBe(200);
    expect(out.body.items).toEqual([]);
  });

  it("rejects a body without sessionId with 400", async () => {
    const { routes } = mount();
    expect((await post(routes, {})).status).toBe(400);
  });

  it("rejects unsupported methods with 405", async () => {
    const { routes } = mount();
    const out = await callHandler(routes.get("/edit-resend-inbox"), "GET", undefined);
    expect(out.status).toBe(405);
  });
});
