/** Carry a rewound session's children into the branch its fork created.
 *
 * A fork keeps the rewound session's history as an inherited prefix, but the
 * branching session's subagent catalog only counts children established in
 * the branch's own suffix: facts from the inherited prefix are filtered out,
 * so the subagent panel of a fresh branch comes up empty even though the
 * turns the branch kept plainly spawned children — and there is no way to
 * continue them, because a continuation is authorized against the child's
 * durable parent, which is the pre-rewind session.
 *
 * This module walks the branch's inherited prefix, resolves every child it
 * names, and re-establishes each one under the branch as a clone: a fresh
 * session whose header keeps the child's identity fields but points at the
 * branch, and whose log copies the child's stored log — as it stood at the
 * fork point — as an inherited prefix. That prefix is closed exactly the way
 * the harness closes its own seeded children — a seeded header, an
 * inherited-cut marker at the boundary, then the child's descriptor
 * re-anchored inside the clone's own suffix — so the clone's descriptor,
 * catalog, and continuation folds all start where its inherited history
 * ends, not at the copied log's start. The clone is what the branch can then
 * show and continue.
 *
 * The carry reproduces the fork point at every depth, so the branch shows
 * the family the rewound session had at the cut and no more: a child's log
 * is truncated to the events at or before the moment of the cut — the
 * branch's last inherited event — and descendants are discovered and
 * carried from inside that kept history only. A grandchild established
 * after the cut stays out, because the fact that names it lies beyond the
 * kept log, and a grandchild established before it is truncated by the same
 * cut time, recursively. Redoing the rewind needs no carry at all: the
 * pre-rewind session, and every child under it, was never touched.
 *
 * Two runtime generations are spanned, because this plugin's supported
 * harness range is:
 *
 * - The 0.1.2 generation has no `subagent/catalog` vocabulary. Children are
 *   discovered by scanning stored headers for `origin: 'subagent'` sessions
 *   of the rewound session, and the carry writes the clones only — a fact
 *   appended to one of its logs would make the session unreadable to its own
 *   generation, so catalog writes are gated on the runtime vocabulary
 *   ({@link CarrySubagentsOptions.vocabulary}).
 * - The 0.2.0 generation writes catalog facts. A fact in the prefix names
 *   its child directly and keeps working after rewinds of rewinds — where
 *   the child's `parentSession` is an earlier session, not the one being
 *   rewound, which no header scan can infer — so facts are preferred. Each
 *   clone (and each descendant clone, recursively) receives a fresh fact
 *   under its new parent.
 *
 * Clones are written through whichever persistence generation the deployment
 * composes: the 0.2.0 handle API when `open` is present, the 0.1.2
 * `create`/`append` API otherwise. No failure here ever fails the rewind it
 * is attached to: a child that cannot be read, cloned, or named is warned
 * about, and the remaining children are carried.
 *
 * @module dsh-filesnap/subagents
 */
import type { Session, SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
/**
 * The slice of a per-session handle this module uses.
 *
 * The 0.2.0 backend hands out one handle per access mode; only the members
 * that mode needs exist at runtime, so they are all optional here and every
 * call site checks before calling.
 */
export interface SubagentCarryHandle {
    /** The open session's stored header, on handles that expose it. */
    readonly header?: SessionHeader;
    /** The open session's inherited prefix length; both access modes expose it. */
    readonly inheritedEventCount?: number;
    /** Read a slice of the logical log; called once for the whole range. */
    read?(offset: number, length: number, options?: {
        readonly signal?: AbortSignal;
    }): Promise<{
        readonly events: readonly SessionEvent[];
    }>;
    /** Append one contiguous batch. */
    append?(events: readonly SessionEvent[], options?: {
        readonly signal?: AbortSignal;
    }): Promise<void>;
    /** Durability barrier for appended events. */
    flush?(options?: {
        readonly signal?: AbortSignal;
    }): Promise<void>;
    /** Release the handle, and its write lease when it holds one. */
    close(): Promise<void>;
}
/**
 * The structural persistence seam the carry uses, spanning both backend
 * generations this plugin supports. An instance of either is passed after a
 * cast; nothing beyond these members is touched.
 *
 * - {@link stat}, {@link open} and the handle API exist only on the 0.2.0
 *   generation, which this module detects through `typeof open`.
 * - {@link inspect} and {@link list} in its raw-header form are the 0.1.2
 *   generation's cold-read and listing surface.
 * - {@link locate} exists wherever the backend keeps a raw artifact per
 *   session, which both JSONL generations do.
 * - {@link create} exists in both with different signatures: 0.2.0's takes
 *   `{ inheritedEventCount }` and returns the owned write handle, while
 *   0.1.2's takes the cut positionally, returns nothing, and materializes
 *   through {@link append}. The 0.1.2 shape is reached by one cast where it
 *   is used.
 */
export interface SubagentCarryStore {
    /** 0.2.0: one stored header without reading its log. */
    readonly stat?: (id: SessionId, options?: {
        readonly signal?: AbortSignal;
    }) => Promise<{
        readonly header: SessionHeader;
    } | undefined>;
    /** Both: stored sessions, header-first (0.1.2 yields raw headers, 0.2.0 snapshots). */
    readonly list?: (signal?: AbortSignal | {
        readonly signal?: AbortSignal;
    }) => Promise<readonly unknown[]>;
    /** Both, where the backend keeps one raw artifact per session: the file a stored header addresses. */
    readonly locate?: (header: SessionHeader) => {
        readonly kind: string;
        readonly path: string;
    } | undefined;
    /** 0.1.2: validated header plus the whole log. */
    readonly inspect?: (id: SessionId, signal?: AbortSignal) => Promise<{
        readonly meta: SessionHeader;
        readonly events: readonly SessionEvent[];
        readonly inheritedEventCount: number;
    }>;
    /** 0.2.0: open one session for `read` or `write`. */
    readonly open?: (id: SessionId, access: 'read' | 'write', options?: {
        readonly signal?: AbortSignal;
    }) => Promise<SubagentCarryHandle>;
    /** 0.2.0's create shape; see the interface note for the 0.1.2 divergence. */
    readonly create?: (header: SessionHeader, options?: {
        readonly signal?: AbortSignal;
        readonly inheritedEventCount?: number;
    }) => Promise<SubagentCarryHandle>;
    /** 0.1.2: append onto a session created through `create`. */
    readonly append?: (id: SessionId, events: readonly SessionEvent[]) => Promise<void>;
}
/** Everything one carry needs: the branch, its source, storage, and the runtime vocabulary. */
export interface CarrySubagentsOptions {
    /** The live session the rewind landed in; its inherited prefix names the children. */
    readonly branch: Session;
    /** The session the rewind left; the header-scan fallback looks for its children. */
    readonly source: Session;
    /** The persistence backend, or `undefined` when the deployment mounts none. */
    readonly store: SubagentCarryStore | undefined;
    /** The runtime's session-event vocabulary; catalog writes are gated on it. */
    readonly vocabulary: ReadonlySet<string>;
    /** Report one child's failure. The carry continues, and the rewind is unaffected. */
    readonly warn: (message: string) => void;
    /** Caller cancellation, observed between children. */
    readonly signal?: AbortSignal;
}
/**
 * Re-establish a rewound session's children under the branch it forked into.
 *
 * The branch's inherited prefix is the discovery source: every
 * `subagent/catalog` fact below the fork cut names a child that existed
 * before it. A prefix with no facts — a log written before the catalog
 * existed — falls back to stored `origin: 'subagent'` children of the
 * rewound session created no later than the last inherited event. Every
 * child — and every descendant carried under it, recursively — is
 * re-established in the state it had at the fork point, its log truncated
 * to events at or before the branch's last inherited event. Facts whose
 * session is gone, and clones whose write fails, are warned about and
 * skipped; everything else is carried.
 *
 * @param options - the branch, its source, storage, vocabulary and warnings.
 * @returns the number of children cloned into the branch.
 */
export declare function carrySubagents(options: CarrySubagentsOptions): Promise<number>;
/** One stored session as a listing reports it: its header, plus the backend's stored-format verdict when stated. */
export interface StoredSessionListing {
    readonly header: SessionHeader;
    /** `'current'` when the backend already reads the artifact, `'migration-required'` when it lags; 0.1.2 states nothing. */
    readonly formatStatus?: string;
}
/** Every stored session through either generation's listing call. */
export declare function listStoredSessions(store: SubagentCarryStore, signal?: AbortSignal): Promise<readonly StoredSessionListing[]>;
/** Read one stored session's header, verbatim log and inherited cut back through either generation. */
export declare function readStoredLog(store: SubagentCarryStore, id: SessionId, signal: AbortSignal | undefined): Promise<{
    readonly header: SessionHeader;
    readonly events: readonly SessionEvent[];
    readonly inheritedEventCount: number;
}>;
