/**
 * Finding the `filesnap` binary this plugin installs with.
 *
 * `filesnap` is an ordinary dependency, so npm puts the right prebuilt binary
 * next to this package and nobody has to install anything by hand. What it does
 * not do is put it on `PATH`: the launcher's `bin` entry lands in the profile's
 * `node_modules/.bin`, which the subprocess provider's scrubbed environment has
 * no reason to include. So the path is resolved rather than looked up.
 *
 * **The platform binary directly, not the `filesnap` launcher.** That launcher
 * is a Node script whose whole job is this same lookup; going through it would
 * add a Node startup to every invocation, and this plugin spawns per turn and
 * per newly edited path — the batching in `declare` exists precisely because
 * process startup is the cost that adds up.
 *
 * @module
 */
/**
 * Locate the binary that came with this package's own dependency.
 *
 * Resolution starts from the `filesnap` launcher rather than from here: the
 * platform package is *its* optional dependency, not this plugin's, so a strict
 * (pnpm-style) layout puts it somewhere only a resolver anchored at the
 * launcher can answer for.
 *
 * @param from - module URL to resolve from; defaults to this module.
 * @returns an absolute path, or undefined when nothing is installed here.
 */
export declare function bundledBinary(from?: string): string | undefined;
