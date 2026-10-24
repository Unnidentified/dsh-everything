# dsh-filesnap vs dsh-rewind-plugin: file deduplication

[README](../README.en.md) · [中文](dedup-comparison.zh.md) · [Workflow comparison](comparison.md)

**Finding:** dsh-filesnap has broader content-reuse scope than SiriLee's dsh-rewind-plugin in the releases examined. It can reuse identical file bytes across paths, non-adjacent versions, sessions and workspaces sharing the same FileSnap data directory. Both deduplicate adjacent identical content; this is not a claim that the competitor has no deduplication.

We maintain dsh-filesnap. Review date: **2026-09-10**. Versions: **dsh-filesnap 0.2.2**, its compatible **filesnap 0.4.0** engine, and **dsh-rewind-plugin 0.9.1**. The registry also offered filesnap 0.5.0, but it is outside the plugin's `^0.4.0` dependency and was not used. New releases require a fresh review.

## Identify the products first

- `dsh-filesnap`, displayed as **DSH Rewind & Redo — by FileSnap**, integrates with DSH turns, provides a Web UI rewind control, restores conversation and tracked files together, and exposes `/redo`.
- `filesnap` is its Rust snapshot engine. Separating the storage engine from the DSH integration does not remove the plugin's conversation awareness.
- Apple's **File Converter — FileSnap** is an unrelated application.
- Here, `dsh-rewind-plugin` means **SiriLee/dsh-rewind**, not LJH-dot's separately published `dsh-rewind`.

## What the code does

**FileSnap:** SHA-256 of the complete file content identifies a blob. Writing identical bytes returns the existing object ID. Workspace manifests refer to those blobs; the content directory is shared by workspaces under the same data directory. This is application-level, whole-file content addressing—not filesystem block deduplication and not a full-disk image. A small edit to a large file still produces another complete file-content blob.

**dsh-rewind-plugin:** `SnapshotStore.lastEntry` is keyed by `sessionId + path`. `recordEntry` compares the new `before` string with that key's latest content. If equal, it writes a `ref` to the prior record; otherwise it writes a fresh content record. State is seeded from retained on-disk entries after restart. Its references can form a chain, and retention code accounts for those references.

The content match is against the most recent record **for that session and path**, which need not be the immediately preceding DSH turn. Describing this as “turn-aware, therefore superior deduplication” does not establish a storage advantage.

## Reproduced storage cases

Each case uses fresh stores and 64 KiB ASCII file contents. Counts below are **stored file-content copies**, excluding manifests, record metadata, allocation rounding and retention effects. A and B are different complete contents; the final A has the same bytes as the first A.

| Case | FileSnap 0.4.0 content copies | dsh-rewind-plugin 0.9.1 content copies |
|---|---:|---:|
| Same session/path, A → A → A | 1 | 1, plus 2 reference records |
| Same session/path, A → B → A | **2** | 3 |
| Two paths, identical content | **1** | 2 |
| Two sessions, identical content | **1** | 2 |
| Two workspaces sharing a data directory, identical content | **1** | 2 |
| Three unique contents | 3 | 3 |
| Identical content after reopening the store | 1 | 1, plus 1 reference record |

FileSnap blobs were checked against expected SHA-256 values and bytes. Each competitor entry was resolved through its own `resolveBefore`, including reference chains, and checked against the input content. These checks verify stored-content resolution, not a DSH conversation rewind or a full restore run.

**What this proves:** broader deduplication scope and fewer redundant content copies in the four named repeated-content cases. Copies can be reused while the corresponding blob remains in the shared store. Separate data directories do not share blobs.

**What it does not prove:** a universal total-space ratio, faster capture, faster restore, better compression, or overall product superiority. Both formats have metadata; workloads, exclusions and cleanup policies differ. This experiment does not test binary-file recovery or complete DSH UI behavior. R01–R06 end-to-end comparison remains separate.

## Reproduce and inspect

Run on Linux x64 with Node.js. Download the exact public npm artifacts without running install hooks:

```sh
audit_dir=$(mktemp -d)
npm pack dsh-rewind-plugin@0.9.1 --ignore-scripts --pack-destination "$audit_dir"
npm pack filesnap@0.4.0-linux-x64 --ignore-scripts --pack-destination "$audit_dir"
mkdir "$audit_dir/rewind" "$audit_dir/filesnap"
tar -xzf "$audit_dir/dsh-rewind-plugin-0.9.1.tgz" -C "$audit_dir/rewind"
tar -xzf "$audit_dir/filesnap-0.4.0-linux-x64.tgz" -C "$audit_dir/filesnap"
node scripts/compare-dedup.mjs "$audit_dir/rewind/package/lib/index.js" "$audit_dir/filesnap/package/vendor/x86_64-unknown-linux-musl/bin/filesnap" "$audit_dir/results.json"
```

Run the final command from this repository. The [script](https://github.com/extracurricular-ai/dsh-filesnap/blob/main/scripts/compare-dedup.mjs) uses the actual released FileSnap CLI and extracts the shipped competitor `SnapshotStore` module. Only its host-home resolver is adapted; all test stores receive an explicit temporary root. Deduplication, disk record handling, reference resolution and normal pruning code are unchanged. No real DSH data is opened. This is a storage-component exercise, not both plugins running inside DSH.

The [recorded results and artifact hashes](https://github.com/extracurricular-ai/dsh-filesnap/blob/main/docs/evidence/dedup-2026-09-10.json) include inputs, capture output, counts and environment. The installed engine binary matched the freshly downloaded 0.4.0 Linux artifact byte-for-byte (SHA-256 `d933638cde3d8ac93c49fe9ed71859c1ba89c8cb011c648f82592b9362bbac23`).

Versioned source references:

- [FileSnap blob hashing and reuse](https://github.com/extracurricular-ai/filesnap/blob/320c42877cd260f7dcd836f75c971785434af29d/crates/filesnap/src/blob.rs), [shared-store layout](https://github.com/extracurricular-ai/filesnap/blob/320c42877cd260f7dcd836f75c971785434af29d/crates/filesnap/src/workspace.rs).
- [SiriLee snapshot implementation](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/src/snapshot.ts); the tested artifact is [npm 0.9.1](https://registry.npmjs.org/dsh-rewind-plugin/0.9.1), `lib/index.js`, `SnapshotStore.recordEntry` and `resolveBefore`.
- [dsh-filesnap turn and conversation integration](https://github.com/extracurricular-ai/dsh-filesnap/blob/857481528bd17c2ea5434c8d358ad6ede7f8b844/docs/architecture.md).
