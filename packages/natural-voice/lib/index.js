/**
 * Plugin entry. One import surface: the Host row in `cordis.patch.yml` names
 * this package, and `lib/index.js` re-exports `apply`/`inject`/`name` from the
 * command module.
 *
 * @module dsh-plugin-natural-voice
 */

export { apply, inject, name } from "./command.js";
export { MANIFEST, MODES, INVARIANTS, usage } from "./manifest.js";
