/** Node's one-shot decoder reads one frame; DSH appends multiple frames. */
export declare function decodeArtifact(bytes: Buffer, compressed: boolean): string;
/** Preserve rows, sequence numbers, fork boundaries and all message content. */
export declare function repairArtifact(bytes: Buffer, compressed: boolean): {
    bytes: Buffer;
    events: number;
};
/** Append a native title revision; preserve every prior event and fork boundary. */
export declare function migrateStatusTitles(bytes: Buffer, compressed: boolean): {
    bytes: Buffer;
    events: number;
};
/** Dry-run by default; writes require all DSH processes using this root to be stopped. */
export declare function migrateFile(path: string, write?: boolean, expectedHash?: string, transform?: typeof repairArtifact): Promise<{
    path: string;
    events: number;
    backup?: string;
}>;
