/** Offline compatibility repair for legacy FileSnap session events. New versions never write them. */
import { constants } from 'node:fs';
import { copyFile, lstat, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mark } from "./mark.js";
import { createHash, randomUUID } from 'node:crypto';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';
const LEGACY = new Set(['filesnap/point', 'filesnap/rewound', 'filesnap/redone', 'filesnap/reply']);
/** Node's one-shot decoder reads one frame; DSH appends multiple frames. */
export function decodeArtifact(bytes, compressed) {
    if (!compressed)
        return bytes.toString('utf8');
    const chunks = [];
    let offset = 0;
    while (offset < bytes.length) {
        const result = zstdDecompressSync(bytes.subarray(offset), { info: true });
        const consumed = result.engine.bytesWritten;
        if (!Number.isSafeInteger(consumed) || consumed <= 0 || consumed > bytes.length - offset)
            throw new Error('Invalid zstd frame length.');
        chunks.push(result.buffer);
        offset += consumed;
    }
    return Buffer.concat(chunks).toString('utf8');
}
/** Preserve rows, sequence numbers, fork boundaries and all message content. */
export function repairArtifact(bytes, compressed) {
    const text = decodeArtifact(bytes, compressed);
    if (!text.endsWith('\n'))
        throw new Error('Incomplete log tail; recover it with DSH before migration.');
    const lines = text.split('\n');
    const header = JSON.parse(lines[0] ?? '');
    if (header.type !== 'session' || header.version !== 0 || typeof header.id !== 'string')
        throw new Error('Unsupported session header; file left unchanged.');
    let events = 0;
    for (let index = 1; index < lines.length - 1; index++) {
        const line = lines[index];
        const event = JSON.parse(line);
        if (!LEGACY.has(event.type ?? '') || event.ignorable === true)
            continue;
        if (event.surfaceOp !== undefined || !Number.isSafeInteger(event.seq))
            throw new Error('Unexpected legacy event shape; file left unchanged.');
        lines[index] = JSON.stringify({ ...event, ignorable: true });
        events++;
    }
    if (events === 0)
        return { bytes, events };
    const headerLine = Buffer.from(lines[0] + '\n');
    const body = Buffer.from(lines.slice(1).join('\n'));
    // DSH reads the first zstd frame as the header alone. Keep that framing.
    const result = compressed ? Buffer.concat([zstdCompressSync(headerLine), zstdCompressSync(body)]) : Buffer.concat([headerLine, body]);
    return { bytes: result, events };
}
/** Append a native title revision; preserve every prior event and fork boundary. */
export function migrateStatusTitles(bytes, compressed) {
    const text = decodeArtifact(bytes, compressed);
    if (!text.endsWith('\n'))
        throw new Error('Incomplete session log; file left unchanged.');
    const lines = text.trimEnd().split('\n');
    const header = JSON.parse(lines[0]);
    if (header.type !== 'session' || header.version !== 0)
        throw new Error('Unsupported session header; file left unchanged.');
    const rows = lines.slice(1).map(line => JSON.parse(line));
    const latest = rows.findLast(row => row.type === 'session/title');
    if (!latest?.data?.title?.startsWith('↩ ') || (latest.seq ?? -1) < (header.seedLength ?? 0))
        return { bytes, events: 0 };
    const last = rows.at(-1);
    if (!Number.isSafeInteger(last?.seq) || !Number.isSafeInteger(last?.time))
        throw new Error('Invalid event sequence; file left unchanged.');
    const title = { type: 'session/title', seq: last.seq + 1, time: last.time + 1,
        data: { title: mark(latest.data.title), source: { kind: 'user' }, messageSeqs: [] } };
    const headerLine = Buffer.from(lines[0] + '\n');
    const body = Buffer.from([...lines.slice(1), JSON.stringify(title), ''].join('\n'));
    return { bytes: compressed ? Buffer.concat([zstdCompressSync(headerLine), zstdCompressSync(body)]) : Buffer.concat([headerLine, body]), events: 1 };
}
/** Dry-run by default; writes require all DSH processes using this root to be stopped. */
export async function migrateFile(path, write = false, expectedHash, transform = repairArtifact) {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('Only ordinary session files can be migrated.');
    const before = await readFile(path);
    if (expectedHash !== undefined && createHash('sha256').update(before).digest('hex') !== expectedHash)
        throw new Error('The log changed after scanning. Scan again.');
    const repaired = transform(before, path.endsWith('.zstd'));
    if (!write || repaired.events === 0)
        return { path, events: repaired.events };
    const suffix = randomUUID();
    const backup = `${path}.before-filesnap-migration-${suffix}`;
    const temporary = `${path}.filesnap-migration-${suffix}.tmp`;
    await copyFile(path, backup, constants.COPYFILE_EXCL);
    try {
        const target = await open(temporary, 'wx', stat.mode & 0o777);
        try {
            await target.writeFile(repaired.bytes);
            await target.sync();
        }
        finally {
            await target.close();
        }
        if (!(await readFile(path)).equals(before))
            throw new Error('The log changed during migration; stop DSH and try again.');
        await rename(temporary, path);
    }
    finally {
        await rm(temporary, { force: true });
    }
    return { path, events: repaired.events, backup };
}
async function* sessionFiles(root) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory())
            yield* sessionFiles(path);
        else if (entry.isFile() && (entry.name === 'session.jsonl' || entry.name === 'session.jsonl.zstd'))
            yield path;
    }
}
async function main() {
    const args = process.argv.slice(2);
    const rootAt = args.indexOf('--root');
    const root = rootAt < 0 ? undefined : args[rootAt + 1];
    if (root === undefined || root.startsWith('--'))
        throw new Error('Usage: node lib/migrate-session-logs.js --root <DSH session directory> [--write --dsh-stopped]');
    const write = args.includes('--write');
    if (write && !args.includes('--dsh-stopped'))
        throw new Error('Stop every DSH process using this session directory, then add --dsh-stopped.');
    for await (const path of sessionFiles(resolve(root))) {
        const result = await migrateFile(path, write);
        if (result.events > 0)
            process.stdout.write(JSON.stringify({ ...result, mode: write ? 'repaired' : 'preview' }) + '\n');
    }
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    void main().catch(error => { console.error(String(error)); process.exitCode = 1; });
}
