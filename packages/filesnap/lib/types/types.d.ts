/** Outcomes returned directly to the caller. No custom session events. */
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { RewindPoint } from './wire.ts';
export type { FilesnapProjection, RewindPoint } from './wire.ts';
/** What a completed rewind did. */
export interface RewindOutcome {
    /** Complete plain-text prompt offered back to the child composer. */
    readonly promptText?: string;
    /** The point the workspace was returned to. */
    readonly point: RewindPoint;
    /** The session the conversation continues in. */
    readonly child: SessionId;
    /** Files written. */
    readonly written: number;
    /** Files removed. */
    readonly deleted: number;
    /** Files that could not be written, with the engine's reason for each. */
    readonly failures: readonly {
        readonly path: string;
        readonly error: string;
    }[];
    /** Manifest id of the safety checkpoint the rewind can itself be reversed to. */
    readonly safety: string;
    /**
     * The marked title the conversation being left now carries. Absent when it
     * could not be retitled — it is not live, or the deployment composes no
     * title service.
     */
    readonly markedTitle?: string;
}
/**
 * What the store holds for one workspace, and what it does not protect.
 *
 * The unprotected list is the answer to "which files in my project would a
 * rewind not put back, and why" — the question a bound you cannot see always
 * raises. It is complete rather than sampled, because it is asked deliberately
 * rather than printed every turn.
 */
export type { FilesnapStatus } from './wire.ts';
/** What a completed redo did. */
export interface RedoOutcome {
    /** Whether the completed branch was archived through the host's public API. */
    readonly archived?: boolean;
    /** Archiving can fail independently of an already completed file restore. */
    readonly archiveError?: string;
    /** Files written. */
    readonly written: number;
    /** Files removed. */
    readonly deleted: number;
    /** Files that could not be written, with the engine's reason for each. */
    readonly failures: readonly {
        readonly path: string;
        readonly error: string;
    }[];
    /** Manifest id of the safety checkpoint the undo can itself be reversed to. */
    readonly safety: string;
    /** Paths that moved between the rewind and this undo. */
    readonly conflicts: readonly string[];
    /** The conversation this redo hands back to, when this session was forked from one. */
    readonly returnedTo?: SessionId;
    /**
     * That conversation's title with the rewound mark removed. Absent when it
     * could not be retitled — most often because it is not open, so its mark
     * stays until it is.
     */
    readonly restoredTitle?: string;
}
/**
 * Why an operation could not happen. Returned rather than thrown: every caller
 * — the command handler, the client half — has to render the reason, and an
 * exception would make each of them re-derive it from a message string.
 */
export type RewindRefusal = {
    readonly kind: 'untracked';
    readonly why: string;
}
/** No point with that id is in this session's log. */
 | {
    readonly kind: 'unknown-point';
    readonly point: string;
}
/** The agent is mid-turn; a rewind would race the work it is doing. */
 | {
    readonly kind: 'agent-busy';
}
/** The conversation could not be forked at that boundary. */
 | {
    readonly kind: 'fork-failed';
    readonly message: string;
}
/** No restore is available in this session, including after a completed redo. */
 | {
    readonly kind: 'no-restore';
}
/** The engine refused or could not run. */
 | {
    readonly kind: 'engine';
    readonly message: string;
};
/** An operation's result, or the reason it did not happen. */
export type RewindResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly refusal: RewindRefusal;
};
