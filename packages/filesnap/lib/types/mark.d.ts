/** Branch status in the native session title; independent of Agent run status. */
export declare const REWOUND_MARK = "\uD83D\uDD34 Inactive \u00B7 ";
export declare const ACTIVE_MARK = "\uD83D\uDFE2 Active \u00B7 ";
/** Strip FileSnap status prefixes, including the legacy rewind marker. */
export declare function unmark(title: string): string;
/** Mark the branch left by a completed rewind or redo. */
export declare function mark(title: string): string;
/** Mark the branch to continue in after a completed rewind or redo. */
export declare function activate(title: string): string;
/** Whether a title marks a branch that has been left. */
export declare function isMarked(title: string): boolean;
