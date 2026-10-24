/** Independent authenticated UI transport; never dispatches chat commands or appends events. */
import type { Context } from '@deepseek-ai/cordis';
import type { FilesnapRewind } from './service.ts';
import type { UiReply } from './wire.ts';
export declare function uiRequest(ctx: Context, service: FilesnapRewind, endpoint: string, payload: unknown, signal: AbortSignal): Promise<UiReply>;
export declare function registerRpc(ctx: Context): void;
