import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  callHandler,
  cleanup,
  mount,
  readStore,
  resetStores,
  sid,
  titleEvent,
  userMessage,
  writeSessionLog,
} from "./helpers.js";

afterAll(cleanup);
beforeEach(resetStores);

const post = (routes, body) => callHandler(routes.get("/edit-resend-branches"), "POST", body);
const get = (routes) => callHandler(routes.get("/edit-resend-branches"), "GET", undefined);

describe("/edit-resend-branches", () => {
  it("returns an empty store before anything is written", async () => {
    const { routes } = mount();
    const out = await get(routes);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ branches: [], titles: {} });
  });

  it("stores a posted record durably and returns it on the next GET", async () => {
    const { routes } = mount();
    const record = {
      childId: sid(),
      parentId: sid(),
      parentTitle: "T",
      childTitle: "T",
      parentMsgSeq: 10,
      anchorSeq: 5,
    };
    const created = await post(routes, { record });
    expect(created.status).toBe(200);
    expect(created.body).toEqual({ ok: true, branches: 1 });

    const stored = await readStore("branches.json");
    expect(stored.branches).toHaveLength(1);
    expect(stored.branches[0]).toMatchObject({ childId: record.childId, anchorSeq: 5 });

    const listed = await get(routes);
    expect(listed.body.branches).toHaveLength(1);
    expect(listed.body.branches[0].childId).toBe(record.childId);
  });

  it("replaces the record for the same child instead of duplicating it", async () => {
    const { routes } = mount();
    const childId = sid();
    const parentId = sid();
    await post(routes, { record: { childId, parentId, parentMsgSeq: 10, anchorSeq: 5 } });
    await post(routes, { record: { childId, parentId, parentMsgSeq: 10, anchorSeq: 7 } });

    const listed = await get(routes);
    expect(listed.body.branches).toHaveLength(1);
    expect(listed.body.branches[0].anchorSeq).toBe(7);
  });

  it("includes session-log titles in the GET payload", async () => {
    const { routes } = mount();
    const id = sid();
    await writeSessionLog(id, [userMessage("hi"), titleEvent("登录问题修复")]);
    const record = { childId: id, parentId: sid(), parentMsgSeq: 1, anchorSeq: 0 };
    await post(routes, { record });

    const listed = await get(routes);
    expect(listed.body.titles[id]).toBe("登录问题修复");
  });

  it("rejects a non-JSON body with 400", async () => {
    const { routes } = mount();
    const out = await post(routes, "{not json");
    expect(out.status).toBe(400);
  });

  it("rejects a record without parentId or childId with 400", async () => {
    const { routes } = mount();
    expect((await post(routes, { record: { childId: sid() } })).status).toBe(400);
    expect((await post(routes, { record: { parentId: sid() } })).status).toBe(400);
    expect((await post(routes, {})).status).toBe(400);
  });

  it("rejects unsupported methods with 405", async () => {
    const { routes } = mount();
    const out = await callHandler(routes.get("/edit-resend-branches"), "DELETE", undefined);
    expect(out.status).toBe(405);
  });

  it("keeps other records when one child is replaced", async () => {
    const { routes } = mount();
    const stable = sid();
    const replaced = sid();
    await post(routes, { record: { childId: stable, parentId: sid(), parentMsgSeq: 1, anchorSeq: 0 } });
    await post(routes, { record: { childId: replaced, parentId: sid(), parentMsgSeq: 1, anchorSeq: 0 } });
    await post(routes, { record: { childId: replaced, parentId: sid(), parentMsgSeq: 1, anchorSeq: 2 } });

    const listed = await get(routes);
    expect(listed.body.branches).toHaveLength(2);
    expect(listed.body.branches.find((b) => b.childId === stable)).toBeTruthy();
    expect(listed.body.branches.find((b) => b.childId === replaced).anchorSeq).toBe(2);
  });
});
