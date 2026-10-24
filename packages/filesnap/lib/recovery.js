/** Durable host-side recovery state. Engine snapshots remain opaque CLI-owned data. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, realpath, rename, lstat } from 'node:fs/promises';
import { dirname, join, resolve, parse } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { eventsOfType, lastEvent } from "./cli.js";
const change = z.object({ path: z.string(), action: z.enum(['write', 'delete']) }).strict();
const recipe = z.object({ session: z.string(), turn: z.string(), parent: z.string() }).strict();
const operation = z.object({
    id: z.string().uuid(), kind: z.enum(['rewind', 'redo']), source: z.string(), destination: z.string(),
    session: z.string(), target: z.string(), rescue: z.string(), rules: z.string(), createdAt: z.number(),
    changes: z.array(change), before: z.record(z.string(), z.string()), phase: z.enum(['apply', 'rollback']),
}).strict();
const document = z.object({
    version: z.literal(1), cwd: z.string(), pending: operation.optional(), redo: z.record(z.string(), z.array(recipe)),
}).strict();
const owners = new Set();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const missing = (e) => e.code === 'ENOENT';
async function syncDir(path) {
    if (process.platform === 'win32')
        return; // Node cannot flush Windows directory handles.
    const handle = await open(path, 'r');
    try {
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
async function write(path, value) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try {
        await file.writeFile(JSON.stringify(value));
        await file.sync();
    }
    finally {
        await file.close();
    }
    await rename(temporary, path);
    await syncDir(dirname(path));
}
/** Hash bytes and permissions, refusing symlinks (including changed parent directories). */
async function state(path) {
    if (!parse(path).root || resolve(path) !== path)
        throw new Error(`Non-canonical recovery path: ${path}`);
    for (let parent = dirname(path); parent !== dirname(parent); parent = dirname(parent)) {
        try {
            if ((await lstat(parent)).isSymbolicLink())
                throw new Error(`Recovery path crosses a symbolic link: ${path}`);
        }
        catch (e) {
            if (!missing(e))
                throw e;
        }
    }
    try {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error(`Not a regular recovery file: ${path}`);
        return `${stat.mode & 0o7777}:${hash(await readFile(path))}`;
    }
    catch (e) {
        if (missing(e))
            return 'absent';
        throw e;
    }
}
async function states(paths) {
    const result = Object.create(null);
    for (const path of paths)
        result[path] = await state(path);
    return result;
}
function checked(run, type) {
    const done = lastEvent(run, type);
    if (run.exit !== 'ok' || run.refused !== 0 || done === undefined)
        throw new Error(run.stderr || `Incomplete ${type}; open FileSnap settings to recover an interrupted restore.`);
    return done;
}
function changes(run) {
    const rows = eventsOfType(run, 'prepare.change').map(row => change.parse({ path: row['path'], action: row['action'] }));
    const done = checked(run, 'prepare.done');
    if (done['writes'] !== rows.filter(row => row.action === 'write').length || done['deletes'] !== rows.filter(row => row.action === 'delete').length
        || typeof done['manifest'] !== 'string' || typeof done['ignoreRules'] !== 'string')
        throw new Error('Incomplete recovery preview.');
    return { rows, manifest: done['manifest'], rules: done['ignoreRules'] };
}
export class RecoveryManager {
    root;
    previews = new Map();
    constructor(dataDir) {
        const base = dataDir ?? (process.platform === 'win32' ? process.env['LOCALAPPDATA'] : process.env['XDG_DATA_HOME']) ?? join(homedir(), '.local', 'share');
        this.root = join(resolve(base), 'dsh-filesnap', 'recovery-v1');
    }
    path(cwd) { return join(this.root, `${hash(cwd)}.json`); }
    async read(cwd) {
        try {
            const value = document.parse(JSON.parse(await readFile(this.path(cwd), 'utf8')));
            if (value.cwd !== cwd)
                throw new Error('Recovery workspace mismatch.');
            return value;
        }
        catch (e) {
            if (missing(e))
                return { version: 1, cwd, redo: {} };
            throw e;
        }
    }
    async exclusive(cwd, body) {
        cwd = await realpath(cwd);
        const key = this.path(cwd);
        if (owners.has(key))
            throw new Error('FileSnap is already working in this workspace.');
        owners.add(key);
        try {
            return await body(cwd);
        }
        finally {
            owners.delete(key);
        }
    }
    async assertReady(cwd) {
        cwd = await realpath(cwd);
        if (owners.has(this.path(cwd)) || (await this.read(cwd)).pending !== undefined) {
            throw new Error('An unfinished FileSnap restore is protecting this workspace. Open Settings → FileSnap → Interrupted restores.');
        }
    }
    async redoTarget(cwd, session) {
        const redo = (await this.read(await realpath(cwd))).redo;
        const entries = Object.hasOwn(redo, session) ? redo[session] : undefined;
        return entries === undefined ? undefined : entries.at(-1) ?? null;
    }
    async list() {
        let names;
        try {
            names = await readdir(this.root);
        }
        catch (e) {
            if (missing(e))
                return [];
            throw e;
        }
        const result = [];
        for (const name of names.filter(name => name.endsWith('.json'))) {
            const doc = document.parse(JSON.parse(await readFile(join(this.root, name), 'utf8')));
            if (name !== `${hash(doc.cwd)}.json`)
                throw new Error('Invalid recovery record filename.');
            if (doc.pending !== undefined) {
                const op = doc.pending;
                result.push({ id: op.id, cwd: doc.cwd, kind: op.kind, source: op.source, destination: op.destination, createdAt: op.createdAt, phase: op.phase, changes: op.changes });
            }
        }
        return result;
    }
    async prepare(cli, cwd, session, target, signal) {
        const turn = `rescue-${randomUUID()}`;
        const run = await cli.run(['prepare', '--session', session, '--turn', turn, '--target', target, '--cwd', cwd], cwd, signal);
        return { ...changes(run), turn };
    }
    /** The caller holds exclusive and has checked all agents sharing this workspace. */
    async begin(cli, cwd, request, signal, expected) {
        const doc = await this.read(cwd);
        if (doc.pending !== undefined)
            throw new Error('Recover the unfinished restore first in FileSnap settings.');
        if (request.kind === 'redo') {
            const stack = Object.hasOwn(doc.redo, request.source) ? doc.redo[request.source] : undefined;
            const last = stack?.at(-1);
            if (last?.turn !== request.target || last.parent !== request.destination)
                throw new Error('The redo target changed. Preview again.');
        }
        const id = randomUUID(), session = request.source;
        const prepared = await this.prepare(cli, cwd, session, request.target, signal);
        if (expected !== undefined && JSON.stringify([prepared.manifest, prepared.rules, prepared.rows]) !== expected)
            throw new Error('Workspace changed after confirmation. Preview again.');
        const before = await states(prepared.rows.map(row => row.path));
        // Confirm the capture did not race an editor while the initial hashes were read.
        const verify = await this.prepare(cli, cwd, session, request.target, signal);
        if (verify.manifest !== prepared.manifest || verify.rules !== prepared.rules)
            throw new Error('Workspace changed while saving recovery state. Preview again.');
        doc.pending = { ...request, id, session, rescue: prepared.turn, rules: prepared.rules, changes: prepared.rows, before, createdAt: Date.now(), phase: 'apply' };
        await write(this.path(cwd), doc); // Must precede the first file-changing subprocess.
        const run = await this.restore(cli, cwd, doc.pending, request.target, signal);
        if (this.complete(run)) {
            await this.finish(doc);
            return run;
        }
        return { ...run, exit: 'failed', stderr: `${run.stderr || 'The file restore was incomplete.'} Open Settings → FileSnap → Interrupted restores to continue or roll back.` };
    }
    complete(run) {
        const done = lastEvent(run, 'restore.done');
        return (run.exit === 'ok' || run.exit === 'partial') && run.refused === 0 && done?.['failed'] === 0
            && typeof done['safety'] === 'string' && typeof done['written'] === 'number' && typeof done['deleted'] === 'number'
            && eventsOfType(run, 'restore.failed').length === 0;
    }
    restore(cli, cwd, op, target, signal) {
        // Replaying never pushes/spends the engine's undo stack. The named rescue is repeatable.
        return cli.run(['restore', '--session', op.session, '--turn', target, '--cwd', cwd, '--ignore-rules-stdin'], cwd, signal, op.rules);
    }
    async finish(doc) {
        const op = doc.pending;
        if (op.phase === 'apply') {
            if (op.kind === 'rewind') {
                const stack = Object.hasOwn(doc.redo, op.destination) ? doc.redo[op.destination] : [];
                doc.redo[op.destination] = [...stack, { session: op.session, turn: op.rescue, parent: op.source }].slice(-20);
            }
            else
                doc.redo[op.source] = (doc.redo[op.source] ?? []).slice(0, -1);
        }
        delete doc.pending;
        // Completion and redo bookkeeping share one atomic replacement: neither can be half committed.
        await write(this.path(doc.cwd), doc);
    }
    async find(id) {
        const item = (await this.list()).find(item => item.id === id);
        if (item === undefined)
            throw new Error('This interrupted restore has already been resolved.');
        return this.read(item.cwd);
    }
    async inspect(cli, doc, mode, signal) {
        const op = doc.pending;
        if (op.phase === 'rollback' && mode !== 'rollback')
            throw new Error('Rollback already started; finish rolling back first.');
        const target = await this.prepare(cli, doc.cwd, op.session, op.target, signal);
        const rescue = await this.prepare(cli, doc.cwd, op.session, op.rescue, signal);
        if (target.rules !== op.rules || rescue.rules !== op.rules) {
            throw new Error('The .filesnapignore rules changed. Restore the confirmed ignore rules before continuing recovery; the saved snapshots are intact.');
        }
        const paths = [...new Set([...op.changes.map(row => row.path), ...target.rows.map(row => row.path), ...rescue.rows.map(row => row.path)])];
        const current = await states(paths);
        const differentFromTarget = new Set(target.rows.map(row => row.path));
        const conflicts = paths.filter(path => current[path] !== op.before[path] && (op.before[path] === undefined || differentFromTarget.has(path)));
        // Unchanged paths outside the original plan are harmless unless rollback would alter them.
        const actualConflicts = conflicts.filter(path => op.before[path] !== undefined || rescue.rows.some(row => row.path === path));
        const rows = mode === 'apply' ? target.rows : rescue.rows;
        return { changes: rows, conflicts: actualConflicts, fingerprint: hash(JSON.stringify([op.id, op.phase, mode, target.manifest, rescue.manifest, current, rows])) };
    }
    async preview(cli, id, mode, signal) {
        const doc = await this.find(id);
        return this.exclusive(doc.cwd, async () => {
            const fresh = await this.find(id);
            const result = await this.inspect(cli, fresh, mode, signal);
            const token = randomUUID();
            for (const [old, saved] of this.previews)
                if (saved.expires < Date.now() || saved.id === id)
                    this.previews.delete(old);
            this.previews.set(token, { cwd: doc.cwd, id, mode, fingerprint: result.fingerprint, expires: Date.now() + 300_000 });
            return { token, id, mode, changes: result.changes, conflicts: result.conflicts };
        });
    }
    async recover(cli, token, idle, signal) {
        const saved = this.previews.get(token);
        this.previews.delete(token);
        if (saved === undefined || saved.expires < Date.now())
            throw new Error('Recovery confirmation expired. Preview again.');
        return this.exclusive(saved.cwd, async () => {
            idle(saved.cwd);
            const doc = await this.find(saved.id), op = doc.pending;
            const result = await this.inspect(cli, doc, saved.mode, signal);
            if (result.conflicts.length > 0 || result.fingerprint !== saved.fingerprint)
                throw new Error('Files changed after the interruption or preview. Resolve the conflicts and preview again; no files were restored.');
            op.phase = saved.mode;
            await write(this.path(doc.cwd), doc);
            const run = await this.restore(cli, doc.cwd, op, saved.mode === 'apply' ? op.target : op.rescue, signal);
            if (!this.complete(run))
                throw new Error(run.stderr || 'Recovery was interrupted or incomplete. The rescue is preserved; preview and retry.');
            await this.finish(doc);
            return { id: op.id, cwd: doc.cwd, kind: op.kind, source: op.source, destination: op.destination, createdAt: op.createdAt, phase: op.phase, changes: op.changes };
        });
    }
}
