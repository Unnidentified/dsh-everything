import type { FilesnapProjection, RewindPoint, UiReply } from '../wire.ts';
/** React binding of the shared points store; one reader per session. */
export declare function pointReader(read: () => Promise<UiReply>): (projection: FilesnapProjection | undefined) => readonly RewindPoint[];
