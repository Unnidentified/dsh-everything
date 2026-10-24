/**
 * Deployment-owned configuration, validated at load.
 *
 * Every field here varies by deployment: where the binary is, where the store
 * lives, how long a scan of *this* project may take. None of them is a tuning
 * knob a user has to find — each has a default that is correct on an ordinary
 * machine, and the defaults are the whole configuration for most deployments.
 *
 * What is deliberately **not** configurable is filesnap's own scan bound. The
 * engine takes it as a library parameter with a correct default and does not
 * expose it on the command line (filesnap D14), because a bound a user has to
 * discover is not a bound. `filesnap status` answers the question that setting
 * would have been reached for — which files in this project are not protected,
 * and why.
 *
 * A bad value fails at load rather than at the first turn: the plugin is
 * self-contained enough to check itself, and a misconfiguration that surfaces
 * as a missing snapshot an hour later is indistinguishable from a bug.
 *
 * @module
 */
/** What a deployment may set. */
export interface FilesnapConfig {
    /**
     * Where the `filesnap` command is, when the deployment wants to say.
     *
     * **Normally absent.** `filesnap` is a dependency of this package, so the
     * prebuilt binary for this platform is installed beside it and is found
     * without configuration. Set this to point at a different build, or to a bare
     * name for a subprocess provider whose execution world is not this machine —
     * a bare name resolves through that provider's own PATH rather than this
     * process's environment.
     */
    readonly command?: string;
    /**
     * Where the store lives. Omitted lets the engine use the platform data
     * directory — `$XDG_DATA_HOME` or `~/.local/share` on Unix, `%LOCALAPPDATA%`
     * on Windows — which is never inside the user's project.
     */
    readonly dataDir?: string;
    /**
     * Wall-clock bound for one invocation. The expensive one is `capture`: a stat
     * walk measured in hundreds of milliseconds on an ordinary project, and
     * longer on a large one over a network filesystem.
     */
    readonly timeoutMs: number;
    /** SIGTERM-to-SIGKILL grace when a deadline or a cancelled turn ends a run. */
    readonly graceMs: number;
    /**
     * In-memory cap per collected stream. A restore names every file it wrote on
     * its own line, so this scales with the size of the largest rewind rather
     * than with the project.
     */
    readonly maxOutputBytes: number;
    /**
     * Whether an edit declares its pre-image before it lands. Leaving this off
     * narrows coverage to what the per-turn scan sees: a file outside the
     * workspace, over the size limit, or beyond the recency budget stops being
     * restorable. It exists for a deployment whose filesystem seam is remote,
     * where the engine cannot read the path it is handed.
     */
    readonly declareEdits: boolean;
    /** Migrate compatible unloaded legacy sessions on plugin startup. */
    readonly autoMigrate: boolean;
}
/**
 * The name to fall back to when nothing is installed beside this package and
 * the deployment named no command — a subprocess provider pointed at a remote
 * execution world, where a local `node_modules` path means nothing.
 */
export declare const FALLBACK_COMMAND = "filesnap";
/** The configuration of a deployment that sets nothing. */
export declare const DEFAULTS: {
    readonly timeoutMs: 120000;
    readonly graceMs: 2000;
    readonly maxOutputBytes: number;
    readonly declareEdits: true;
    readonly autoMigrate: true;
};
/**
 * Validate a deployment's configuration and fill in what it left out.
 *
 * @param config - the raw `config` block from the Cordis entry, or nothing.
 * @returns a detached, complete configuration.
 * @throws when a field is unknown or holds a value the plugin cannot use.
 */
export declare function resolveConfig(config?: unknown): FilesnapConfig;
