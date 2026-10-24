/**
 * The `filesnap` command, which is this plugin's only interface to the engine.
 *
 * There is no sidecar and no protocol (filesnap D29): every operation is one
 * process that opens the store, does one thing, and exits. What a long-lived
 * host would have kept in memory the engine persists instead, so nothing is
 * lost between calls. The cost that buys is process startup, answered by
 * batching — `declare` takes many paths in one invocation — rather than by a
 * daemon.
 *
 * Output is JSON Lines on stdout and prose on stderr (filesnap D32), one
 * object per line carrying its own schema version (filesnap D39). A version in
 * a header would not survive `grep`, `tail` or `split`, and the reader here may
 * be holding exactly one line — so {@link parseEvents} refuses a line whose
 * `v` it does not understand rather than reading it as though the fields still
 * meant what they used to.
 *
 * @module
 */
/**
 * The JSON Lines schema version this plugin reads. The engine bumps it only
 * for a change that breaks a reader — a renamed or removed field, or a changed
 * meaning; a new field does not bump it, so an unknown field is ignored and an
 * unknown version is refused.
 */
export const SCHEMA_VERSION = 1;
/**
 * Map a process outcome onto the command's documented exit contract.
 *
 * A signalled or unrecognized code is `failed` rather than a fifth state: the
 * caller's decision is the same either way — nothing on stdout can be trusted.
 *
 * @param code - the child's exit code, or null when it died from a signal.
 * @returns which documented outcome this was.
 */
function classify(code) {
    switch (code) {
        case 0: return 'ok';
        case 1: return 'partial';
        case 3: return 'usage';
        default: return 'failed';
    }
}
/**
 * Read a JSON Lines stream into accepted events, refusing what this reader
 * does not understand.
 *
 * A refused line is counted rather than thrown: one unreadable line in a
 * restore's per-file stream must not cost the caller the terminal event that
 * carries the point the restore can be reversed to.
 *
 * @param text - the collected stdout.
 * @returns the accepted events and how many lines were refused.
 */
export function parseEvents(text) {
    const events = [];
    let refused = 0;
    for (const line of text.split('\n')) {
        if (line.trim() === '')
            continue;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            refused++;
            continue;
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            refused++;
            continue;
        }
        const candidate = parsed;
        if (candidate['v'] !== SCHEMA_VERSION || typeof candidate['type'] !== 'string') {
            refused++;
            continue;
        }
        events.push(candidate);
    }
    return { events, refused };
}
/**
 * The last event of a given type, which for a terminal `.done` event is the
 * one carrying the counts and — on a restore — the id the operation can be
 * reversed to.
 *
 * @param run - a completed invocation.
 * @param type - the `<command>.<event>` type to look for.
 * @returns the last matching event, or undefined when the engine emitted none.
 */
export function lastEvent(run, type) {
    return run.events.findLast(event => event.type === type);
}
/**
 * Every event of a given type, in emission order — the shape the streaming
 * per-file events take (`restore.written`, `restore.failed`, `log.entry`).
 *
 * @param run - a completed invocation.
 * @param type - the `<command>.<event>` type to collect.
 * @returns the matching events.
 */
export function eventsOfType(run, type) {
    return run.events.filter(event => event.type === type);
}
/**
 * Read one field of an event as a number.
 *
 * @param event - the event to read, or undefined when it never arrived.
 * @param field - the payload field name.
 * @param fallback - what to report when the field is absent or not a number.
 * @returns the field's value, or `fallback`.
 */
export function numberField(event, field, fallback) {
    const value = event?.[field];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
/**
 * Read one field of an event as a string.
 *
 * @param event - the event to read, or undefined when it never arrived.
 * @param field - the payload field name.
 * @param fallback - what to report when the field is absent or not a string.
 * @returns the field's value, or `fallback`.
 */
export function stringField(event, field, fallback) {
    const value = event?.[field];
    return typeof value === 'string' ? value : fallback;
}
/**
 * Build the invoker the rest of the plugin talks to.
 *
 * `--data-dir` is prepended to every argv here rather than at each call site,
 * because a store that moves between two invocations of one operation is a
 * store whose contents nobody can account for.
 *
 * @param ctx - a context carrying `ctx.subprocess`.
 * @param options - executable, store location, and the bounds on one run.
 * @returns the invoker.
 */
export function createFilesnapCli(ctx, options) {
    const prefix = options.dataDir === undefined ? [] : ['--data-dir', options.dataDir];
    return {
        async run(argv, cwd, signal, stdin) {
            const deadline = AbortSignal.timeout(options.timeoutMs);
            const bound = signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
            const spec = {
                argv: [options.executable, ...prefix, ...argv],
                cwd,
                stdio: {
                    // A confirmed ignore policy is the only stdin payload; the provider
                    // writes and closes it as one batch. Ordinary commands keep fd 0 closed.
                    stdin: stdin === undefined ? 'ignore' : { data: stdin },
                    stdout: { maxBytes: options.maxOutputBytes },
                    stderr: { maxBytes: options.maxOutputBytes },
                },
                graceMs: options.graceMs,
                signal: bound,
            };
            const handle = ctx.subprocess.spawn(spec);
            let code;
            try {
                code = (await handle.done).exitCode;
            }
            catch (error) {
                return {
                    exit: 'failed',
                    code: null,
                    events: [],
                    refused: 0,
                    stderr: `filesnap could not be started: ${String(error)}`,
                };
            }
            const stdout = handle.collected.stdout?.readFrom(0).text ?? '';
            const stderr = handle.collected.stderr?.readFrom(0).text ?? '';
            const { events, refused } = parseEvents(stdout);
            // The abort is reported before the code is classified: a child killed at
            // the deadline exits by signal, and `failed` would say "it ran and could
            // not report" about something that was still running.
            const exit = bound.aborted ? 'aborted' : classify(code);
            return { exit, code, events, refused, stderr: stderr.trim() };
        },
    };
}
/** FileSnap 0.5.1 reports an absent undo record as this exact usage diagnostic. */
export function hasNoRestore(run, session) {
    return run.exit === 'usage' && run.refused === 0 && run.events.length === 0
        && run.stderr.trim() === `filesnap: session ${session} has no restore to undo`;
}
