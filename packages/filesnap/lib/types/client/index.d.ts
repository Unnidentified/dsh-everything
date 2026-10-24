/** Browser controls use authenticated Connection RPC; only native turn anchors use a projection. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type RewindKey } from './locales.ts';
export { RewindAction } from './RewindAction.tsx';
export { RewindHeader } from './RewindHeader.tsx';
export type { RewindActionResult, RewindActions, RewindHeaderActions } from './actions.ts';
export type { RewindKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The rewind controls' copy. */
        filesnap: RewindKey;
    }
}
/** Required services: the slot system, session control, and copy. */
export declare const inject: string[];
/**
 * Client plugin body: the per-turn rewind control and the session-level strip.
 *
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
