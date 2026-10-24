/** Session actions and independent result panels; no command transcript output. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { RewindHeaderActions } from './actions.ts';
export type RewindHeaderProps = PropsRuntime<'conversation.session.header.actions'> & RewindHeaderActions & PropsLocale<'filesnap'>;
export declare function RewindHeader(props: RewindHeaderProps): import("react").JSX.Element;
