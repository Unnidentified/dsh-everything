/**
 * Pure text helpers for the `/voice` command.
 *
 * Kept free of Host imports so they can be unit-tested with plain `node`
 * against no composed runtime. `command.js` owns everything that touches
 * `ctx`, the agent, or child processes.
 *
 * @module dsh-plugin-natural-voice/text
 */

/**
 * Split a command body into `@path` references and the remaining inline text.
 *
 * `@` counts as a reference only at the start of the body or after whitespace,
 * and only when the token carries no trailing sentence punctuation. An email
 * address, a handle mid-sentence, or a mention followed by a comma therefore
 * stays prose.
 *
 * @param body - the text after the mode word.
 * @returns `{ paths, inline }` with `inline` collapsed to single spaces.
 */
export function splitReferences(body) {
  const paths = [];
  const inline = [];
  // The path must END on a non-dot character, so a sentence-final period stays
  // in the prose: "@draft.md." references draft.md, it does not reference a
  // file literally named "draft.md.".
  const re = /(^|\s)@([A-Za-z0-9._~+/\\-]*[A-Za-z0-9_~+/\\-])(?=[\s]|$|[.,;:!?)\]])/g;
  let last = 0;
  let match;
  while ((match = re.exec(body)) !== null) {
    inline.push(body.slice(last, match.index + match[1].length));
    paths.push(match[2]);
    // Advance past the whole match (leading space + "@" + path). Adding only
    // the path length would leave the "@" inside the inline remainder.
    last = match.index + match[0].length;
  }
  inline.push(body.slice(last));
  return {
    paths,
    inline: inline.join("").replace(/\s+/g, " ").trim(),
  };
}

/**
 * Strip a leading YAML frontmatter block.
 *
 * The Host strips frontmatter before injecting a skill through the registry;
 * this command reads `SKILL.md` directly, so it must do the same or the model
 * sees the metadata twice, once as text.
 */
export function stripFrontmatter(raw) {
  const m = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(raw);
  return m === null ? raw.trim() : raw.slice(m[0].length).trim();
}

/** Approximate token count, used only for the packet budget report. */
export function approxTokens(text) {
  return Math.round(text.length / 4);
}
