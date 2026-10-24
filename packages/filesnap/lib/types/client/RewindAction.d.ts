/**
 * The rewind control, one per turn, in the assistant message's own icon row.
 *
 * A message with no point renders nothing. Only the assistant message that
 * closed a turn carries one, so the control appears once per turn — under the
 * last bubble of that turn, which is where "undo this" belongs.
 *
 * @module
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { RewindPoint } from '../wire.ts';
import type { RewindActions } from './actions.ts';
/** Full props: the owner's message identity, the injected verb, and the locale seat. */
export type RewindActionProps = PropsRuntime<'conversation.chat.assistant-actions'> & RewindActions & PropsLocale<'filesnap'>;
/**
 * One message's rewind control.
 *
 * @param props - the message identity, the rewind verb, the projection seat, and the locale seat.
 * @returns the icon button, or nothing when this message closes no captured turn.
 */
export declare function RewindAction({ messageId, onPreview, onRewind, usePoints, useProjection, t }: RewindActionProps): import("react").JSX.Element | null;
/** Shared preview/confirmation flow for message buttons and the slash menu. */
export declare function RewindControl({ point, onPreview, onRewind, t, autoOpen, onClose }: {
    point: RewindPoint;
    onPreview: RewindActions['onPreview'];
    onRewind: RewindActions['onRewind'];
    t: RewindActionProps['t'];
    autoOpen?: boolean;
    onClose?: () => void;
}): import("react").JSX.Element;
