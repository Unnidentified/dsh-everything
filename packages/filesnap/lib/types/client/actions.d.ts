import type { RewindPoint, FilesnapProjection } from '../wire.ts';
export type RewindActionResult = import('../wire.ts').UiReply;
/** Injected business face of the per-message rewind control. */
export interface RewindActions {
    usePoints: (projection: FilesnapProjection | undefined) => readonly RewindPoint[];
    onPreview: (point: RewindPoint) => Promise<RewindActionResult>;
    /**
     * Rewind to one point: fork the conversation, put the files back into the
     * fork, and open it.
     * @param point - the point under the message that was clicked.
     * @returns whether the rewind completed.
     */
    onRewind: (point: RewindPoint, token: string) => Promise<RewindActionResult>;
}
/** Injected business face of the session-level header strip. */
export interface RewindHeaderActions {
    onOpenSession: (id: string) => void;
    onCleanupPreview: () => Promise<RewindActionResult>;
    onCleanupConfirm: (token: string) => Promise<RewindActionResult>;
    /**
     * Reverse the rewind that landed in this session.
     * @returns whether the undo completed.
     */
    redoSelection: ReturnType<typeof import('./redo-menu.ts').redoSelection>;
    onRedoPreview: () => Promise<RewindActionResult>;
    onRedoConfirm: (token: string) => Promise<RewindActionResult>;
    /**
     * Ask the engine what it holds and what it does not protect. The answer
     * is shown in the independent snapshot panel.
     * @returns whether the query ran.
     */
    onStatus: () => Promise<RewindActionResult>;
}
