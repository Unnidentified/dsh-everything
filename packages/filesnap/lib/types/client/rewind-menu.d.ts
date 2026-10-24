import type { CommandDecoration } from '@deepseek-ai/dsh-client-ui-commands/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { RewindPoint, UiReply } from '../wire.ts';
/** Decorate only bare /rewind; the host continues to own argued commands. */
export declare function rewindMenu(read: (sessionId: SessionId) => Promise<UiReply>, open: (sessionId: SessionId, point: RewindPoint) => void, turnLabel: (turn: number) => string): CommandDecoration;
/** Session-scoped transient selection; never stored in conversation history. */
export declare function rewindSelection(): {
    subscribe: (listener: () => void) => () => void;
    snapshot: () => {
        point: RewindPoint;
        sequence: number;
    } | null;
    open: (point: RewindPoint) => void;
    close: () => void;
};
