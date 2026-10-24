/**
 * The published composer state, under either generation's attachment name.
 *
 * The input state renamed its attachment list between the generations this
 * plugin spans: `imageIds` in the train this plugin was built against,
 * `attachmentIds` in the desktop client now shipping. Reading only the old
 * name throws on the current state, and the warning that catches it is the
 * only trace — the composer of the reopened branch stays empty.
 */
export interface RefillState {
    readonly draft: string;
    readonly phase: string;
    /** Current-name attachment list (the desktop line). */
    readonly attachmentIds?: readonly unknown[];
    /** Older-name attachment list (the train this plugin was built against). */
    readonly imageIds?: readonly unknown[];
}
/** Fill only an idle, empty child composer; never replace a newly written draft. */
export declare function refillPrompt(input: {
    state: {
        getSnapshot(): RefillState;
    };
    setDraft(text: string): void;
}, text: string | undefined): boolean;
