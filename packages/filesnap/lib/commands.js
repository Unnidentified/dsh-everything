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
import { SessionId } from '@deepseek-ai/dsh-session';
/** What `/rewind` accepts, echoed back on a usage error. */
const REWIND_USAGE = 'Usage: /rewind [<turn>|<point id>|cleanup] [--confirm <token>] [--into <session id>] | /rewind status'
    + ' — with no argument, lists the points this session can return to.';
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
export function parseRewind(rawInput) {
    const words = rawInput.trim().split(/\s+/u).filter(word => word !== '');
    if (words.length === 0)
        return { kind: 'list' };
    const [selector, ...rest] = words;
    /* v8 ignore next -- a non-empty word list has a first word */
    if (selector === undefined)
        return { kind: 'usage' };
    // Never ambiguous with a point id: those are `<session>.t<n>`.
    if (selector === 'status')
        return rest.length === 0 ? { kind: 'status' } : { kind: 'usage' };
    if (selector.startsWith('--'))
        return { kind: 'usage' };
    const options = {};
    for (let i = 0; i < rest.length; i += 2) {
        const flag = rest[i];
        const value = rest[i + 1];
        if (value === undefined || !/^[\w.-]+$/u.test(value))
            return { kind: 'usage' };
        const key = flag === '--into' ? 'into' : flag === '--confirm' ? 'confirm' : undefined;
        if (key === undefined || options[key] !== undefined)
            return { kind: 'usage' };
        options[key] = value;
    }
    return { kind: 'rewind', selector, ...options };
}
/**
 * Render a refusal as one direct sentence.
 *
 * @param refusal - why the operation did not happen.
 * @returns the command result a UI shows.
 */
export function refusalResult(refusal) {
    switch (refusal.kind) {
        case 'untracked':
            return { kind: 'error', text: `This session has no snapshots: ${refusal.why}.` };
        case 'unknown-point':
            return { kind: 'error', text: `No rewind point named "${refusal.point}". Run /rewind to see the list.` };
        case 'agent-busy':
            return { kind: 'error', text: 'The agent is mid-turn. Stop it first, then rewind.' };
        case 'fork-failed':
            return { kind: 'error', text: `The conversation could not be forked: ${refusal.message}` };
        case 'no-restore':
            return { kind: 'success', text: 'This conversation has no rewind to reverse. It may already have been reversed. Use /redo in the branch opened by a rewind.' };
        case 'engine':
            return { kind: 'error', text: refusal.message };
        /* v8 ignore next 2 -- RewindRefusal is closed and every member is handled above */
        default:
            throw new TypeError(`unknown refusal kind: ${String(refusal)}`);
    }
}
/**
 * Render the list of points, oldest first.
 *
 * @param points - what this session can return to.
 * @returns the command result a UI shows.
 */
function listResult(points) {
    if (points.length === 0) {
        return {
            kind: 'success',
            text: 'No rewind points yet. One is taken at the start of each turn, so the first appears after this session\'s next turn.',
        };
    }
    const rows = points.map((point) => {
        const when = new Date(point.at).toISOString().replace('T', ' ').slice(0, 19);
        const label = point.label ?? '(no user message)';
        return `  ${String(point.turn).padStart(4)}  ${when}  ${label}`;
    });
    return {
        kind: 'success',
        text: [
            'Rewind points — the workspace as it stood before each turn:',
            '',
            '  turn  when                 opened by',
            ...rows,
            '',
            'Preview with /rewind <turn>, then confirm with the returned token. Confirmation forks the conversation and restores files.',
        ].join('\n'),
    };
}
/**
 * Render a completed rewind.
 *
 * A rewind with failures must not read as an uneventful success anywhere
 * (filesnap D28), so the failures are named and the safety id is offered.
 *
 * @param outcome - what the rewind did.
 * @returns the command result a UI shows.
 */
export function rewindResult(outcome) {
    const label = outcome.point.label === undefined ? '' : ` (${outcome.point.label})`;
    const lines = [
        `Rewound to turn ${String(outcome.point.turn)}${label}.`,
        `Files: ${String(outcome.written)} written, ${String(outcome.deleted)} deleted.`,
    ];
    if (outcome.failures.length > 0) {
        lines.push('', `${String(outcome.failures.length)} file(s) could not be written:`, ...outcome.failures.map(failure => `  ${failure.path} — ${failure.error}`), '', 'The rest of the rewind landed. /redo reverses all of it.');
    }
    lines.push('', `The conversation continues in ${outcome.child}.`, 'Run /redo there to reverse this rewind.');
    if (outcome.markedTitle !== undefined) {
        lines.push(`This one is now listed as "${outcome.markedTitle}", so the two are told apart.`);
    }
    if (outcome.promptText !== undefined)
        lines.push('', 'Prompt to edit and resend:', outcome.promptText);
    return { kind: 'success', text: lines.join('\n') };
}
/**
 * Render a completed redo.
 *
 * @param outcome - what the undo did.
 * @returns the command result a UI shows.
 */
export function redoResult(outcome) {
    const lines = [
        'Rewind reversed.',
        `Files: ${String(outcome.written)} written, ${String(outcome.deleted)} deleted.`,
    ];
    if (outcome.conflicts.length > 0) {
        lines.push('', `${String(outcome.conflicts.length)} path(s) had changed since the rewind and were overwritten:`, ...outcome.conflicts.map(path => `  ${path}`), '', `Those changes were captured first and are recoverable from safety point ${outcome.safety}.`);
    }
    if (outcome.failures.length > 0) {
        lines.push('', `${String(outcome.failures.length)} file(s) could not be written:`, ...outcome.failures.map(failure => `  ${failure.path} — ${failure.error}`));
    }
    if (outcome.returnedTo !== undefined) {
        lines.push('', outcome.restoredTitle === undefined
            ? `Continue in ${outcome.returnedTo} — it is not open here, so its "rewound" mark stays until it is.`
            : `Continue in "${outcome.restoredTitle}" (${outcome.returnedTo}); this one is now marked instead.`);
    }
    if (outcome.archived)
        lines.push('', 'The completed branch was archived. Its conversation and snapshots are preserved.');
    if (outcome.archiveError !== undefined)
        lines.push('', `Files were restored, but the branch could not be archived: ${outcome.archiveError}`);
    return { kind: 'success', text: lines.join('\n') };
}
/** Render a byte count the way a person reads one. */
function bytes(count) {
    if (count < 1024)
        return `${String(count)} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = count / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit] ?? 'TB'}`;
}
/**
 * Render the workspace's protection and usage picture.
 *
 * The unprotected list is the point of the command, so it is printed in full
 * rather than sampled: a bound you have to guess at is not a bound.
 *
 * @param status - what the engine reported.
 * @returns the command result a UI shows.
 */
export function statusResult(status) {
    const lines = [
        `Workspace: ${status.workspace}`,
        `Disk: ${bytes(status.recordsBytes)} of records here, ${bytes(status.sharedContentBytes)} of content shared with every workspace.`,
        '',
    ];
    if (status.sessions.length === 0) {
        lines.push('No session has captured anything in this workspace yet.');
    }
    else {
        lines.push('Sessions with snapshots here:');
        for (const session of status.sessions) {
            lines.push(`  ${session.session} — ${String(session.turns)} turn(s), ${session.earliest} … ${session.latest}`);
        }
    }
    lines.push('');
    if (status.unprotected.length === 0) {
        lines.push('Every file the scan saw is protected.');
    }
    else {
        lines.push(`${String(status.unprotected.length)} file(s) the scan saw and did NOT store — a rewind will not put these back:`);
        for (const file of status.unprotected)
            lines.push(`  ${file.reason}\t${file.path}`);
    }
    return { kind: 'success', text: lines.join('\n') };
}
/**
 * Execute one `/rewind` invocation.
 *
 * @param service - the rewind service.
 * @param invocation - the dispatching UI's invocation.
 * @returns the command result a UI shows.
 */
async function runRewind(service, invocation) {
    const command = parseRewind(invocation.rawInput);
    if (command.kind === 'usage')
        return { kind: 'error', text: REWIND_USAGE };
    if (command.kind === 'list') {
        const points = await service.points(invocation.agent, invocation.signal);
        return points.ok ? listResult(points.value) : refusalResult(points.refusal);
    }
    if (command.kind === 'status') {
        const status = await service.status(invocation.agent, invocation.signal);
        return status.ok ? statusResult(status.value) : refusalResult(status.refusal);
    }
    try {
        if (command.selector === 'cleanup') {
            if (command.into !== undefined)
                return { kind: 'error', text: 'Cleanup does not take --into.' };
            if (command.confirm === undefined) {
                const preview = await service.previewCleanup(invocation.agent, invocation.signal);
                if (!preview.ok)
                    return refusalResult(preview.refusal);
                return { kind: 'success', text: [
                        'Snapshot cleanup — unreferenced data only, across the shared store.',
                        'Retained snapshots, redo recovery data, conversations and workspace files are kept.',
                        `Workspace records: ${bytes(preview.value.recordsBytes)}. Shared content: ${bytes(preview.value.sharedContentBytes)}.`,
                        'These are current usage figures, not estimates of space that can be reclaimed.',
                        `Confirm within 5 minutes: /rewind cleanup --confirm ${preview.value.token}`,
                    ].join('\n') };
            }
            const result = await service.cleanup(invocation.agent, command.confirm, invocation.signal);
            return result.ok ? { kind: 'success', text: `Cleanup complete: ${result.value.manifestsRemoved} unreferenced manifests and ${result.value.blobsRemoved} content objects removed. Retained snapshots and redo data were kept.` } : refusalResult(result.refusal);
        }
        if (command.confirm === undefined) {
            if (command.into !== undefined)
                return { kind: 'error', text: 'Preview first with /rewind <turn>, then use its --confirm token.' };
            const preview = await service.preview(invocation.agent, command.selector, invocation.signal);
            if (!preview.ok)
                return refusalResult(preview.refusal);
            const { value } = preview;
            return { kind: 'success', text: [
                    `Rewind preview — before turn ${value.turn}.`,
                    'The original conversation will be kept; continuing creates a branch.',
                    ...value.changes.map(change => `  ${change.action === 'write' ? 'WRITE / RESTORE' : 'DELETE'}\t${JSON.stringify(change.path)}`),
                    ...(value.changes.length === 0 ? ['No tracked file changes.'] : []),
                    'Workspace files have not changed. A recovery checkpoint was saved.',
                    `Confirm within 5 minutes: /rewind ${value.point} --confirm ${value.token}`,
                    'To cancel, do not run the confirmation command. If files change, preview again.',
                ].join('\n') };
        }
        const destination = command.into === undefined
            ? { kind: 'fork' }
            : { kind: 'into', session: SessionId(command.into) };
        const outcome = await service.rewind(invocation.agent, command.selector, destination, invocation.signal, command.confirm);
        return outcome.ok ? rewindResult(outcome.value) : refusalResult(outcome.refusal);
    }
    catch (error) {
        return { kind: 'error', text: String(error) };
    }
}
/**
 * Execute one `/redo` invocation.
 *
 * @param service - the rewind service.
 * @param invocation - the dispatching UI's invocation.
 * @returns the command result a UI shows.
 */
async function runRedo(service, invocation) {
    const input = invocation.rawInput.trim();
    const match = /^--confirm ([\w-]+)$/u.exec(input);
    if (input !== '' && match === null)
        return { kind: 'error', text: 'Usage: /redo [--confirm <token>]' };
    try {
        if (input === '') {
            const result = await service.previewRedo(invocation.agent, invocation.signal);
            if (!result.ok)
                return refusalResult(result.refusal);
            return { kind: 'success', text: [
                    'Redo preview — restore the workspace to its state before the rewind.',
                    'Changes made since the rewind may be overwritten; a safety checkpoint is saved first.',
                    ...result.value.changes.map(change => `  ${change.action === 'write' ? 'WRITE / RESTORE' : 'DELETE'}\t${JSON.stringify(change.path)}`),
                    ...(result.value.changes.length === 0 ? ['No tracked file changes.'] : []),
                    ...(result.value.returnedTo ? [`Original conversation: ${result.value.returnedTo}`] : []),
                    `Confirm within 5 minutes: /redo --confirm ${result.value.token}`,
                ].join('\n') };
        }
        const outcome = await service.redo(invocation.agent, invocation.signal, match?.[1]);
        return outcome.ok ? redoResult(outcome.value) : refusalResult(outcome.refusal);
    }
    catch (error) {
        return { kind: 'error', text: String(error) };
    }
}
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
export function registerCommands(commands, service) {
    commands.register({
        name: 'rewind',
        description: 'put the workspace and the conversation back to the start of an earlier turn',
        input: { hint: '[<turn>|<point id>|cleanup] [--confirm <token>] | status' },
        handler: invocation => runRewind(service, invocation),
    });
    commands.register({
        name: 'redo',
        description: 'preview and confirm reversing the rewind that landed in this session',
        input: { hint: '[--confirm <token>]' },
        handler: invocation => runRedo(service, invocation),
    });
}
