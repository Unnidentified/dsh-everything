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
import type { Context } from '@deepseek-ai/cordis';
/**
 * The JSON Lines schema version this plugin reads. The engine bumps it only
 * for a change that breaks a reader — a renamed or removed field, or a changed
 * meaning; a new field does not bump it, so an unknown field is ignored and an
 * unknown version is refused.
 */
export declare const SCHEMA_VERSION = 1;
/**
 * What an exit code means. Part of the command's contract, not an
 * afterthought: `partial` and `failed` are deliberately distinct because a
 * partial run's stdout is still a complete event stream naming exactly what
 * did and did not happen, and a caller that treats every non-zero code as
 * "no output worth reading" throws away the only record of it (filesnap D28).
 */
export type FilesnapExit = 'ok'
/** It ran and reported, but not everything happened. stdout says what. */
 | 'partial'
/** It did not run, or could not report. Nothing useful is on stdout. */
 | 'failed'
/** The arguments were wrong; nothing was attempted. */
 | 'usage'
/** It did not exit within the deadline, or the caller aborted it. */
 | 'aborted';
/**
 * One line of the contract: a schema version, a `<command>.<event>` type, and
 * the payload flattened alongside them rather than nested under a `data` key.
 */
export interface FilesnapEvent {
    /** Schema version of this line. */
    readonly v: number;
    /** `<command>.<event>`, e.g. `capture.done`. Exactly two dot-separated parts. */
    readonly type: string;
    /** Flattened payload fields; camelCase, and absent when the engine had none to report. */
    readonly [field: string]: unknown;
}
/** Everything one `filesnap` invocation reported. */
export interface FilesnapRun {
    /** What the exit code meant. */
    readonly exit: FilesnapExit;
    /** The exit code itself, or null when the process was signalled or aborted. */
    readonly code: number | null;
    /** Accepted event lines, in the order the engine emitted them. */
    readonly events: readonly FilesnapEvent[];
    /**
     * Lines refused because their `v` is not {@link SCHEMA_VERSION}, or because
     * they were not one JSON object. Non-zero means this plugin and the
     * installed `filesnap` disagree about the contract.
     */
    readonly refused: number;
    /** Prose the engine wrote for a person, trimmed. */
    readonly stderr: string;
}
/** Spawning and reading one `filesnap` invocation. */
export interface FilesnapCli {
    /**
     * Run one `filesnap` command.
     *
     * @param argv - arguments after the program name, e.g. `['log', '--session', 's1']`.
     * @param cwd - working directory for the child; the workspace the store partitions by.
     * @param signal - caller cancellation, folded together with the deadline.
     * @returns what the invocation reported, including a non-`ok` exit.
     */
    run(argv: readonly string[], cwd: string, signal?: AbortSignal, stdin?: string): Promise<FilesnapRun>;
}
/** How to reach and bound the command. */
export interface FilesnapCliOptions {
    /** Canonical executable path, already resolved in the subprocess execution world. */
    readonly executable: string;
    /** Where the store lives; omitted lets the engine use the platform data directory. */
    readonly dataDir?: string | undefined;
    /** Wall-clock bound for one invocation. */
    readonly timeoutMs: number;
    /** SIGTERM-to-SIGKILL grace when the deadline or the caller aborts the child. */
    readonly graceMs: number;
    /** In-memory cap for each collected stream. */
    readonly maxOutputBytes: number;
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
export declare function parseEvents(text: string): {
    events: FilesnapEvent[];
    refused: number;
};
/**
 * The last event of a given type, which for a terminal `.done` event is the
 * one carrying the counts and — on a restore — the id the operation can be
 * reversed to.
 *
 * @param run - a completed invocation.
 * @param type - the `<command>.<event>` type to look for.
 * @returns the last matching event, or undefined when the engine emitted none.
 */
export declare function lastEvent(run: FilesnapRun, type: string): FilesnapEvent | undefined;
/**
 * Every event of a given type, in emission order — the shape the streaming
 * per-file events take (`restore.written`, `restore.failed`, `log.entry`).
 *
 * @param run - a completed invocation.
 * @param type - the `<command>.<event>` type to collect.
 * @returns the matching events.
 */
export declare function eventsOfType(run: FilesnapRun, type: string): FilesnapEvent[];
/**
 * Read one field of an event as a number.
 *
 * @param event - the event to read, or undefined when it never arrived.
 * @param field - the payload field name.
 * @param fallback - what to report when the field is absent or not a number.
 * @returns the field's value, or `fallback`.
 */
export declare function numberField(event: FilesnapEvent | undefined, field: string, fallback: number): number;
/**
 * Read one field of an event as a string.
 *
 * @param event - the event to read, or undefined when it never arrived.
 * @param field - the payload field name.
 * @param fallback - what to report when the field is absent or not a string.
 * @returns the field's value, or `fallback`.
 */
export declare function stringField(event: FilesnapEvent | undefined, field: string, fallback: string): string;
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
export declare function createFilesnapCli(ctx: Context, options: FilesnapCliOptions): FilesnapCli;
/** FileSnap 0.5.1 reports an absent undo record as this exact usage diagnostic. */
export declare function hasNoRestore(run: FilesnapRun, session: string): boolean;
