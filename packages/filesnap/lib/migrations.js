import { createHash, randomUUID } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { SessionId } from '@deepseek-ai/dsh-session';
import { migrateFile, repairArtifact, migrateStatusTitles } from "./migrate-session-logs.js";
import { listStoredSessions } from "./subagents.js";
/** Add future migrations here; never change the identity/meaning of a released task. */
export const MIGRATIONS = [{
        id: 'legacy-session-events-v1', from: '0.2.x / early preview', to: '0.3.0+',
        name: 'Legacy session compatibility', nameZh: '旧版会话兼容迁移',
        transform: repairArtifact, supports: [0],
    }, {
        id: 'branch-status-titles-v1', from: 'legacy ↩ titles', to: 'Active / Inactive',
        name: 'Branch status title markers', nameZh: '红绿灯分支标记迁移',
        transform: migrateStatusTitles, supports: [0],
    }];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** One stored artifact by its generation filename: `session.jsonl[.zstd]` or `session.v<N>.jsonl[.zstd]`. */
const ARTIFACT_NAME = /^session(?:\.v(\d+))?\.jsonl(?:\.zstd)?$/u;
/** The stored generation one artifact filename declares; a versionless name is the original v0. */
function nameVersion(name) {
    const match = ARTIFACT_NAME.exec(name);
    return match?.[1] === undefined ? 0 : Number(match[1]);
}
/** The format version one artifact's header frame declares, or `undefined` when it cannot be read. */
function storedVersion(bytes, compressed) {
    try {
        // DSH writes the header as the artifact's first zstd frame; one-shot
        // decoding reads that frame alone, leaving the appended body behind.
        const text = compressed ? zstdDecompressSync(bytes).toString('utf8') : bytes.toString('utf8');
        const header = JSON.parse(text.split('\n', 1)[0] ?? '');
        return header.type === 'session' && typeof header.version === 'number' ? header.version : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * The artifact one located session directory actually stores in a generation
 * this task repairs.
 *
 * `locate` names the current generation's path whether or not it exists —
 * it is a diagnostics hook, not a resolver — so an absent target falls back
 * to the directory's stored artifacts, newest generation first. A directory
 * only holding generations the task does not repair answers `undefined`:
 * there is nothing to do, not something to report.
 *
 * @param target - the located current-generation path.
 * @param supports - stored header versions the task repairs.
 * @returns the readable in-scope artifact, or the last read failure when none was readable.
 */
async function artifactFor(target, supports) {
    let candidates = [target];
    try {
        await access(target);
    }
    catch {
        try {
            const dir = dirname(target);
            candidates = (await readdir(dir))
                .filter(name => ARTIFACT_NAME.test(name))
                .sort((left, right) => nameVersion(right) - nameVersion(left))
                .map(name => join(dir, name));
        }
        catch {
            candidates = [];
        }
    }
    let failure;
    for (const path of candidates) {
        let bytes;
        try {
            bytes = await readFile(path);
        }
        catch (error) {
            failure = String(error);
            continue;
        }
        if (supports.includes(storedVersion(bytes, path.endsWith('.zstd')) ?? -1))
            return { path, bytes };
    }
    return failure === undefined ? undefined : { error: failure };
}
export class MigrationManager {
    ctx;
    tasks;
    busy = new Set();
    plan;
    executing = false;
    automatic = { running: false, started: false, reports: [] };
    automaticStatus() { return this.automatic; }
    async runAutomatic(signal) {
        if (this.automatic.running || this.executing)
            return;
        this.automatic = { running: true, started: true, reports: [] };
        try {
            for (const task of this.tasks) {
                signal?.throwIfAborted();
                const plan = await this.scan(task.id, signal, true);
                const report = await this.execute(plan.token, signal, true);
                const skipped = plan.entries.filter(row => row.state !== 'ready').map(row => ({
                    session: row.session, state: row.state === 'error' ? 'error' : 'skipped',
                    detail: row.detail ?? 'The conversation is loaded; retry after closing it or on the next launch.',
                }));
                this.automatic = { ...this.automatic, reports: [...this.automatic.reports, { ...report, entries: [...report.entries, ...skipped] }] };
            }
        }
        catch (error) {
            this.automatic = { ...this.automatic, error: String(error) };
        }
        finally {
            this.automatic = { ...this.automatic, running: false };
        }
    }
    constructor(ctx, tasks = MIGRATIONS) {
        this.ctx = ctx;
        this.tasks = tasks;
        // A synchronous publication veto fences cold resumes while replacing an artifact.
        // Existing live owners are refused below, before any filesystem mutation.
        ctx.on('session/created', session => {
            if (this.busy.has(session.id))
                throw new Error('FileSnap is migrating this conversation. Try opening it again after migration finishes.');
        });
    }
    catalogue() {
        return this.tasks.map(({ transform: _transform, supports: _supports, ...info }) => info);
    }
    async scan(taskId, signal, automatic = false) {
        if (this.automatic.running && !automatic)
            throw new Error('Automatic migration is running. Wait for it to finish.');
        if (this.executing)
            throw new Error('A migration is already running.');
        this.plan = undefined;
        const task = this.tasks.find(item => item.id === taskId);
        if (task === undefined)
            throw new Error('Unknown migration task.');
        const persistence = this.ctx.get('sessionPersistence');
        if (persistence === undefined)
            throw new Error('Session persistence is not available.');
        const store = persistence;
        const listings = await listStoredSessions(store, signal);
        const entries = [];
        const files = [];
        for (const { header, formatStatus } of listings) {
            signal?.throwIfAborted();
            // The backend's own verdict on the stored format: an artifact it already
            // reads in full has nothing for these legacy repairs to do, and the
            // transform would only refuse its header.
            if (formatStatus === 'current')
                continue;
            const location = store.locate?.(header);
            if (location?.kind !== 'jsonl') {
                entries.push({ session: header.id, state: 'unsupported', events: 0, detail: 'This task supports the JSONL session backend only.' });
                continue;
            }
            const artifact = await artifactFor(location.path, task.supports);
            if (artifact === undefined)
                continue;
            if ('error' in artifact) {
                entries.push({ session: header.id, state: 'error', events: 0, detail: artifact.error });
                continue;
            }
            try {
                const bytes = artifact.bytes;
                const result = task.transform(bytes, artifact.path.endsWith('.zstd'));
                if (result.events === 0)
                    continue;
                const live = this.ctx.get('sessions')?.get(header.id) !== undefined;
                entries.push({ session: header.id, state: live ? 'busy' : 'ready', events: result.events });
                if (!live)
                    files.push({ id: header.id, path: artifact.path, hash: digest(bytes) });
            }
            catch (error) {
                entries.push({ session: header.id, state: 'error', events: 0, detail: String(error) });
            }
        }
        const value = { token: randomUUID(), task: task.id, scanned: listings.length, entries };
        this.plan = { value, files, expires: Date.now() + 300_000 };
        return value;
    }
    async execute(token, signal, automatic = false) {
        if (this.automatic.running && !automatic)
            throw new Error('Automatic migration is running. Wait for it to finish.');
        const plan = this.plan;
        this.plan = undefined;
        if (this.executing || plan === undefined || plan.value.token !== token || plan.expires < Date.now())
            throw new Error('Migration confirmation expired. Scan again.');
        const task = this.tasks.find(item => item.id === plan.value.task);
        const entries = [];
        this.executing = true;
        try {
            for (const file of plan.files) {
                if (signal?.aborted) {
                    entries.push({ session: file.id, state: 'skipped', detail: 'Cancelled before migrating this session.' });
                    continue;
                }
                this.busy.add(file.id);
                try {
                    if (this.ctx.get('sessions')?.get(SessionId(file.id)) !== undefined) {
                        entries.push({ session: file.id, state: 'skipped', detail: 'The conversation is currently loaded. Close it and scan again.' });
                        continue;
                    }
                    const result = await migrateFile(file.path, true, file.hash, task.transform);
                    entries.push({ session: file.id, state: result.events === 0 ? 'skipped' : 'migrated', backup: result.backup });
                }
                catch (error) {
                    entries.push({ session: file.id, state: 'error', detail: String(error) });
                }
                finally {
                    this.busy.delete(file.id);
                }
            }
        }
        finally {
            this.executing = false;
        }
        return { task: task.id, entries };
    }
}
/** Run upgrade tasks on host load, when persistence and live ownership are known. */
export function registerMigrations(ctx, automatic = true) {
    ctx.inject(['sessions', 'sessionPersistence'], scope => {
        const manager = new MigrationManager(scope);
        scope.provide('filesnapMigrations', manager);
        if (automatic)
            scope.effect(() => {
                const abort = new AbortController();
                const timer = setTimeout(() => { void manager.runAutomatic(abort.signal); }, 0);
                return () => { clearTimeout(timer); abort.abort(); };
            });
    });
}
