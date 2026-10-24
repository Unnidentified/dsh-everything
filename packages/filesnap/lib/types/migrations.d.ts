/** Versioned maintenance tasks share one scanner, confirmation and backup workflow. */
import type { Context } from '@deepseek-ai/cordis';
import { repairArtifact } from './migrate-session-logs.ts';
import type { MigrationPlan, MigrationReport, MigrationTaskInfo, AutomaticMigrationStatus } from './wire.ts';
export interface MigrationTask extends MigrationTaskInfo {
    /** Pure, idempotent format transformation. Zero changes means already compatible. */
    transform: typeof repairArtifact;
    /** Stored header versions the transformation repairs; artifacts of other generations are left alone. */
    supports: readonly number[];
}
/** Add future migrations here; never change the identity/meaning of a released task. */
export declare const MIGRATIONS: readonly MigrationTask[];
export declare class MigrationManager {
    private readonly ctx;
    private readonly tasks;
    private readonly busy;
    private plan;
    private executing;
    private automatic;
    automaticStatus(): AutomaticMigrationStatus;
    runAutomatic(signal?: AbortSignal): Promise<void>;
    constructor(ctx: Context, tasks?: readonly MigrationTask[]);
    catalogue(): MigrationTaskInfo[];
    scan(taskId: string, signal?: AbortSignal, automatic?: boolean): Promise<MigrationPlan>;
    execute(token: string, signal?: AbortSignal, automatic?: boolean): Promise<MigrationReport>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        filesnapMigrations: MigrationManager;
    }
}
/** Run upgrade tasks on host load, when persistence and live ownership are known. */
export declare function registerMigrations(ctx: Context, automatic?: boolean): void;
