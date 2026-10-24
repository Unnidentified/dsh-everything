/** Fold native conversation events into turn anchors. Snapshot availability is joined from the engine by the service. */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { RewindPoint } from './wire.ts';
export interface PointsState {
    readonly points: readonly RewindPoint[];
    readonly openTurn: number | null;
    readonly lastMessage: {
        readonly turn: number;
        readonly id: string;
        readonly seq: number;
    } | null;
}
export declare function initialPoints(): PointsState;
export declare function reducePoints(state: PointsState, event: SessionEvent): PointsState;
export declare function foldPoints(events: readonly SessionEvent[]): RewindPoint[];
export declare function capturedPoints(state: PointsState): RewindPoint[];
export declare function selectPoint(points: readonly RewindPoint[], input: string): RewindPoint | undefined;
