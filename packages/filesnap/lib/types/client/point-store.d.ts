/** Request store behind the rewind points; React-free so plain Node can test it. */
import type { FilesnapProjection, RewindPoint, UiReply } from '../wire.ts';
/** One shared in-memory request per session/revision, regardless of bubble count. */
export interface PointStore {
    /** Note the projection that arrived; reads whenever it is a new revision. */
    refresh: (projection: FilesnapProjection | undefined) => void;
    /** The latest settled points; a stable reference between settles. */
    snapshot: () => readonly RewindPoint[];
    /** Change feed the React binding subscribes to. */
    subscribe: (listener: () => void) => () => void;
}
export declare function pointStore(read: () => Promise<UiReply>): PointStore;
