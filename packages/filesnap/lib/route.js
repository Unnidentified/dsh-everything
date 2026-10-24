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
import { z } from 'zod';
/** The channel the browser half calls; must match `src/client/index.ts`. */
export const UI_CHANNEL = '/filesnap';
/**
 * Mirrors `DEFAULT_MAX_REQUEST_BODY_BYTES` in the Connection adapter: sized
 * for the aggregate image limit after base64 expansion, and the per-request
 * resident bound because the bridge buffers the body. FileSnap payloads are
 * far smaller, so this is a ceiling, not a budget.
 */
const MAX_REQUEST_BODY_BYTES = 300 * 1024 * 1024;
/** Mirrors `ENDPOINT_SEGMENT_PATTERN` in the Connection adapter. */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/** Mirrors `INVALID_REQUEST_RPC_ID`: the id a response uses when the request carried none. */
const INVALID_REQUEST_RPC_ID = 'invalid-request';
/** Mirrors the Connection client-request envelope schema (`rpc-schema.ts`). */
const clientRequestSchema = z.object({
    type: z.literal('client-request'),
    rpcId: z.string(),
    method: z.string(),
    payload: z.unknown(),
});
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
export function mountUiChannel(ctx, dispatch) {
    try {
        ctx.connection.rpc.handle(UI_CHANNEL, dispatch);
        return;
    }
    catch {
        // The registration is the effect body `owner.webServer.register(route)`,
        // and the property read throws before any route exists — nothing is
        // left half-mounted by the attempt above.
    }
    const connection = ctx.connection;
    ctx.inject(['webServer'], (webCtx) => {
        // The inject above guarantees the service; `.get` keeps the type local,
        // since this package does not depend on dsh-host-webserver's declarations.
        const webServer = webCtx.get('webServer');
        const route = {
            kind: 'prefix',
            path: UI_CHANNEL,
            handler: async (req, res) => {
                const rejection = connection.requestRejection(req);
                if (rejection !== undefined) {
                    res.writeHead(rejection);
                    res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
                    return;
                }
                await bridge(req, res, channelFetch(dispatch));
            },
        };
        webCtx.effect(() => webServer.register(route), `filesnap: ${UI_CHANNEL} direct web route`);
    });
}
/** The transport-independent half of the channel; mirrors Connection's `rpcFetchHandler`. */
function channelFetch(dispatch) {
    return async (request) => {
        const endpoint = endpointFromPath(new URL(request.url).pathname);
        if (request.method !== 'POST' || endpoint === undefined) {
            return new Response('not found', { status: 404 });
        }
        const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
        if (mediaType !== 'application/json') {
            return new Response('content type must be application/json', { status: 415 });
        }
        let body;
        try {
            body = await request.json();
        }
        catch {
            return new Response('body is not JSON', { status: 400 });
        }
        const envelope = clientRequestSchema.safeParse(body);
        if (!envelope.success)
            return invalidEnvelopeResponse(body, envelope.error.issues);
        const message = envelope.data;
        if (message.method !== endpoint) {
            return errorResponse(message.rpcId, {
                code: 'gateway/bad-request',
                message: `method ${JSON.stringify(message.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
                details: { issues: [] },
            });
        }
        try {
            const result = await dispatch(endpoint, message.payload, request.signal);
            return fullResponse(message.rpcId, result);
        }
        catch (error) {
            return new Response(`handler failure: ${String(error)}`, { status: 500 });
        }
    };
}
/** Mirrors Connection's: reuse the id the sender supplied when it is a string. */
function invalidEnvelopeResponse(body, issues) {
    const rawId = body?.rpcId;
    return errorResponse(typeof rawId === 'string' ? rawId : INVALID_REQUEST_RPC_ID, {
        code: 'gateway/bad-request',
        message: 'invalid client-request message',
        details: { issues },
    });
}
function errorResponse(rpcId, error) {
    return fullResponse(rpcId, { ok: false, error });
}
/**
 * The complete server-response envelope. FileSnap replies never carry binary
 * attachments, so the framework's success branch that strips them has nothing
 * to strip here.
 */
function fullResponse(rpcId, result) {
    const body = { type: 'server-response', rpcId, result };
    return Response.json(body);
}
/** Mirrors Connection's `endpointFromPath`, reserved segments included. */
function endpointFromPath(pathname) {
    if (!pathname.startsWith(`${UI_CHANNEL}/`))
        return undefined;
    const endpoint = pathname.slice(UI_CHANNEL.length + 1);
    const segments = endpoint.split('/');
    if (segments.some(segment => segment === '' || segment === '.' || segment === '..' || !ENDPOINT_SEGMENT_PATTERN.test(segment))) {
        return undefined;
    }
    return endpoint;
}
/**
 * Bridge one node:http request to the fetch-shaped channel half. Mirrors
 * Connection's `bridge`: the body is buffered under the carrier cap before
 * dispatch, a client disconnect aborts the handler through its signal, and
 * the answer streams out chunk by chunk under backpressure.
 *
 * @param req - incoming node:http request.
 * @param res - node:http response the bridge owns to completion.
 * @param fetch - fetch-shaped channel half the request is dispatched to.
 */
async function bridge(req, res, fetch) {
    const abort = new AbortController();
    // Disconnect detection hangs off the response, not the request: since Node
    // 16 an IncomingMessage 'close' fires as soon as its body is fully consumed,
    // which would abort a streaming answer immediately after it opened.
    res.on('close', () => {
        if (!res.writableEnded)
            abort.abort();
    });
    const declaredLength = req.headers['content-length'];
    if (declaredLength !== undefined && Number(declaredLength) > MAX_REQUEST_BODY_BYTES) {
        res.writeHead(413, { connection: 'close' });
        res.end();
        req.destroy();
        return;
    }
    const chunks = [];
    let received = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        received += buffer.byteLength;
        if (received > MAX_REQUEST_BODY_BYTES) {
            res.writeHead(413, { connection: 'close' });
            res.end();
            req.destroy();
            return;
        }
        chunks.push(buffer);
    }
    const request = new Request(new URL(req.url ?? '/', 'http://dsh.internal'), {
        method: req.method ?? 'GET',
        headers: Object.fromEntries(Object.entries(req.headers).filter(([, value]) => typeof value === 'string')),
        ...chunks.length > 0 ? { body: Buffer.concat(chunks) } : {},
        signal: abort.signal,
    });
    const response = await fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (response.body === null) {
        res.end();
        return;
    }
    for await (const chunk of response.body) {
        if (abort.signal.aborted)
            continue;
        // Backpressure: a false return means the socket buffer is full — wait for
        // drain instead of buffering unboundedly. 'close' also resolves, so a
        // mid-wait disconnect cannot park this loop forever.
        if (!res.write(chunk) && !res.destroyed) {
            await new Promise((resolve) => {
                const done = () => {
                    res.off('drain', done);
                    res.off('close', done);
                    resolve();
                };
                res.once('drain', done);
                res.once('close', done);
            });
        }
    }
    res.end();
}
