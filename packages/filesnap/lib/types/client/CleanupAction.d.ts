import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { RewindHeaderActions } from './actions.ts';
type Props = PropsLocale<'filesnap'> & Pick<RewindHeaderActions, 'onCleanupPreview' | 'onCleanupConfirm'> & {
    onComplete?: () => void;
};
/** Explicit store-wide collection, with usage and protection boundaries visible before confirmation. */
export declare function CleanupAction({ onCleanupPreview, onCleanupConfirm, onComplete, t }: Props): import("react").JSX.Element;
export {};
