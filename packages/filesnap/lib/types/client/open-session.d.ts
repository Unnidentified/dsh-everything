/**
 * Reveal a session in the browser client, across the harness generations this
 * plugin spans.
 *
 * @module
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/**
 * The slice of the client context this helper uses. Structural rather than the
 * full `ClientContext` so the probe stays testable and does not import either
 * side of the service contract it straddles.
 */
export interface NavigationHost {
    /** Resolve one client service by name, or undefined when it is absent. */
    get(name: string): unknown;
    /** Report a refused navigation without failing the operation that asked. */
    logger: {
        warn(format: string, ...args: unknown[]): void;
    };
}
/**
 * Reveal a session, whichever navigation API the client has.
 *
 * Navigation moved out of the session controller: current clients keep the
 * controller's `sessions` surface free of view concerns — "view selection
 * remains outside the Controller" — and expose `uiWorkspace.openSession`
 * instead, while the generation whose `sessions` still carries `open(id)`
 * remains in the supported range. Probe the workspace first, fall back to the
 * controller, and never throw when neither exists: a rewind that already
 * restored files and forked a conversation must not be reported as failed
 * because the client could not switch views.
 *
 * @param host - the client context (service lookup and logging).
 * @param sessions - the injected `sessions` service.
 * @param id - the session to reveal.
 * @returns whether any navigation API accepted the target.
 */
export declare function revealSession(host: NavigationHost, sessions: object, id: SessionId): boolean;
