/** Host sequencing for native conversation forks and file restoration.
 * New operations persist named rescue targets before applying files. Recovery
 * state and redo references live outside conversation artifacts; legacy engine
 * undo records remain readable for rewinds created before this workflow.
 */
import { Context, Service } from '@deepseek-ai/cordis';
import { RecoveryManager } from './recovery.ts';
import type { RewindPreview, RedoPreview, CleanupPreview, CleanupOutcome } from './wire.ts';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session';
import type { FilesnapStatus, RedoOutcome, RewindOutcome, RewindPoint, RewindResult } from './types.ts';
import type { FilesnapConfig } from './config.ts';
/**
 * Where a rewind's conversation half comes from. The fork is the host's
 * business, and a deployment that already has a correct one — the web client's
 * own fork, which also attaches the child to its workspace — should use it
 * rather than have this plugin build a second.
 */
export type RewindDestination = {
    readonly kind: 'fork';
}
/** The caller already forked; file the undo record in this session. */
 | {
    readonly kind: 'into';
    readonly session: SessionId;
};
declare module '@deepseek-ai/cordis' {
    interface Context {
        filesnap: FilesnapRewind;
    }
}
/**
 * The turn currently open in a session.
 *
 * Read from the log rather than tracked in memory: a resumed session is mid
 * conversation the moment it loads, and a counter starting at zero would file
 * its next capture under a turn id an earlier one already holds.
 *
 * @param session - the session to read.
 * @returns the open turn's number, or 0 when no turn has opened.
 */
export declare function currentTurn(session: Session): number;
/** Read the first human prompt of this turn without the list label's truncation. */
export declare function promptForTurn(session: Session, target: number): string | undefined;
export declare class FilesnapRewind extends Service {
    /**
     * Cordis reads an array as the required set and holds the fiber PENDING until
     * every name resolves; the object form is a name-to-config map, not a
     * required/optional split. `fs` and `agentPresets` are deliberately absent —
     * both are read through `ctx.get` at the moment they are needed, so a
     * deployment without a filesystem seam or per-session presets still gets a
     * working service rather than a plugin that never loads.
     */
    static inject: string[];
    /** Validated deployment configuration. */
    private readonly config;
    readonly recovery: RecoveryManager;
    /** Per-session state, dropped with the session it belongs to. */
    private readonly tracked;
    private readonly previews;
    private readonly redoTokens;
    private readonly cleanupTokens;
    /** The invoker, built once the executable has been resolved. */
    private cli;
    constructor(ctx: Context, config: FilesnapConfig);
    /**
     * Add or remove the rewound mark on one session's title.
     *
     * **Only a live session can be retitled.** `sessionTitle.rename` takes the
     * exact live `Session` and refuses anything else, so a conversation the user
     * has closed cannot be marked or unmarked from here. That is reported rather
     * than swallowed: on the redo side it means the conversation being returned
     * to keeps a mark that no longer applies, and the user should be told which
     * one.
     *
     * Renaming pins the title — automatic generation stops for that session.
     * Accepted: the alternative is a mark an automatic regeneration silently
     * erases, which is a mark that cannot be relied on.
     *
     * @param session - the session to retitle, live or not.
     * @param apply - how the current title becomes the new one.
     * @returns the new title, or why it could not be set.
     */
    private retitle;
    /**
     * Carry the rewound session's subagents into the branch its fork created.
     *
     * Only the branch can show them: the fork keeps the rewound session's
     * history as an inherited prefix, but the branching session's own catalog
     * does not count children established in that prefix, and a continuation is
     * authorized against a child's durable parent — which is still the
     * pre-rewind session. The carry clones each retained child under the branch
     * and names it there; `./subagents.ts` holds the discovery and the two
     * persistence generations it spans.
     *
     * **This never fails the rewind it is attached to.** Per-child failures are
     * reported through `warn`; a deployment with no live branch — a headless run
     * or a caller that forked in another process — simply has nothing to carry
     * into.
     *
     * @param agent - the agent standing in the session the rewind left.
     * @param branchId - the id of the live session the fork landed in.
     * @param signal - caller cancellation.
     */
    private carryBranchSubagents;
    /**
     * Report something a person may need to see.
     *
     * The logger is resolved through `ctx.get` rather than read as `ctx.logger`,
     * for the same reason the command registry is: cordis refuses a property
     * read for an undeclared service, and declaring the logger would hold this
     * fiber PENDING in an assembly that mounts none. Without one the line goes to
     * stderr, which is where prose belongs anyway.
     *
     * @param message - the line to report.
     */
    private warn;
    /**
     * Record one path's pre-edit state, if there is an agent to attribute it to.
     *
     * The filesystem waterfalls carry an opaque tool-execution context rather
     * than an agent, so the agent comes from the initiator scope the driver
     * established. A mutation with no initiator — a plugin writing on its own
     * account — is not part of any turn and is left alone.
     *
     * @param target - the resolved target about to change.
     */
    private declareTarget;
    /**
     * Resolve the `filesnap` executable once, lazily.
     *
     * Lazily because a deployment that has not installed it should still load:
     * the plugin then refuses each operation with a sentence naming the missing
     * command, which is a better failure than a tree that will not boot.
     *
     * @returns the invoker, or why the command could not be reached.
     */
    private invoker;
    /**
     * Start the one executable lookup this service ever performs.
     *
     * @returns the invoker, or why the command could not be reached.
     */
    private start;
    /**
     * Resolve the command to run, nearest first.
     *
     * 1. What the deployment named, when it named one.
     * 2. The prebuilt binary installed beside this package — the ordinary case,
     *    and the reason nobody has to install anything by hand.
     * 3. A bare `filesnap` on the provider's own PATH. This is the branch that
     *    matters for a subprocess provider whose execution world is not this
     *    machine, where a local `node_modules` path resolves to nothing.
     *
     * Every candidate goes through `resolveExecutable`, which verifies an
     * absolute path in the provider's world rather than this process's — so a
     * bundled path that exists here but not there is rejected and falls through
     * rather than being spawned into a sandbox that cannot see it.
     *
     * @returns the canonical executable path.
     * @throws when no candidate resolves.
     */
    private locate;
    /**
     * The per-session binding and its caches.
     *
     * `captured` is checked against the engine index before capturing: this
     * process may have resumed a session that already captured twenty turns, and
     * recapturing them would file a second manifest under a turn id that already
     * resolves to the first.
     *
     * @param session - the session to look up.
     * @returns its tracking state, created on first use.
     */
    private stateFor;
    /**
     * Capture the workspace as it stands at the start of one turn.
     *
     * Called from an awaited extension point on purpose: a capture that has not
     * finished when the first tool runs is a rewind point that is missing exactly
     * the files the turn is about to change. The cost is the scan's latency once
     * per turn, which is the same trade every per-turn snapshot makes.
     *
     * A failure is reported and swallowed. Refusing to run a turn because a
     * snapshot could not be taken would make an optional safety net into a
     * single point of failure for the whole product.
     *
     * @param agent - the agent whose turn is opening.
     * @param turn - the harness turn number.
     * @param signal - the turn's cancellation signal.
     */
    capture(agent: Agent, turn: number, signal?: AbortSignal): Promise<void>;
    private captureOnce;
    /**
     * Record what paths hold **before** an edit changes them.
     *
     * The caller says what it is about to change and never what the file used to
     * contain: filesnap stats and reads each path itself, so the pre-image rests
     * on an observation rather than a claim (filesnap D30). The cost of that
     * design is that calling late is silently wrong — declare after the write and
     * the stored "pre-image" is the post-edit content, with nothing to tell them
     * apart. Every call site here is on a decision waterfall that runs before the
     * provider mutates anything.
     *
     * @param agent - the agent whose turn owns the edit.
     * @param turn - the harness turn number.
     * @param paths - absolute paths about to change.
     * @param signal - the tool call's cancellation signal.
     */
    declare(agent: Agent, turn: number, paths: readonly string[], signal?: AbortSignal): Promise<void>;
    /**
     * The points this session can be rewound to, newest last.
     *
     * Folded from the log and then intersected with what the store still holds,
     * because the two drift for ordinary reasons — `filesnap delete` ends a
     * session's data, and a store in a format this build does not understand is
     * refused rather than misread.
     *
     * @param agent - the agent whose session is being listed.
     * @param signal - caller cancellation.
     * @returns the available points, or why there are none to offer.
     */
    points(agent: Agent, signal?: AbortSignal): Promise<RewindResult<RewindPoint[]>>;
    /** Resolve snapshot owners from DSH's existing fork prefix, including cold ancestors. */
    private turnOwners;
    /**
     * What the store holds for this workspace, and what it does not protect.
     *
     * **Re-scans.** The engine answers this by walking the tree again rather
     * than reading something a capture stored, because the question is about the
     * project as it stands now, not as it stood at some past turn. That is why
     * nothing calls this per turn: it costs what a capture costs.
     *
     * @param agent - the agent whose workspace is being asked about.
     * @param signal - caller cancellation.
     * @returns the workspace's protection and usage picture, or why it could not be read.
     */
    status(agent: Agent, signal?: AbortSignal): Promise<RewindResult<FilesnapStatus>>;
    /** Plan without forking or changing workspace files. Prepare saves a recovery checkpoint. */
    preview(agent: Agent, selector: string, signal?: AbortSignal): Promise<RewindResult<RewindPreview>>;
    /** Explain store-wide collection; the displayed sizes are usage, not reclaim estimates. */
    previewCleanup(agent: Agent, signal?: AbortSignal): Promise<RewindResult<CleanupPreview>>;
    /** Reclaim unreferenced objects only; never delete sessions or retained recovery points. */
    cleanup(agent: Agent, token: string, signal?: AbortSignal): Promise<RewindResult<CleanupOutcome>>;
    private preparePreview;
    /**
     * Put the workspace and the conversation back to one point.
     *
     * @param agent - the agent being rewound out of.
     * @param selector - a turn number as listed, or a point id verbatim.
     * @param destination - fork here, or file the undo record in a session the caller already forked.
     * @param signal - caller cancellation.
     * @returns what the rewind did, or why it did not happen.
     */
    rewind(agent: Agent, selector: string, destination?: RewindDestination, signal?: AbortSignal, confirmation?: string): Promise<RewindResult<RewindOutcome>>;
    private rewindLocked;
    /**
     * Reverse the rewind that landed in this session.
     *
     * The undo record is filed under the session a rewind switched *to*, which is
     * where the user is standing when they ask for it, and which no other session
     * can reach — so two conversations in one directory cannot consume each
     * other's undos.
     *
     * @param agent - the agent to reverse the rewind in.
     * @param signal - caller cancellation.
     * @returns what the undo did, or why it did not happen.
     */
    previewRedo(agent: Agent, signal?: AbortSignal): Promise<RewindResult<RedoPreview>>;
    private assertWorkspaceIdle;
    recoveryPreview(id: string, mode: 'apply' | 'rollback', signal?: AbortSignal): Promise<import("./wire.ts").RecoveryPreview>;
    recover(token: string, signal?: AbortSignal): Promise<{
        openSession: string;
        id: string;
        cwd: string;
        kind: "rewind" | "redo";
        source: string;
        destination: string;
        createdAt: number;
        phase: "apply" | "rollback";
        changes: RewindPreview["changes"];
    }>;
    private managedRedoPreview;
    redo(agent: Agent, signal?: AbortSignal, token?: string): Promise<RewindResult<RedoOutcome>>;
    private redoLocked;
    /**
     * Fork the conversation at a point's boundary and publish an agent on it.
     *
     * Composition is inherited rather than chosen: the seeded history was
     * produced under the parent's preset and model route, and a child composed
     * differently would replay tool calls it can no longer make.
     *
     * @param agent - the source agent.
     * @param point - the point whose boundary the cut follows.
     * @param signal - creation-only cancellation.
     * @returns the child session id, or why the fork did not happen.
     */
    private forkConversation;
    /**
     * The child's scoped composition, when the deployment composes per session.
     *
     * `agentPresets` is optional, and its absence is the ordinary case for a
     * deployment that mounts one fixed agent. The dynamic import is reached only
     * once the service proves the package is installed.
     *
     * @param source - the session being forked.
     * @returns the preset id to record and the setup that mounts it.
     */
    private composition;
}
export default FilesnapRewind;
/** Re-exported so a consumer can name the log's own event shape. */
export type { SessionEvent };
