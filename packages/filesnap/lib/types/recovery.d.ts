import { z } from 'zod';
import { type FilesnapCli, type FilesnapRun } from './cli.ts';
import type { RecoveryItem, RecoveryPreview } from './wire.ts';
declare const recipe: z.ZodObject<{
    session: z.ZodString;
    turn: z.ZodString;
    parent: z.ZodString;
}, z.core.$strict>;
export type RestoreRequest = {
    kind: 'rewind' | 'redo';
    source: string;
    destination: string;
    target: string;
};
export declare class RecoveryManager {
    readonly root: string;
    private readonly previews;
    constructor(dataDir?: string);
    private path;
    private read;
    exclusive<T>(cwd: string, body: (canonical: string) => Promise<T>): Promise<T>;
    assertReady(cwd: string): Promise<void>;
    redoTarget(cwd: string, session: string): Promise<z.infer<typeof recipe> | null | undefined>;
    list(): Promise<RecoveryItem[]>;
    private prepare;
    /** The caller holds exclusive and has checked all agents sharing this workspace. */
    begin(cli: FilesnapCli, cwd: string, request: RestoreRequest, signal?: AbortSignal, expected?: string): Promise<FilesnapRun>;
    private complete;
    private restore;
    private finish;
    private find;
    private inspect;
    preview(cli: FilesnapCli, id: string, mode: 'apply' | 'rollback', signal?: AbortSignal): Promise<RecoveryPreview>;
    recover(cli: FilesnapCli, token: string, idle: (cwd: string) => void, signal?: AbortSignal): Promise<RecoveryItem>;
}
export {};
