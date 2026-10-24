# Interrupted restores

[README](../README.en.md) · [中文](recovery.zh.md)

Starting with 0.4.0, new rewinds and their redo operations save a named rescue checkpoint and independent recovery record before changing files. Restart the plugin after a host exit, terminated process, timeout or partial restore failure to resolve the operation from Settings.

## Controls

Open **DSH Settings → FileSnap → Interrupted restores**. The original conversation need not be open.

1. Select an unfinished rewind or redo and preview continuing or rolling back.
2. Review files to restore or delete. Preview saves checkpoints without changing workspace files.
3. Confirm, then open the corresponding conversation when finished. Existing branches are preserved.

Continue reaches the original target; rollback returns to the state before this operation. Once rollback starts, an interruption can only be followed by another rollback. If files already reached the target but the host lost the result, confirmation finalizes bookkeeping without spending redo twice.

Pending recovery blocks new Agent steps, observed edits and rewind/redo in that workspace. Plugin cleanup waits until pending operations are resolved.

![Interrupted restore preview with files to restore or delete and confirmation (0.4.0, Chinese UI)](../assets/screenshots/v0.4.0/09-interrupted-restore.png)

## Conflicts and limits

Preview checks current file contents and permissions. A file matching neither the pre-operation state nor the target is a conflict and disables confirmation. Confirmation checks again. Preserve new edits separately before resolving conflicts; preview does not discard them.

![Later edits are listed as conflicts and disable confirmation (0.4.0, Chinese UI)](../assets/screenshots/v0.4.0/10-recovery-conflict.png)

- Changed `.filesnapignore` rules refuse recovery. Restore the originally confirmed text, then preview again. This also applies when the interrupted operation changed the ignore file. The released engine's `prepare` reads current rules only; the plugin refuses to confirm an incomplete list.
- Use one DSH process per workspace and stop external editors, scripts and other assistants writing during restoration. The plugin checks running Agents in its process; it is not a cross-process or filesystem transaction lock.
- Recovery requires a local workspace, the rescue checkpoint and its source session's snapshot references. Do not manually remove those engine records.
- This handles process interruption, not atomic multi-file recovery after machine power loss. Plugin records use flush and atomic replacement; snapshot durability still depends on the existing engine and filesystem.
- Rewinds created before upgrading retain the legacy engine undo path. Recovery records cannot be reconstructed retroactively. The new workflow covers rewinds created by this version and their redo operations.

## Storage and compatibility

Recovery metadata lives under `dsh-filesnap/recovery-v1/` in configured `dataDir`, or the platform data directory by default. It contains only targets, rescue references, path states, branch identities and redo stacks. Completion clears pending state and commits redo bookkeeping in one replacement.

It never enters DSH conversation artifacts. Conversations remain readable after uninstalling the plugin; reinstall with the original data directory to recover pending file operations. Corrupt or unknown-version records refuse mutation rather than being guessed at.

The engine remains FileSnap 0.5.1+, using `prepare`, `restore` and explicitly supplied ignore rules. Engine `doctor` still checks locking and clears temporary residue; it does not orchestrate this host recovery workflow.
