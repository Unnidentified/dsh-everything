import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { RewindHeaderActions } from './actions.ts';
type Props = PropsLocale<'filesnap'> & Pick<RewindHeaderActions, 'onStatus' | 'onCleanupPreview' | 'onCleanupConfirm'>;
export declare function formatBytes(value: number): string;
/** Workspace storage UI. All data is transient and fetched outside the conversation. */
export declare function SnapshotPanel({ onStatus, onCleanupPreview, onCleanupConfirm, t }: Props): import("react").JSX.Element;
export {};
