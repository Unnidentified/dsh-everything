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
/**
 * The name to fall back to when nothing is installed beside this package and
 * the deployment named no command — a subprocess provider pointed at a remote
 * execution world, where a local `node_modules` path means nothing.
 */
export const FALLBACK_COMMAND = 'filesnap';
/** The configuration of a deployment that sets nothing. */
export const DEFAULTS = {
    timeoutMs: 120_000,
    graceMs: 2_000,
    maxOutputBytes: 1 << 20,
    declareEdits: true,
    autoMigrate: true,
};
/** Fields a deployment may name; anything else is a typo worth failing on. */
const KNOWN = new Set([...Object.keys(DEFAULTS), 'dataDir', 'command']);
/**
 * Read one optional positive-integer field.
 *
 * @param raw - the caller's configuration object.
 * @param key - the field name.
 * @param fallback - the default when the field is absent.
 * @returns the validated value.
 * @throws when the field is present and is not a positive safe integer.
 */
function positiveInteger(raw, key, fallback) {
    const value = raw[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`filesnap: \`${key}\` must be a positive integer, got ${JSON.stringify(value)}`);
    }
    return value;
}
/**
 * Read one optional non-empty-string field.
 *
 * @param raw - the caller's configuration object.
 * @param key - the field name.
 * @returns the validated value, or undefined when absent.
 * @throws when the field is present and is not a non-empty string.
 */
function nonEmptyString(raw, key) {
    const value = raw[key];
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`filesnap: \`${key}\` must be a non-empty string, got ${JSON.stringify(value)}`);
    }
    return value;
}
/**
 * Validate a deployment's configuration and fill in what it left out.
 *
 * @param config - the raw `config` block from the Cordis entry, or nothing.
 * @returns a detached, complete configuration.
 * @throws when a field is unknown or holds a value the plugin cannot use.
 */
export function resolveConfig(config = {}) {
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        throw new TypeError(`filesnap: config must be an object, got ${JSON.stringify(config)}`);
    }
    const raw = config;
    const unknown = Object.keys(raw).filter(key => !KNOWN.has(key));
    if (unknown.length > 0) {
        throw new TypeError(`filesnap: unknown config key(s) ${unknown.join(', ')} — `
            + `the fields are ${[...KNOWN].sort().join(', ')}`);
    }
    const declareEdits = raw['declareEdits'];
    if (declareEdits !== undefined && typeof declareEdits !== 'boolean') {
        throw new TypeError(`filesnap: \`declareEdits\` must be a boolean, got ${JSON.stringify(declareEdits)}`);
    }
    const autoMigrate = raw['autoMigrate'];
    if (autoMigrate !== undefined && typeof autoMigrate !== 'boolean')
        throw new TypeError('filesnap: `autoMigrate` must be a boolean');
    const dataDir = nonEmptyString(raw, 'dataDir');
    const command = nonEmptyString(raw, 'command');
    return {
        ...command === undefined ? {} : { command },
        ...dataDir === undefined ? {} : { dataDir },
        timeoutMs: positiveInteger(raw, 'timeoutMs', DEFAULTS.timeoutMs),
        graceMs: positiveInteger(raw, 'graceMs', DEFAULTS.graceMs),
        maxOutputBytes: positiveInteger(raw, 'maxOutputBytes', DEFAULTS.maxOutputBytes),
        declareEdits: declareEdits ?? DEFAULTS.declareEdits,
        autoMigrate: autoMigrate ?? DEFAULTS.autoMigrate,
    };
}
