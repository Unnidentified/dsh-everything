/**
 * The two ids filesnap takes from outside, minted from harness identities.
 *
 * filesnap never generates a turn id (filesnap D6): a turn id is the join key
 * back to the conversation, and minting one severs the only thing it is for.
 * It also refuses an id it cannot use rather than rewriting it (filesnap D7),
 * because a rewrite is what turns a typo into two conversations sharing one
 * undo stack. So the mapping from harness identity to filesnap id belongs
 * here, stated once, and every id this module produces is checked against the
 * same rule the engine applies.
 *
 * @module
 */
/**
 * Why a harness identity cannot become a filesnap id. Carried rather than
 * thrown so the caller can disable tracking for one session and say why,
 * instead of failing a turn over a name it does not control.
 */
export type IdRefusal = {
    readonly reason: 'empty';
} | {
    readonly reason: 'dot-name';
} | {
    readonly reason: 'inadmissible-characters';
} | {
    readonly reason: 'reserved-prefix';
} | {
    readonly reason: 'too-long';
    readonly bytes: number;
};
/** An accepted id, or the reason it was refused. */
export type IdResult = {
    readonly ok: true;
    readonly id: string;
} | {
    readonly ok: false;
    readonly refusal: IdRefusal;
};
/**
 * Apply the engine's own admission rule to a candidate external id.
 *
 * @param candidate - the string about to be handed to `filesnap`.
 * @returns the accepted id, or the reason the engine would refuse it.
 */
export declare function admit(candidate: string): IdResult;
/**
 * The filesnap session id for one harness session.
 *
 * Passed through unchanged rather than hashed or prefixed. A filesnap session
 * is bound to one working directory forever (filesnap D4) and a harness
 * session is too, so the two identities describe the same thing and giving
 * them different names would only make a store hard to read against a
 * transcript.
 *
 * @param sessionId - the harness session id.
 * @returns the accepted filesnap session id, or the reason it was refused.
 */
export declare function sessionId(sessionId: string): IdResult;
/**
 * The filesnap turn id — this plugin calls it a *point* — for one turn of one
 * session.
 *
 * The session has to be in it. A harness turn number is unique only inside its
 * own session, while filesnap's turn index is shared by every session working
 * in one directory (filesnap D19 partitions records per workspace, not per
 * session), so two conversations in one project would both claim `3` and the
 * second would resolve the first's manifest. Forking makes that certain rather
 * than unlikely: a child session inherits its parent's turn numbering.
 *
 * @param session - the accepted filesnap session id that owns the turn.
 * @param turn - the harness turn number.
 * @returns the accepted point id, or the reason it was refused.
 */
export declare function pointId(session: string, turn: number): IdResult;
/**
 * Human-readable reason an id was refused, for the one stderr line that says
 * this session is not being tracked.
 *
 * @param refusal - why the id was refused.
 * @returns a sentence fragment naming the rule the id broke.
 */
export declare function explain(refusal: IdRefusal): string;
