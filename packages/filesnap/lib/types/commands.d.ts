/**
 * `/rewind` and `/redo` — the human surface.
 *
 * They dispatch without a model turn, which is the point: rewinding is
 * something the user does *to* the conversation, and routing it through the
 * model would put the decision in the hands of the thing being rewound.
 *
 * `/rewind` with no argument lists rather than acts. filesnap addresses a
 * restore by turn id and refuses relative addressing (filesnap D35) because the
 * cost of landing on the wrong point is the user's files; the list is what
 * makes that usable, since whoever counts is counting against something they
 * are looking at.
 *
 * @module
 */
import type { CommandRuntime, CommandResult } from '@deepseek-ai/dsh-commands';
import type { FilesnapRewind } from './service.ts';
import type { FilesnapStatus, RedoOutcome, RewindOutcome, RewindRefusal } from './types.ts';
/** One parsed `/rewind` invocation. */
export type RewindCommand = {
    readonly kind: 'list';
}
/** Ask the engine what it holds and what it does not protect. */
 | {
    readonly kind: 'status';
}
/** Rewind, forking the conversation here or filing into a caller's fork. */
 | {
    readonly kind: 'rewind';
    readonly selector: string;
    readonly into?: string;
    readonly confirm?: string;
}
/** The words do not form a `/rewind`. */
 | {
    readonly kind: 'usage';
};
/**
 * Parse only the grammar `/rewind` owns.
 *
 * `--into` exists for a caller that has already forked the conversation
 * through the deployment's own fork — the web client's, which also attaches
 * the child to its workspace. Without it, that caller's only route would be to
 * have this plugin build a second fork beside the correct one.
 *
 * @param rawInput - everything after the command name.
 * @returns what the user asked for.
 */
export declare function parseRewind(rawInput: string): RewindCommand;
/**
 * Render a refusal as one direct sentence.
 *
 * @param refusal - why the operation did not happen.
 * @returns the command result a UI shows.
 */
export declare function refusalResult(refusal: RewindRefusal): CommandResult;
/**
 * Render a completed rewind.
 *
 * A rewind with failures must not read as an uneventful success anywhere
 * (filesnap D28), so the failures are named and the safety id is offered.
 *
 * @param outcome - what the rewind did.
 * @returns the command result a UI shows.
 */
export declare function rewindResult(outcome: RewindOutcome): CommandResult;
/**
 * Render a completed redo.
 *
 * @param outcome - what the undo did.
 * @returns the command result a UI shows.
 */
export declare function redoResult(outcome: RedoOutcome): CommandResult;
/**
 * Render the workspace's protection and usage picture.
 *
 * The unprotected list is the point of the command, so it is printed in full
 * rather than sampled: a bound you have to guess at is not a bound.
 *
 * @param status - what the engine reported.
 * @returns the command result a UI shows.
 */
export declare function statusResult(status: FilesnapStatus): CommandResult;
/**
 * Register both commands on a resolved command registry.
 *
 * **The registry is passed in, not read off the context.** Cordis refuses a
 * property read for a service the plugin has not declared in `inject`, and
 * declaring `commands` would hold this plugin PENDING in a headless assembly
 * that mounts none. The caller resolves it through `ctx.get`, which is allowed
 * and still returns a traced service, so these registrations remain effects of
 * the calling fiber and unwind with it.
 *
 * @param commands - the resolved command registry.
 * @param service - the rewind service the handlers call.
 */
export declare function registerCommands(commands: CommandRuntime, service: FilesnapRewind): void;
