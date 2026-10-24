import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { RecoveryItem, RecoveryPreview } from '../wire.ts';
import { type MigrationActions } from './MigrationPanel.tsx';
export interface RecoveryActions {
    listRecovery: () => Promise<RecoveryItem[]>;
    previewRecovery: (id: string, mode: 'apply' | 'rollback') => Promise<RecoveryPreview>;
    applyRecovery: (token: string) => Promise<{
        openSession: string;
    }>;
    openSession: (id: string) => void;
}
export declare function FileSnapSettings(props: RecoveryActions & MigrationActions & PropsLocale<'filesnap'>): import("react").JSX.Element;
/** Recovery stays outside the conversation, including when the source session is cold. */
export declare function RecoveryPanel({ listRecovery, previewRecovery, applyRecovery, openSession, t }: RecoveryActions & PropsLocale<'filesnap'>): import("react").JSX.Element;
