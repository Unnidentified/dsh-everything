/**
 * The rewind points, as a projection the browser can read.
 *
 * A client never sees raw session events, and it should not re-derive this
 * list from a transcript it renders for other reasons. The projection seam is
 * the sanctioned route: a pure fold the framework drives over committed
 * events, whose whole current value is served to whoever subscribes.
 *
 * The fold itself is {@link reducePoints}, shared verbatim with the host's own
 * reader — this module is the registration and the schemas, not a second
 * implementation.
 *
 * **Optional.** `sessionProjections` is registered through `ctx.inject`, so a
 * headless assembly with no projection registry is unaffected and the plugin
 * still works through its commands.
 *
 * @module
 */
import type { Context } from '@deepseek-ai/cordis';
import type { PointsState } from './points.ts';
export type { FilesnapProjection } from './wire.ts';
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        /**
         * The reader state behind the `filesnap` client view. Host-only: the
         * client-visible half of the pair is merged in `wire.ts`, which a browser
         * program can import without dragging the host's `Context` merges in
         * behind it.
         */
        filesnap: PointsState;
    }
}
/**
 * Register the `filesnap` projection when the deployment composes a registry.
 *
 * @param ctx - the plugin's context.
 */
export declare function registerProjection(ctx: Context): void;
