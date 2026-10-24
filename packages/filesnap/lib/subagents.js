/** Carry a rewound session's children into the branch its fork created.
 *
 * A fork keeps the rewound session's history as an inherited prefix, but the
 * branching session's subagent catalog only counts children established in
 * the branch's own suffix: facts from the inherited prefix are filtered out,
 * so the subagent panel of a fresh branch comes up empty even though the
 * turns the branch kept plainly spawned children — and there is no way to
 * continue them, because a continuation is authorized against the child's
 * durable parent, which is the pre-rewind session.
 *
 * This module walks the branch's inherited prefix, resolves every child it
 * names, and re-establishes each one under the branch as a clone: a fresh
 * session whose header keeps the child's identity fields but points at the
 * branch, and whose log copies the child's stored log — as it stood at the
 * fork point — as an inherited prefix. That prefix is closed exactly the way
 * the harness closes its own seeded children — a seeded header, an
 * inherited-cut marker at the boundary, then the child's descriptor
 * re-anchored inside the clone's own suffix — so the clone's descriptor,
 * catalog, and continuation folds all start where its inherited history
 * ends, not at the copied log's start. The clone is what the branch can then
 * show and continue.
 *
 * The carry reproduces the fork point at every depth, so the branch shows
 * the family the rewound session had at the cut and no more: a child's log
 * is truncated to the events at or before the moment of the cut — the
 * branch's last inherited event — and descendants are discovered and
 * carried from inside that kept history only. A grandchild established
 * after the cut stays out, because the fact that names it lies beyond the
 * kept log, and a grandchild established before it is truncated by the same
 * cut time, recursively. Redoing the rewind needs no carry at all: the
 * pre-rewind session, and every child under it, was never touched.
 *
 * Two runtime generations are spanned, because this plugin's supported
 * harness range is:
 *
 * - The 0.1.2 generation has no `subagent/catalog` vocabulary. Children are
 *   discovered by scanning stored headers for `origin: 'subagent'` sessions
 *   of the rewound session, and the carry writes the clones only — a fact
 *   appended to one of its logs would make the session unreadable to its own
 *   generation, so catalog writes are gated on the runtime vocabulary
 *   ({@link CarrySubagentsOptions.vocabulary}).
 * - The 0.2.0 generation writes catalog facts. A fact in the prefix names
 *   its child directly and keeps working after rewinds of rewinds — where
 *   the child's `parentSession` is an earlier session, not the one being
 *   rewound, which no header scan can infer — so facts are preferred. Each
 *   clone (and each descendant clone, recursively) receives a fresh fact
 *   under its new parent.
 *
 * Clones are written through whichever persistence generation the deployment
 * composes: the 0.2.0 handle API when `open` is present, the 0.1.2
 * `create`/`append` API otherwise. No failure here ever fails the rewind it
 * is attached to: a child that cannot be read, cloned, or named is warned
 * about, and the remaining children are carried.
 *
 * @module dsh-filesnap/subagents
 */
import { createHash, randomUUID } from 'node:crypto';
import { SESSION_FORMAT_VERSION, SessionId as brandSessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session';
/** The catalog event type of the 0.2.0 generation; absent from 0.1.2's vocabulary. */
const CATALOG_EVENT_TYPE = 'subagent/catalog';
/** The child descriptor event type both generations write. */
const DESCRIPTOR_EVENT_TYPE = 'subagent/descriptor';
/** The lifecycle event that closes a seeded session's inherited prefix. */
const END_SEED_EVENT_TYPE = 'session/end-seed';
/** The descriptor format the continuation machinery folds; older versions are not resumable. */
const DESCRIPTOR_VERSION = 3;
/**
 * Re-establish a rewound session's children under the branch it forked into.
 *
 * The branch's inherited prefix is the discovery source: every
 * `subagent/catalog` fact below the fork cut names a child that existed
 * before it. A prefix with no facts — a log written before the catalog
 * existed — falls back to stored `origin: 'subagent'` children of the
 * rewound session created no later than the last inherited event. Every
 * child — and every descendant carried under it, recursively — is
 * re-established in the state it had at the fork point, its log truncated
 * to events at or before the branch's last inherited event. Facts whose
 * session is gone, and clones whose write fails, are warned about and
 * skipped; everything else is carried.
 *
 * @param options - the branch, its source, storage, vocabulary and warnings.
 * @returns the number of children cloned into the branch.
 */
export async function carrySubagents(options) {
    const store = options.store;
    if (store === undefined)
        return 0;
    try {
        return await carry(options, store);
    }
    catch (error) {
        options.warn(`could not carry subagents into session "${options.branch.header.id}": ${String(error)}`);
        return 0;
    }
}
/** The carry proper, behind the one place that guarantees it never throws. */
async function carry(options, store) {
    const { branch, source, vocabulary, warn, signal } = options;
    const writable = vocabulary.has(CATALOG_EVENT_TYPE);
    const discovery = await candidatesFor(store, branch, source, signal, warn);
    // Nothing inherited means no fork point to cut to: there is nothing the
    // rewind retained, and hence nothing to carry. Discovery cannot name a
    // candidate without one, so this is a guard for the types' sake.
    if (discovery.cutTime === undefined)
        return 0;
    const seen = new Set();
    let carried = 0;
    for (const candidate of discovery.candidates) {
        if (signal?.aborted === true)
            break;
        try {
            const clone = await cloneChild({ store, candidate, parentId: branch.header.id, cutTime: discovery.cutTime, writable, seen, warn, signal });
            if (clone === undefined)
                continue;
            if (writable)
                appendFactEvent(branch, clone.payload);
            carried += 1;
        }
        catch (error) {
            warn(`subagent "${candidate.childId}" was not carried: ${String(error)}`);
        }
    }
    return carried;
}
/** Discover the children the branch's retained history spawned, and the fork point that caps their logs. */
async function candidatesFor(store, branch, source, signal, warn) {
    const events = branch.snapshotEvents();
    const cut = Number(branch.inheritedEventCount);
    const prefix = events.filter(event => event.seq < cut);
    // The last inherited event is the moment of the rewind's cut: every clone
    // is read to this point, at every depth.
    const cutTime = prefix.at(-1)?.time;
    const entries = entriesIn(prefix);
    if (entries.length > 0) {
        // Facts win: they name their child directly and survive rewinds of
        // rewinds. The branch's own suffix has the facts of children it was
        // already given — a re-used destination must not carry them twice.
        const resolved = new Set();
        for (const entry of entriesIn(events.filter(event => event.seq >= cut))) {
            const header = await headerOf(store, entry.childId, signal);
            if (header !== undefined)
                resolved.add(stampOf(header));
        }
        const candidates = await resolve(store, entries, signal, warn);
        return { candidates: candidates.filter(candidate => !resolved.has(stampOf(candidate.header))), cutTime };
    }
    // No facts to read: a log written before the catalog existed. Children
    // are its stored subagent sessions created no later than the branch's
    // last retained event, minus whatever the branch already parents.
    if (cutTime === undefined || store.list === undefined)
        return { candidates: [], cutTime };
    const headers = await listedHeaders(store, signal);
    const resolved = new Set();
    const found = [];
    for (const header of headers.values()) {
        if (header.origin !== 'subagent')
            continue;
        if (header.parentSession === branch.header.id) {
            resolved.add(stampOf(header));
            continue;
        }
        if (header.parentSession === source.header.id && header.createdAt <= cutTime) {
            found.push({ childId: header.id, header });
        }
    }
    return { candidates: lastPerStamp(found).filter(candidate => !resolved.has(stampOf(candidate.header))), cutTime };
}
/** Turn fact entries into candidates, warning about children that are gone. */
async function resolve(store, entries, signal, warn) {
    const candidates = [];
    for (const entry of entries) {
        let header;
        try {
            header = await headerOf(store, entry.childId, signal);
        }
        catch (error) {
            warn(`subagent "${entry.childId}" was not carried: ${String(error)}`);
            continue;
        }
        if (header === undefined) {
            warn(`subagent "${entry.childId}" was not carried: its session is no longer stored`);
            continue;
        }
        candidates.push({ childId: entry.childId, header, fact: entry });
    }
    return lastPerStamp(candidates);
}
/** Keep the last candidate per lineage stamp; a later fact supersedes its lineage's earlier ones. */
function lastPerStamp(candidates) {
    const kept = new Map();
    for (const candidate of candidates)
        kept.set(stampOf(candidate.header), candidate);
    return [...kept.values()];
}
/**
 * A clone's id carries the hash of its original session id, plus a fresh UUID.
 * The hash survives both generations' header serialization without adding
 * fields or event types to native logs. The random suffix keeps each branch's
 * clone independent. The bounded, path-safe id also fits FileSnap's id limit.
 */
const CLONE_ID_PREFIX = 'filesnap-carry-v1.';
const CLONE_ID = /^filesnap-carry-v1\.([0-9a-f]{64})\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
/** Match clones to their original, never by coincidentally equal header metadata. */
function stampOf(header) {
    if (header.isSeeded && header.origin === 'subagent') {
        const carried = CLONE_ID.exec(header.id)?.[1];
        if (carried !== undefined)
            return carried;
    }
    return createHash('sha256').update(header.id).digest('hex');
}
/** Discover children of pre-catalog sessions at any depth. */
async function childrenOf(store, parentId, cutTime, signal) {
    const found = [];
    for (const header of (await listedHeaders(store, signal)).values()) {
        if (header.origin === 'subagent' && header.parentSession === parentId && header.createdAt <= cutTime) {
            found.push({ childId: header.id, header });
        }
    }
    return lastPerStamp(found);
}
/**
 * Clone one child — and, recursively, its own children — under a new parent.
 *
 * The clone is cut to the fork point: only the child's events at or before
 * {@link CloneInput.cutTime} are copied, so the branch gets the state the
 * child had when the rewind cut its source. That is what keeps a grandchild
 * established after the cut out of the carry — the fact naming it is
 * dropped with the rest of the later history — and it applies at every
 * depth, because a carried descendant is truncated by the same cut time.
 *
 * Descendants are cloned before the clone that will name them is written,
 * because a clone's own children are named from inside its log: the fresh
 * grandchild facts close the clone's own suffix, with the same contraction
 * discipline the branch itself gets. That suffix is opened the way the
 * harness opens a seeded child of its own — an inherited-cut marker at the
 * boundary, then the child's descriptor re-anchored inside the suffix —
 * because every fold of the clone's own history (catalog, descriptor,
 * continuation) starts at the cut, not at the copied log's start. A child
 * already seen in this carry is skipped rather than revisited, so a corrupt
 * lineage cannot recurse forever.
 *
 * @param input - the child, the parent it is re-attached to, the fork point, and the carry context.
 * @returns the clone's identity and fresh fact payload, or `undefined` when it was already seen or has no kept history.
 */
async function cloneChild(input) {
    const { store, candidate, parentId, cutTime, writable, seen, warn, signal } = input;
    const key = candidate.childId;
    if (seen.has(key))
        return undefined;
    seen.add(key);
    const saved = await readStoredLog(store, candidate.childId, signal);
    // The fork point caps the clone's history: everything the child did after
    // the rewind cut — and everything it spawned after it — stays out.
    const kept = saved.events.filter(event => event.time <= cutTime);
    if (kept.length === 0) {
        warn(`subagent "${candidate.childId}" was not carried: none of its events predate the rewind point`);
        return undefined;
    }
    const cloneId = brandSessionId(`${CLONE_ID_PREFIX}${stampOf(candidate.header)}.${randomUUID()}`);
    const descriptor = foldDescriptor(kept, saved.inheritedEventCount);
    const inheritedDescriptor = descriptorPayloadOf(kept, saved.inheritedEventCount);
    // The child's own kept suffix holds the facts of the children it spawned
    // before the cut — including, from an earlier carry, a previous
    // generation of clones. Keeping the last per stamp extends the newest
    // lineage rather than an original that is already represented.
    const own = kept.filter(event => event.seq >= saved.inheritedEventCount);
    const payloads = [];
    const entries = entriesIn(own);
    const descendants = entries.length > 0
        ? await resolve(store, entries, signal, warn)
        : await childrenOf(store, candidate.childId, cutTime, signal);
    for (const descendant of descendants) {
        try {
            const grand = await cloneChild({ store, candidate: descendant, parentId: cloneId, cutTime, writable, seen, warn, signal });
            if (grand === undefined || !writable)
                continue;
            payloads.push(grand.payload);
        }
        catch (error) {
            warn(`subagent "${descendant.childId}" was not carried: ${String(error)}`);
        }
    }
    const lineage = candidate.header;
    const header = {
        version: SESSION_FORMAT_VERSION,
        id: cloneId,
        createdAt: lineage.createdAt,
        ...lineage.cwd === undefined ? {} : { cwd: lineage.cwd },
        parentSession: parentId,
        isSeeded: true,
        origin: 'subagent',
        ...lineage.delegationDepth === undefined ? {} : { delegationDepth: lineage.delegationDepth },
        ...lineage.agentPreset === undefined ? {} : { agentPreset: lineage.agentPreset },
    };
    // The kept log is the clone's inherited prefix; the clone's own suffix
    // follows it in the harness's seeded-child shape.
    const cut = kept.length;
    const suffix = [sessionEvent(END_SEED_EVENT_TYPE, cut, { inherited: true })];
    if (inheritedDescriptor !== undefined) {
        suffix.push(sessionEvent(DESCRIPTOR_EVENT_TYPE, cut + suffix.length, inheritedDescriptor));
    }
    for (const payload of payloads)
        suffix.push(factEvent(cut + suffix.length, payload));
    const batch = [...kept, ...suffix];
    if (typeof store.open === 'function') {
        if (store.create === undefined)
            throw new Error('the persistence backend exposes no create');
        const handle = await store.create(header, {
            ...signal === undefined ? {} : { signal },
            inheritedEventCount: SessionLogOffset(cut),
        });
        try {
            if (handle.append === undefined)
                throw new Error(`the write handle of session "${cloneId}" exposes no append`);
            await handle.append(batch, { ...signal === undefined ? {} : { signal } });
            if (handle.flush !== undefined)
                await handle.flush({ ...signal === undefined ? {} : { signal } });
        }
        finally {
            await handle.close();
        }
    }
    else {
        const legacyCreate = store.create;
        if (typeof store.append !== 'function')
            throw new Error('the persistence backend exposes no append');
        await legacyCreate.call(store, header, SessionLogOffset(cut));
        await store.append(cloneId, batch);
    }
    return { cloneId, payload: freshFactPayload(cloneId, lineage.createdAt, descriptor, candidate.fact) };
}
/**
 * The fresh fact payload that names one clone.
 *
 * It mirrors what the harness itself writes when it establishes a child:
 * the clone's id and creation time, and the child's established mode. The
 * child's own descriptor wins over the original fact — it is what a
 * continuation folds — and a lineage with neither falls back to the
 * explicit unknown mode, which the newer runtime records as version 1.
 *
 * @param cloneId - the fresh session's id.
 * @param childCreatedAt - the clone's creation time (the original's).
 * @param descriptor - the child's own descriptor, when it folds to a supported one.
 * @param fact - the fact that named the original child, when there was one.
 * @returns the payload to append as a `subagent/catalog` event.
 */
function freshFactPayload(cloneId, childCreatedAt, descriptor, fact) {
    const mode = descriptor?.mode ?? fact?.mode;
    const label = descriptor?.label ?? fact?.label;
    if (mode === 'continuable' && typeof label === 'string') {
        return { version: 0, childId: cloneId, childCreatedAt, mode: 'continuable', label };
    }
    if (mode === 'one-shot') {
        return { version: 0, childId: cloneId, childCreatedAt, mode: 'one-shot', ...typeof label === 'string' ? { label } : {} };
    }
    return { version: 1, childId: cloneId, childCreatedAt, mode: 'unknown' };
}
/**
 * Fold a persisted child log to its descriptor, as the continuation
 * machinery does: the first descriptor in the child's own suffix is
 * authoritative, and only the current version is understood. Anything else
 * — a missing descriptor, an older format, a malformed one — leaves the
 * fact's own record of the mode to speak.
 *
 * @param events - the child's complete log.
 * @param inheritedEventCount - the child's own fork cut.
 * @returns the established mode, or `undefined` when there is no usable descriptor.
 */
function foldDescriptor(events, inheritedEventCount) {
    for (const event of events) {
        if (event.seq < inheritedEventCount)
            continue;
        if (event.type !== DESCRIPTOR_EVENT_TYPE)
            continue;
        const data = asRecord(event.data);
        if (data?.['version'] !== DESCRIPTOR_VERSION)
            return undefined;
        const mode = data['mode'];
        const label = data['label'];
        if (mode === 'one-shot')
            return { mode, ...typeof label === 'string' ? { label } : {} };
        if (mode === 'continuable' && typeof label === 'string')
            return { mode, label };
        return undefined;
    }
    return undefined;
}
/**
 * The raw payload of the first descriptor in a child's own suffix.
 *
 * A clone re-anchors this payload past its inherited cut, because the
 * continuation machinery folds a child's descriptor from its own suffix
 * only. The payload is copied verbatim: whatever the original folded to —
 * a supported descriptor, an older format, a malformed one — the clone
 * folds to the same.
 *
 * @param events - the child's complete log.
 * @param inheritedEventCount - the child's own fork cut.
 * @returns the descriptor payload, or `undefined` when the suffix has none.
 */
function descriptorPayloadOf(events, inheritedEventCount) {
    for (const event of events) {
        if (event.seq < inheritedEventCount)
            continue;
        if (event.type === DESCRIPTOR_EVENT_TYPE)
            return event.data;
    }
    return undefined;
}
/** Every stored session through either generation's listing call. */
export async function listStoredSessions(store, signal) {
    if (store.list === undefined)
        return [];
    const options = signal === undefined ? {} : { signal };
    const rows = await store.list(typeof store.open === 'function' ? options : signal);
    const listings = [];
    for (const row of rows) {
        const header = rowHeader(row);
        if (header === undefined)
            continue;
        const formatStatus = row.formatStatus;
        listings.push(typeof formatStatus === 'string' ? { header, formatStatus } : { header });
    }
    return listings;
}
/** Read one stored session's header, verbatim log and inherited cut back through either generation. */
export async function readStoredLog(store, id, signal) {
    if (typeof store.inspect === 'function') {
        const inspection = await store.inspect(id, signal);
        return { header: inspection.meta, events: inspection.events, inheritedEventCount: Number(inspection.inheritedEventCount) };
    }
    if (typeof store.open === 'function') {
        const handle = await store.open(id, 'read', { ...signal === undefined ? {} : { signal } });
        try {
            if (handle.read === undefined)
                throw new Error(`the read handle of session "${id}" exposes no read`);
            const header = handle.header ?? await headerOf(store, id, signal);
            if (header === undefined)
                throw new Error(`session "${id}" has no stored header`);
            const { events } = await handle.read(0, Number.MAX_SAFE_INTEGER, { ...signal === undefined ? {} : { signal } });
            return { header, events, inheritedEventCount: Number(handle.inheritedEventCount ?? 0) };
        }
        finally {
            await handle.close();
        }
    }
    throw new Error('the persistence backend exposes neither inspect nor open');
}
/** The header of one stored session, through the cheapest call this generation has. */
async function headerOf(store, id, signal) {
    if (typeof store.stat === 'function') {
        const found = await store.stat(id, { ...signal === undefined ? {} : { signal } });
        return found?.header;
    }
    return (await listedHeaders(store, signal)).get(id);
}
/** Every stored header, keyed by id. */
async function listedHeaders(store, signal) {
    const headers = new Map();
    for (const { header } of await listStoredSessions(store, signal))
        headers.set(header.id, header);
    return headers;
}
/** One listed row as a header; the 0.2.0 generation wraps headers in snapshots. */
function rowHeader(row) {
    if (typeof row !== 'object' || row === null)
        return undefined;
    const header = row.header ?? row;
    if (typeof header !== 'object' || header === null)
        return undefined;
    return typeof header.id === 'string' ? header : undefined;
}
/** Every catalog fact in one slice of a log, in order. */
function entriesIn(events) {
    const entries = [];
    for (const event of events) {
        const entry = catalogEntry(event);
        if (entry !== undefined)
            entries.push(entry);
    }
    return entries;
}
/** Read one event as a catalog fact, or report that it is not a usable one. */
function catalogEntry(event) {
    if (event.type !== CATALOG_EVENT_TYPE)
        return undefined;
    const data = asRecord(event.data);
    const childId = data?.['childId'];
    if (typeof childId !== 'string' || childId === '')
        return undefined;
    const mode = data?.['mode'];
    const label = data?.['label'];
    return {
        childId: brandSessionId(childId),
        ...typeof mode === 'string' ? { mode } : {},
        ...typeof label === 'string' ? { label } : {},
    };
}
/** Object-shaped payload access; anything else is not a catalog fact or descriptor. */
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
/** One freshly minted plugin-owned event for a cold-written clone log. */
function sessionEvent(type, seq, data) {
    return { type, seq: SessionSeq(seq), time: Date.now(), data };
}
/** One freshly minted catalog event for a cold-written clone log. */
function factEvent(seq, payload) {
    return sessionEvent(CATALOG_EVENT_TYPE, seq, payload);
}
/** Append one catalog fact to the live branch, through the widened face plugin-owned events use. */
function appendFactEvent(session, payload) {
    const widened = session;
    widened.append(CATALOG_EVENT_TYPE, payload);
}
