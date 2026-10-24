/**
 * The FileSnap UI channel, mounted wherever the harness lets it be.
 *
 * `connection.rpc.handle` mounts a channel from the context that owns the
 * Connection service. In the harness build the Desktop app ships
 * (0.2.0-rc.2), that service is constructed under a context that injects only
 * `credentials` — `webServer` is reached through a nested child context — so
 * the registration's effect throws `cannot get property "webServer" without
 * inject`, no route is ever added, and every browser POST on the prefix falls
 * through to the app host's 405.
 *
 * This module mounts the same prefix route from this plugin's own webServer
 * child context instead. The official registration is tried first, so a
 * harness that carries its own fix keeps owning the channel; only a throw
 * reaches the direct route. Admission, envelope validation, the buffered-body
 * cap, and the response envelopes mirror the Connection adapter, so the
 * channel behaves identically whichever path mounted it.
 *
 * @module dsh-filesnap/route
 */
import type { Context } from '@deepseek-ai/cordis';
/** The channel the browser half calls; must match `src/client/index.ts`. */
export declare const UI_CHANNEL = "/filesnap";
/**
 * One decoded channel call. Values are endpoint-owned wire payloads, so the
 * shared signature keeps the value open — the contract `ConnectionRpcHandler`
 * has, without importing a runtime type for it.
 */
export type UiDispatch = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<{
    readonly ok: true;
    readonly value: unknown;
}>;
/**
 * Mount the FileSnap channel on the host's web server.
 *
 * The official registration is tried first, so a harness whose `connection`
 * service can see `webServer` keeps owning the channel. Harness builds since
 * 0.2.0-rc.2 throw `cannot get property "webServer" without inject` from
 * inside that registration and mount nothing; the direct route below is
 * mounted in that case, from this plugin's own webServer child context.
 *
 * @param ctx - the plugin's `connection`-injecting context.
 * @param dispatch - decoded endpoint handler shared by both mounting paths.
 */
export declare function mountUiChannel(ctx: Context, dispatch: UiDispatch): void;
