import type { CommandDecoration } from '@deepseek-ai/dsh-client-ui-commands/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { RedoPreview, UiReply } from '../wire.ts';
/** A bare /redo selects a prepared restore; applying it belongs to the dialog. */
export declare function redoMenu(read: (session: SessionId) => Promise<UiReply>, open: (session: SessionId, preview: RedoPreview) => void, label: () => string, emptyLabel?: () => string): CommandDecoration;
export declare function redoSelection(): {
    subscribe: (listener: () => void) => () => void;
    snapshot: () => {
        preview: RedoPreview;
        sequence: number;
    } | null;
    open: (preview: RedoPreview) => void;
    close: () => void;
};
