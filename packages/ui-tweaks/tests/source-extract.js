/**
 * Lift verbatim definitions out of the bundled client half so client-side logic can
 * be exercised at runtime without a browser, a DOM, or a build step.
 *
 * The client ships as one IIFE that cannot be imported, so specs compile the exact
 * shipping source against minimal doubles rather than reimplementing the behaviour
 * they mean to test. Only whole declarations are lifted, and the extraction is
 * brace-matched, so a spec can never silently drift from the source it covers.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The shipping client source, read once per test process. */
export const clientSource = await readFile(join(root, "lib/client.js"), "utf8");

/**
 * Extract a whole `[async] function name(...) { ... }` declaration.
 * @param name - Function name.
 * @returns The declaration's verbatim source.
 */
export function extractFunction(name) {
  const found = clientSource.indexOf(`function ${name}(`);
  if (found === -1) throw new Error(`missing function ${name}`);
  // Keep the `async` modifier: an extracted async body would otherwise not compile.
  const start = clientSource.slice(found - 6, found) === "async " ? found - 6 : found;
  // Skip the parameter list first: a destructured parameter is itself a brace pair,
  // so brace matching must not begin until the signature's parentheses close.
  let index = clientSource.indexOf("(", start);
  let parens = 0;
  for (; index < clientSource.length; index += 1) {
    if (clientSource[index] === "(") parens += 1;
    else if (clientSource[index] === ")") {
      parens -= 1;
      if (parens === 0) break;
    }
  }
  let depth = 0;
  for (index = clientSource.indexOf("{", index); index < clientSource.length; index += 1) {
    if (clientSource[index] === "{") depth += 1;
    else if (clientSource[index] === "}") {
      depth -= 1;
      if (depth === 0) return clientSource.slice(start, index + 1);
    }
  }
  throw new Error(`unbalanced function ${name}`);
}

/**
 * Extract a single-line `const X = ...;` declaration.
 * @param prefix - Declaration prefix, e.g. `const MAX_ITEMS =`.
 * @returns The declaration's verbatim source, without the newline.
 */
export function extractLine(prefix) {
  const start = clientSource.indexOf(prefix);
  if (start === -1) throw new Error(`missing declaration ${prefix}`);
  return clientSource.slice(start, clientSource.indexOf("\n", start));
}

/**
 * Compile a body built from lifted declarations and call it.
 * @param body - Function body, ending in a `return`.
 * @param argNames - Parameter names to bind.
 * @param args - Values for `argNames`.
 * @returns Whatever the body returned.
 */
export function compileBody(body, argNames, args) {
  return new Function(...argNames, body)(...args);
}
