/** Plain host/client data; no session-event declarations. */
/** One place the workspace and the conversation can both be returned to. */
export interface RewindPoint {
    /** The filesnap turn id — what `restore` is addressed by. */
    readonly point: string;
    /** The harness turn this point precedes. */
    readonly turn: number;
    /**
     * The seq a fork anchors on so the conversation lands where the files land:
     * a seq **inside the last turn the fork keeps**, which is the turn before
     * this point's own.
     *
     * The host does not cut at this seq. `sessions.fork` takes the first
     * `turn/end` **at or after** the anchor and keeps that whole turn — the same
     * convention the harness's own per-message fork button uses, where a message
     * seq means "keep the turn this message belongs to". Anchoring one event
     * before this turn opened therefore keeps this turn instead of dropping it,
     * which is the one thing this field must never do.
     *
     * Absent until the point knows which message closed the previous turn.
     * A point with no anchor — the first turn of a session — has no fork to
     * offer and renders no control.
     */
    readonly boundary?: number | undefined;
    /** Epoch ms the turn opened. */
    readonly at: number;
    /**
     * What this turn's capture covered: files kept by reference, files read and
     * hashed, and files the scan saw and did not store. Absent for a point
     * recorded before this plugin reported them.
     */
    readonly coverage?: {
        readonly reused: number;
        readonly hashed: number;
        readonly dropped: number;
    } | undefined;
    /**
     * First line of the user message that opened the turn, trimmed for a list —
     * absent for a turn that entered no user message, or one whose message is
     * not text.
     *
     * `| undefined` because this value round-trips through JSON, both to the
     * browser and through the projection cache. Producers still omit the key
     * rather than writing `undefined` into it: a serialized `undefined` is a key
     * that vanishes, which is not the value that went in.
     */
    readonly label?: string | undefined;
    /**
     * Id of the assistant message that closed this turn, when one did.
     *
     * The browser's per-message action strip is addressed by message id and
     * nothing else, so this is what lets a bubble find the point that returns
     * the workspace to before its turn. Last one wins: a turn with three steps
     * carries three assistant messages, and the rewind belongs under the last.
     */
    readonly messageId?: string | undefined;
}
/** Structural turn anchors only; snapshot availability is read through RPC. */
export interface FilesnapProjection {
    readonly points: readonly RewindPoint[];
}
/** A plan computed from the target snapshot and the current workspace. */
export interface RewindPreview {
    readonly token: string;
    readonly point: string;
    readonly turn: number;
    readonly changes: readonly {
        readonly path: string;
        readonly action: 'write' | 'delete';
    }[];
}
/** The state and affected files restored by reversing the latest rewind. */
export interface RedoPreview {
    readonly token: string;
    readonly changes: RewindPreview['changes'];
    readonly returnedTo?: string | undefined;
}
export interface CleanupPreview {
    readonly token: string;
    readonly workspace: string;
    readonly recordsBytes: number;
    readonly sharedContentBytes: number;
}
export interface CleanupOutcome {
    readonly manifestsRemoved: number;
    readonly blobsRemoved: number;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionMap {
        /** Rewind points, and where the last rewind went. */
        filesnap: FilesnapProjection;
    }
}
/** Ephemeral UI response. Never persisted in a session or projection. */
export interface UiReply {
    readonly status?: FilesnapStatus | undefined;
    readonly ok: boolean;
    readonly error?: string | undefined;
    readonly errorCode?: 'no-restore' | undefined;
    readonly archived?: boolean | undefined;
    readonly points?: readonly RewindPoint[] | undefined;
    readonly preview?: RewindPreview | undefined;
    readonly redoPreview?: RedoPreview | undefined;
    readonly promptText?: string | undefined;
    readonly child?: string | undefined;
    readonly message?: string | undefined;
    readonly cleanup?: CleanupPreview | undefined;
    readonly cleaned?: CleanupOutcome | undefined;
}
export interface FilesnapStatus {
    /** The workspace the store partitions by. */
    readonly workspace: string;
    /** Every session with records in this workspace. */
    readonly sessions: readonly {
        readonly session: string;
        readonly turns: number;
        readonly earliest: string;
        readonly latest: string;
    }[];
    /** Bytes this workspace's own records occupy. */
    readonly recordsBytes: number;
    /** Bytes in the content store, shared with every other workspace. */
    readonly sharedContentBytes: number;
    /** Files the scan saw and did not store, with the engine's reason for each. */
    readonly unprotected: readonly {
        readonly path: string;
        readonly reason: string;
    }[];
}
export interface MigrationTaskInfo {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly name: string;
    readonly nameZh: string;
}
export interface MigrationPlan {
    readonly token: string;
    readonly task: string;
    readonly scanned: number;
    readonly entries: readonly {
        readonly session: string;
        readonly state: 'ready' | 'busy' | 'unsupported' | 'error';
        readonly events: number;
        readonly detail?: string | undefined;
    }[];
}
export interface MigrationReport {
    readonly task: string;
    readonly entries: readonly {
        readonly session: string;
        readonly state: 'migrated' | 'skipped' | 'error';
        readonly backup?: string | undefined;
        readonly detail?: string | undefined;
    }[];
}
export interface AutomaticMigrationStatus {
    readonly running: boolean;
    readonly started: boolean;
    readonly reports: readonly MigrationReport[];
    readonly error?: string | undefined;
}
export interface RecoveryItem {
    readonly id: string;
    readonly cwd: string;
    readonly kind: 'rewind' | 'redo';
    readonly source: string;
    readonly destination: string;
    readonly createdAt: number;
    readonly phase: 'apply' | 'rollback';
    readonly changes: RewindPreview['changes'];
}
export interface RecoveryPreview {
    readonly token: string;
    readonly id: string;
    readonly mode: 'apply' | 'rollback';
    readonly changes: RewindPreview['changes'];
    readonly conflicts: readonly string[];
}
