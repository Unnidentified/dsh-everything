/**
 * Runtime coverage for the inline editor's image handling.
 *
 * The editor lives inside the bundled client IIFE and cannot be imported, so this
 * spec lifts the *verbatim* function bodies out of `lib/client.js`, compiles them
 * with a minimal DOM double, and drives them. That keeps the assertions tied to the
 * shipping source rather than to a reimplementation of it.
 */
import { describe, expect, it } from "vitest";
import { extractFunction, extractLine } from "./source-extract.js";

const element = (tag) => {
  const el = {
    tagName: tag,
    children: [],
    attributes: {},
    style: {},
    innerHTML: "",
    title: "",
    type: "",
    value: "",
    files: [],
    listeners: {},
    setAttribute(key, value) {
      this.attributes[key] = String(value);
    },
    getAttribute(key) {
      return this.attributes[key] ?? null;
    },
    removeAttribute(key) {
      delete this.attributes[key];
    },
    append(...kids) {
      this.children.push(...kids);
    },
    appendChild(kid) {
      this.children.push(kid);
      return kid;
    },
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    focus() {},
    remove() {},
    click() {
      for (const fn of this.listeners.click ?? []) fn({ preventDefault() {}, stopPropagation() {} });
    },
    fire(type, event) {
      for (const fn of this.listeners[type] ?? []) fn(event);
    },
  };
  // Real DOM semantics that `renderStrip` relies on: assigning "" empties the node.
  let text = "";
  Object.defineProperty(el, "textContent", {
    get: () => text,
    set: (value) => {
      text = String(value);
      if (text === "") el.children.length = 0;
    },
  });
  return el;
};

const walk = (node) => [node, ...(node.children ?? []).flatMap(walk)];
const findAll = (node, predicate) => walk(node).filter(predicate);
const chipsOf = (editor) => findAll(editor, (n) => n.attributes["data-er-chip"] === "1");

const stubFile = (name, type) => ({ name, type, size: 3 });

/**
 * Compile the real editor source against DOM doubles.
 * @param currentBinding - Stub for the binding lookup used by the attachment reader.
 * @param ctx - Stub client context exposing `sessions.binding(...)`.
 */
function loadEditor({ currentBinding = () => undefined, ctx = { sessions: { binding: () => undefined } } } = {}) {
  const body = [
    extractLine("const IMAGE_MEDIA_TYPES ="),
    extractLine("const MAX_EDITOR_IMAGES ="),
    extractFunction("isImageFile"),
    extractFunction("readMessageAttachmentFiles"),
    extractFunction("buildInlineEditor"),
    "return { buildInlineEditor, readMessageAttachmentFiles, isImageFile };",
  ].join("\n");
  const factory = new Function(
    "document",
    "window",
    "requestAnimationFrame",
    "URL",
    "File",
    "EDITOR_ATTR",
    "t",
    "imageSvg",
    "crossSvg",
    "arrowUpSvg",
    "currentBinding",
    "ctx",
    body,
  );
  return factory(
    { createElement: element },
    { innerHeight: 800 },
    (fn) => fn(),
    { createObjectURL: (file) => `blob:${file.name}`, revokeObjectURL() {} },
    class File {
      constructor(parts, name, options) {
        this.parts = parts;
        this.name = name;
        this.type = options?.type ?? "";
      }
    },
    "data-edit-resend-editor",
    (key) => key,
    () => "<svg/>",
    () => "<svg/>",
    () => "<svg/>",
    currentBinding,
    ctx,
  );
}

const buildEditor = (editor, initialFiles) => {
  const send = [];
  const node = editor.buildInlineEditor("hello", {
    initialFiles,
    onSend: (text, files) => send.push({ text, files }),
    onCancel: () => {},
  });
  return { node, send };
};

const pressSend = (wrap) => {
  const button = findAll(wrap, (n) => n.attributes["data-er-round"] === "send")[0];
  button.click();
  return findAll(wrap, (n) => n.tagName === "textarea")[0];
};

describe("inline editor: the message's own images", () => {
  it("shows an existing image message's attachments as pre-marked chips", () => {
    const editor = loadEditor();
    const original = stubFile("shot.png", "image/png");
    const { node } = buildEditor(editor, [original]);

    const chips = chipsOf(node);
    expect(chips).toHaveLength(1);
    expect(chips[0].attributes["data-er-chip-original"]).toBe("1");
    const image = chips[0].children.find((child) => child.tagName === "img");
    expect(image.src).toBe("blob:shot.png");
  });

  it("resends kept originals untouched", () => {
    const editor = loadEditor();
    const first = stubFile("a.png", "image/png");
    const second = stubFile("b.jpg", "image/jpeg");
    const { node, send } = buildEditor(editor, [first, second]);

    pressSend(node);
    expect(send).toHaveLength(1);
    expect(send[0].files).toEqual([first, second]);
    expect(send[0].text).toBe("hello");
    expect(chipsOf(node)).toHaveLength(2);
  });

  it("drops an original the user removes from the strip", () => {
    const editor = loadEditor();
    const first = stubFile("a.png", "image/png");
    const second = stubFile("b.png", "image/png");
    const { node, send } = buildEditor(editor, [first, second]);

    const removeFirst = chipsOf(node)[0].children.find(
      (child) => child.attributes["data-er-chip-x"] === "1",
    );
    removeFirst.click();

    expect(chipsOf(node)).toHaveLength(1);
    expect(chipsOf(node)[0].attributes["data-er-chip-original"]).toBe("1");
    pressSend(node);
    expect(send[0].files).toEqual([second]);
  });

  it("appends newly pasted images after the message's originals", () => {
    const editor = loadEditor();
    const original = stubFile("a.png", "image/png");
    const pasted = stubFile("pasted.webp", "image/webp");
    const { node, send } = buildEditor(editor, [original]);

    const textarea = findAll(node, (n) => n.tagName === "textarea")[0];
    textarea.fire("paste", {
      preventDefault() {},
      clipboardData: { files: [pasted] },
    });

    const chips = chipsOf(node);
    expect(chips).toHaveLength(2);
    // Only the seeded chip carries the "already on the message" marker.
    expect(chips.filter((chip) => chip.attributes["data-er-chip-original"] === "1")).toHaveLength(1);

    pressSend(node);
    expect(send[0].files).toEqual([original, pasted]);
  });

  it("sends only the message's originals when nothing is added or removed", () => {
    const editor = loadEditor();
    const { node, send } = buildEditor(editor, []);
    expect(chipsOf(node)).toHaveLength(0);
    expect(node.children.find((child) => child.attributes["data-er-strip"]).style.display).toBe("none");
    pressSend(node);
    expect(send[0].files).toEqual([]);
  });

  it("ignores a non-image seeded file, which the edit path cannot carry", () => {
    const editor = loadEditor();
    const { node } = buildEditor(editor, [stubFile("notes.pdf", "application/pdf")]);
    expect(chipsOf(node)).toHaveLength(0);
  });

  it("caps the strip at the shared per-message image budget", () => {
    const editor = loadEditor();
    const many = Array.from({ length: 25 }, (_, i) => stubFile(`i${i}.png`, "image/png"));
    const { node } = buildEditor(editor, many);
    expect(chipsOf(node)).toHaveLength(20);
  });
});

describe("inline editor: reading a message's attachments", () => {
  const attachments = [
    { kind: "image", desc: { attachmentId: "img-1", name: "one.png", mediaType: "image/png" } },
    { kind: "file", desc: { attachmentId: "doc-1", name: "notes.pdf", mediaType: "application/pdf" } },
    { kind: "image", desc: { attachmentId: "img-broken", name: "gone.png" } },
    { kind: "image", desc: {} },
  ];

  const session = {
    async readAttachment(id) {
      if (id === "img-broken") return { ok: false };
      if (id === "img-1") {
        return { ok: true, value: { attachment: { mediaType: "image/png" }, data: [1, 2, 3] } };
      }
      if (id === "doc-1") {
        return { ok: true, value: { attachment: { mediaType: "application/pdf" }, data: [4] } };
      }
      return { ok: false };
    },
  };
  const ctx = { sessions: { binding: () => ({ session }) } };
  const currentBinding = () => ({ key: "session-1" });

  it("returns only the requested kinds and skips unreadable entries", async () => {
    const editor = loadEditor({ ctx, currentBinding });
    const files = await editor.readMessageAttachmentFiles(attachments, ["image"]);
    expect(files.map((file) => file.name)).toEqual(["one.png"]);
    expect(files[0].type).toBe("image/png");
    expect(files[0].parts).toEqual([new Uint8Array([1, 2, 3])]);
  });

  it("can read the non-image attachments the resend path still forwards", async () => {
    const editor = loadEditor({ ctx, currentBinding });
    const files = await editor.readMessageAttachmentFiles(attachments, ["file"]);
    expect(files.map((file) => file.name)).toEqual(["notes.pdf"]);
    expect(files[0].type).toBe("application/pdf");
  });

  it("returns nothing instead of throwing when no session is bound", async () => {
    const editor = loadEditor({ ctx: { sessions: { binding: () => undefined } }, currentBinding });
    await expect(editor.readMessageAttachmentFiles(attachments, ["image"])).resolves.toEqual([]);
  });

  it("returns nothing for an empty attachment list", async () => {
    const editor = loadEditor({ ctx, currentBinding });
    await expect(editor.readMessageAttachmentFiles([], ["image"])).resolves.toEqual([]);
  });
});
