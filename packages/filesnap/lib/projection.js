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
import { z } from 'zod';
import { capturedPoints, initialPoints, reducePoints } from "./points.js";
/** One point, as it crosses the wire and as it is persisted. */
const pointSchema = z.object({
    point: z.string(),
    turn: z.number().int().nonnegative(),
    boundary: z.number().int().optional(),
    at: z.number().int(),
    label: z.string().optional(),
    messageId: z.string().optional(),
    coverage: z.object({
        reused: z.number().int().nonnegative(),
        hashed: z.number().int().nonnegative(),
        dropped: z.number().int().nonnegative(),
    }).optional(),
});
/**
 * The persisted fold state. `openTurn` is nullable rather than optional
 * because the cache round-trips through JSON, where `undefined` does not
 * survive and a key that vanishes is not the same value that went in.
 */
const stateSchema = z.object({
    points: z.array(pointSchema),
    openTurn: z.number().int().nonnegative().nullable(),
    lastMessage: z.object({
        turn: z.number().int().nonnegative(),
        id: z.string(),
        seq: z.number().int(),
    }).nullable(),
});
/** The client view. */
const viewSchema = z.object({
    points: z.array(pointSchema),
});
/**
 * Bump when the serialized fields or the fold's meaning change, so persisted
 * rows from an older unit are discarded rather than forward-applied into
 * something that no longer means what it says.
 */
const STATE_VERSION = 6;
/**
 * Register the `filesnap` projection when the deployment composes a registry.
 *
 * @param ctx - the plugin's context.
 */
export function registerProjection(ctx) {
    ctx.inject(['sessionProjections'], (projectionCtx) => {
        projectionCtx.sessionProjections.register({
            key: 'filesnap',
            stateSchema,
            init: initialPoints,
            apply: reducePoints,
            wire: {
                viewSchema,
                // Structural anchors only; the RPC joins these to available snapshots.
                view: state => ({
                    points: capturedPoints(state),
                }),
            },
            stateVersion: STATE_VERSION,
        });
    });
}
