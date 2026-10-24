/** Branch status in the native session title; independent of Agent run status. */
export const REWOUND_MARK = '🔴 Inactive · ';
export const ACTIVE_MARK = '🟢 Active · ';
const LEGACY_MARK = '↩ ';
/** Strip FileSnap status prefixes, including the legacy rewind marker. */
export function unmark(title) {
    let value = title;
    for (;;) {
        const prefix = [REWOUND_MARK, ACTIVE_MARK, LEGACY_MARK].find(mark => value.startsWith(mark));
        if (prefix === undefined)
            return value;
        value = value.slice(prefix.length);
    }
}
/** Mark the branch left by a completed rewind or redo. */
export function mark(title) { return `${REWOUND_MARK}${unmark(title)}`; }
/** Mark the branch to continue in after a completed rewind or redo. */
export function activate(title) { return `${ACTIVE_MARK}${unmark(title)}`; }
/** Whether a title marks a branch that has been left. */
export function isMarked(title) { return title.startsWith(REWOUND_MARK) || title.startsWith(LEGACY_MARK); }
