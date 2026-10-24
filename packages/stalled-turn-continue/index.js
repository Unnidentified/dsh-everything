/**
 * Covers the one turn-ending class `dsh-client-auto-continue` does not watch:
 * a turn that ends successfully while producing no visible output.
 *
 * Why this exists
 * ---------------
 * A model sometimes emits a reasoning block and then its end-of-turn token, with no
 * text part and no tool call. The engine reports a normal stop
 * (`finish_reason: stop`, zero tool calls), and DSH records
 * `turn/end -> { reason: { kind: "completed" } }`. That is a successful completion,
 * so `dsh-client-auto-continue` (which owns `error`, `interrupted`, `max-tokens` and
 * `host/agent-error`) stays silent, and nothing resumes the work. The symptom is an
 * agent that stops mid-thought and waits for a hand-typed "continue".
 *
 * A DSH build that classifies this turn itself records `kind: "no-visible-output"`
 * instead of `completed`; the plugin treats both kinds the same.
 *
 * What it does
 * ------------
 * Subscribes to the host `session/event` stream. When a turn ends `completed` or
 * `no-visible-output` and the last assistant message carried neither a `text` part
 * nor a tool call, it waits `graceMs` (the host may start its own turn), then sends
 * one follow-up through the agent registry — the channel auto-continue uses.
 *
 * It never touches `error`, `interrupted`, `max-tokens`, `aborted` or `blocked`, so it
 * does not duplicate auto-continue. It is a no-op whenever a turn ends with output.
 *
 * Bounds: `maxConsecutive` (default 3) and `cooldownMs` (default 20 s) stop a model
 * that stalls on every turn from looping; a user message and any turn with visible
 * output reset the counter.
 */

import { randomUUID } from "node:crypto";

const DEFAULTS = {
  enabled: true,
  graceMs: 3000,
  cooldownMs: 20000,
  maxConsecutive: 3,
  continueText:
    "Continue. Your previous turn ended with internal reasoning only — no message and no tool call — " +
    "so nothing reached the user. Always finish a turn with either a tool call or a visible answer.",
};

/** `turn/end` reason kinds that mean "the turn ended normally", in current and proposed DSH. */
const SILENT_END_KINDS = new Set(["completed", "no-visible-output"]);

/** Whether an assistant message delivered anything the user or the loop can act on. */
function hasVisibleOutput(message) {
  const content = message === undefined || message === null ? undefined : message.content;
  if (!Array.isArray(content)) return false;
  return content.some(
    (part) =>
      part !== null &&
      typeof part === "object" &&
      (part.type === "text" || part.type === "tool-call" || part.type === "tool_call"),
  );
}

/** The persisted turn/end reason kind, or undefined when it is not a plain object. */
function reasonKindOf(event) {
  const reason = event.data === undefined ? undefined : event.data.reason;
  if (reason === null || typeof reason !== "object") return undefined;
  return typeof reason.kind === "string" ? reason.kind : undefined;
}

export const name = "stalled-turn-continue";

export const inject = ["agents"];

/**
 * Mounts the watcher.
 * @param {object} ctx Cordis context with the `agents` registry injected.
 * @param {object | undefined} config Row config; unset keys take `DEFAULTS`.
 */
export function apply(ctx, config) {
  const settings = { ...DEFAULTS, ...(config === null || config === undefined ? {} : config) };
  if (settings.enabled === false) {
    console.error("[stalled-turn-continue] disabled by config");
    return;
  }

  /** sessionId -> per-session bookkeeping. */
  const states = new Map();
  const stateOf = (sessionId) => {
    let state = states.get(sessionId);
    if (state === undefined) {
      state = {
        lastOutputHadContent: false,
        consecutive: 0,
        lastAttemptAt: 0,
        timer: undefined,
        ownMessageIds: new Set(),
      };
      states.set(sessionId, state);
    }
    return state;
  };

  const log = (message) => console.error(`[stalled-turn-continue] ${message}`);

  const cancelPending = (state, why) => {
    if (state.timer === undefined) return;
    clearTimeout(state.timer);
    state.timer = undefined;
    log(`cancelled pending resume (${why})`);
  };

  const send = (sessionId, state, why) => {
    state.timer = undefined;
    const agent = ctx.agents.get(sessionId);
    if (agent === undefined) {
      log(`skip ${sessionId} (${why}): no live agent`);
      return;
    }
    if (Date.now() - state.lastAttemptAt < settings.cooldownMs) {
      log(`skip ${sessionId} (${why}): inside the cooldown window`);
      return;
    }
    if (state.consecutive >= settings.maxConsecutive) {
      log(`skip ${sessionId} (${why}): ${state.consecutive} consecutive resumes, waiting for a human`);
      return;
    }
    const message = {
      id: randomUUID(),
      role: "user",
      content: [{ type: "text", text: settings.continueText }],
      source: { kind: "user" },
    };
    state.ownMessageIds.add(message.id);
    try {
      agent.followup(message);
    } catch (error) {
      state.ownMessageIds.delete(message.id);
      log(`followup failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    state.consecutive += 1;
    state.lastAttemptAt = Date.now();
    log(`resumed ${sessionId} (${why}); consecutive=${state.consecutive}`);
  };

  const onTurnEnd = (sessionId, event) => {
    const state = stateOf(sessionId);
    cancelPending(state, "new turn/end");
    const kind = reasonKindOf(event);
    if (kind === undefined || !SILENT_END_KINDS.has(kind)) return;

    // A turn that produced visible output is real progress.
    if (state.lastOutputHadContent) {
      state.consecutive = 0;
      return;
    }
    log(`turn ${event.data.turn} ended ${kind} with no visible output in ${sessionId}; arming resume`);
    state.timer = setTimeout(() => {
      try {
        send(sessionId, stateOf(sessionId), `${kind}:no-output`);
      } catch (error) {
        log(`resume threw: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, settings.graceMs);
  };

  const onAssistantMessage = (sessionId, event) => {
    const state = stateOf(sessionId);
    state.lastOutputHadContent = hasVisibleOutput(event.data === undefined ? undefined : event.data.message);
    // A new step is running, so any armed resume is stale.
    if (state.lastOutputHadContent) cancelPending(state, "visible output");
  };

  const onUserMessage = (sessionId, event) => {
    const state = stateOf(sessionId);
    const id = event.data === undefined ? undefined : event.data.id;
    if (id !== undefined && state.ownMessageIds.has(id)) {
      state.ownMessageIds.delete(id);
      return; // our own echo is not a human intervention
    }
    state.consecutive = 0;
    cancelPending(state, "user message");
  };

  ctx.on("session/event", (session, event) => {
    try {
      if (session === null || session === undefined || typeof session.id !== "string") return;
      const type = event === undefined ? undefined : event.type;
      if (type === "turn/start") {
        cancelPending(stateOf(session.id), "host started its own turn");
        return;
      }
      if (type === "turn/end") return onTurnEnd(session.id, event);
      if (type === "assistant/message") return onAssistantMessage(session.id, event);
      if (type === "user/message") return onUserMessage(session.id, event);
    } catch (error) {
      log(`session/event handler failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  log(
    `watching; grace=${settings.graceMs}ms cooldown=${settings.cooldownMs}ms maxConsecutive=${settings.maxConsecutive}`,
  );
}
