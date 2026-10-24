import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { RewindActions } from './actions.ts';
import type { rewindSelection } from './rewind-menu.ts';
export interface CommandRewindActions {
    selection: ReturnType<typeof rewindSelection>;
    onPreview: RewindActions['onPreview'];
    onRewind: RewindActions['onRewind'];
}
/** The menu chooses a target; this independent dialog owns file confirmation. */
export declare function CommandRewindPreview({ selection, onPreview, onRewind, t }: CommandRewindActions & PropsLocale<'filesnap'>): import("react").JSX.Element | null;
