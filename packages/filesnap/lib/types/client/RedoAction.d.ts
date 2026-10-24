import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { RewindHeaderActions } from './actions.ts';
export declare function RedoAction({ redoSelection: selection, onRedoPreview, onRedoConfirm, onOpenSession, t }: Pick<RewindHeaderActions, 'redoSelection' | 'onRedoPreview' | 'onRedoConfirm' | 'onOpenSession'> & PropsLocale<'filesnap'>): import("react").JSX.Element;
