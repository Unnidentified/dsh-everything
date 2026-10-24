/**
 * Runtime coverage for path-mention detection (click a path in a message to reveal
 * it in Finder).
 *
 * The detection lives inside the bundled client IIFE, so this spec lifts the shipping
 * declarations verbatim and drives them. The interesting behaviour is entirely in the
 * matching rules: a false positive turns ordinary prose into a clickable path, and a
 * false negative hides a real one.
 */
import { describe, expect, it } from "vitest";
import { clientSource, compileBody, extractFunction, extractLine } from "./source-extract.js";

function loadPathLogic() {
  const body = [
    extractLine("const PATH_TOKEN_RE ="),
    extractLine("const PATH_QUOTED_RE ="),
    extractFunction("trimPathToken"),
    extractFunction("findPathAt"),
    extractFunction("joinPath"),
    "return { findPathAt, trimPathToken, joinPath };",
  ].join("\n");
  return compileBody(body, [], []);
}

const { findPathAt, trimPathToken, joinPath } = loadPathLogic();

/** A caret offset inside `needle` within `text`. */
const inside = (text, needle, delta = 0) => text.indexOf(needle) + delta;

describe("path mentions: what becomes clickable", () => {
  it("finds an absolute path under the pointer", () => {
    const text = "the fix lives in /Users/gefaass/Documents/dsh/x.js today";
    expect(findPathAt(text, inside(text, "/Users", 5))).toEqual({
      path: "/Users/gefaass/Documents/dsh/x.js",
      absolute: true,
    });
  });

  it("ignores a pointer that is not over a path", () => {
    const text = "the fix lives in /Users/gefaass/x.js today";
    expect(findPathAt(text, 0)).toBeNull();
    expect(findPathAt(text, inside(text, "today", 1))).toBeNull();
  });

  it("accepts a relative path that ends like a file", () => {
    const text = "see lib/client.js for the editor";
    expect(findPathAt(text, inside(text, "lib/client.js", 3))).toEqual({
      path: "lib/client.js",
      absolute: false,
    });
  });

  it("accepts explicitly relative prefixes", () => {
    const text = "run ./scripts/build.sh or ../tools/x.mjs";
    expect(findPathAt(text, inside(text, "./scripts/build.sh", 4))).toEqual({
      path: "./scripts/build.sh",
      absolute: false,
    });
    expect(findPathAt(text, inside(text, "../tools/x.mjs", 4))).toEqual({
      path: "../tools/x.mjs",
      absolute: false,
    });
  });

  it("marks a home-relative path as home, never as cwd-relative", () => {
    // Regression: `~/.dsh/...` was treated as an ordinary relative path and joined
    // onto the session cwd, producing `<cwd>/~/.dsh/...` — a path that cannot exist.
    const text = "logs land in ~/.dsh/profiles/desktop/probe.log next";
    expect(findPathAt(text, inside(text, "~/.dsh/profiles", 6))).toEqual({
      path: "~/.dsh/profiles/desktop/probe.log",
      absolute: false,
      home: true,
    });
  });

  it("still refuses prose that merely contains a tilde", () => {
    const text = "roughly ~20/30 of them";
    expect(findPathAt(text, inside(text, "~20/30", 2))).toBeNull();
  });

  it("refuses slash-joined prose", () => {
    for (const text of ["either and/or both", "pick and/or choose", "a and/or b"]) {
      expect(findPathAt(text, inside(text, "and/or", 2))).toBeNull();
    }
  });

  it("refuses a relative directory, which cannot be told apart from prose", () => {
    expect(findPathAt("see src/components for it", inside("see src/components for it", "src/components", 3))).toBeNull();
  });

  it("refuses a URL, including one with a file-looking tail", () => {
    for (const url of ["https://api.example.com/v1/x", "https://example.com/README.md"]) {
      const text = `see ${url} now`;
      expect(findPathAt(text, inside(text, url, 8))).toBeNull();
    }
  });

  it("refuses a version number", () => {
    const text = "version 1.2.3 released";
    expect(findPathAt(text, inside(text, "1.2.3", 2))).toBeNull();
  });

  it("refuses a path glued to a scheme or key colon", () => {
    const text = "key:/Users/x/y.js";
    expect(findPathAt(text, inside(text, "/Users/x/y.js", 4))).toBeNull();
  });

  it("finds a quoted path that contains spaces", () => {
    const text = 'cd "/Users/gefaass/My Projects/tool.sh" now';
    expect(findPathAt(text, inside(text, "My Projects", 2))).toEqual({
      path: "/Users/gefaass/My Projects/tool.sh",
      absolute: true,
    });
  });

  it("trims the sentence period that prose attaches", () => {
    const text = "written to /tmp/foo.";
    expect(findPathAt(text, inside(text, "/tmp/foo", 4))).toEqual({ path: "/tmp/foo", absolute: true });
  });

  it("drops a markdown line anchor before revealing", () => {
    const single = "see /Users/x/a.js#L24 please";
    expect(findPathAt(single, inside(single, "/Users/x/a.js", 5))).toEqual({
      path: "/Users/x/a.js",
      absolute: true,
    });
    const range = "see /Users/x/a.js#L24-L30 please";
    expect(findPathAt(range, inside(range, "/Users/x/a.js", 5))).toEqual({
      path: "/Users/x/a.js",
      absolute: true,
    });
  });
});

describe("path mentions: token trimming", () => {
  it("keeps a real extension", () => {
    expect(trimPathToken("/a/b/c.md")).toBe("/a/b/c.md");
  });

  it("strips trailing prose punctuation", () => {
    expect(trimPathToken("/a/b/c.")).toBe("/a/b/c");
    expect(trimPathToken("/a/b/c,")).toBe("/a/b/c");
    expect(trimPathToken("/a/b/c!")).toBe("/a/b/c");
  });

  it("keeps the extension when punctuation follows it", () => {
    expect(trimPathToken("/a/b/c.md.")).toBe("/a/b/c.md");
  });

  it("keeps a trailing slash, which still names a directory", () => {
    expect(trimPathToken("/a/b/")).toBe("/a/b/");
  });
});

describe("path mentions: resolving relative candidates", () => {
  it("resolves against the session working directory", () => {
    expect(joinPath("/Users/x/proj", "lib/client.js")).toBe("/Users/x/proj/lib/client.js");
  });

  it("normalises . and .. segments", () => {
    expect(joinPath("/Users/x/proj", "./a/../b/c.txt")).toBe("/Users/x/proj/b/c.txt");
    expect(joinPath("/Users/x/proj", "../../y")).toBe("/Users/y");
  });

  it("always returns an absolute path", () => {
    expect(joinPath("/a", "b")).toBe("/a/b");
  });
});

describe("path mentions: the content anchor", () => {
  /** The `CONTENT_SCOPE` declaration, verbatim. */
  const scopeStart = clientSource.indexOf("const CONTENT_SCOPE");
  const scope = clientSource.slice(scopeStart, clientSource.indexOf("].join", scopeStart));

  it("anchors on attributes that exist outside the compact markdown variant", () => {
    // Regression guard. DSH renders `data-markdown-variant` only when the variant is
    // "compact" (`variant === "compact" ? variant : void 0`), so anchoring on that
    // attribute alone left every normal message inert — no path was clickable at all.
    expect(scope).toContain("[data-chat-flow-key]");
    expect(scope).toContain("[data-chat-flow-kind]");
    expect(scope).toContain("[data-chat-anchor-key]");
  });

  it("also covers markdown rendered outside a chat row", () => {
    expect(scope).toContain("_markdown");
  });

  it("skips targets that already have their own click behaviour", () => {
    expect(clientSource).toContain(
      'const INTERACTIVE_SCOPE = "button, a, [data-ref-chip], [contenteditable], textarea, input"',
    );
  });
});
