# Preview and confirm file changes before rewind

[README](../README.en.md) · [中文](rewind-preview.zh.md)

Included in version 0.3.0. The dependency is now `filesnap ^0.5.0`. Both the message action and `/rewind` preview first, retaining the existing fork and `/redo` behavior.

1. Click the rewind action beside an assistant turn to open the preview dialog.
2. Check the target turn and complete file list. **Write / restore** covers overwriting existing files and restoring missing ones. **Delete** removes paths explicitly recorded absent in the target snapshot. Unchanged files are omitted.
3. Confirm to rewind the conversation and files. Cancel or Esc closes the dialog. Tab moves between controls; Enter activates the focused button.

An empty file list still requires confirmation to rewind the conversation. Failed or incomplete previews and unsupported engines disable confirmation; refresh the preview to retry.

Commands also use two steps:

```text
/rewind 3
/rewind <point id from preview> --confirm <token from preview>
```

The first command only previews. Cancel by omitting the second command. Tokens belong to one session and point, expire after five minutes and are single-use. Restarting requires a fresh preview. `--into` cannot bypass confirmation.

Preview saves a recovery checkpoint in the snapshot store, without restoring workspace files or creating a conversation branch. Confirmation captures and compares the current state again. Changed files, turn or ignore rules require a fresh preview. This does not lock external editors or other processes; a concurrency window remains between the final check and writes.

After browser confirmation, the host creates a branch before restoring files. If the host then refuses restoration, the dialog shows the error and keeps the original conversation open; the already-created child can remain in the session list. Partial file failures retain the rescue and pending state; resolve them in Settings → FileSnap → Interrupted restores before another rewind or redo.

The list shows paths and actions, not line-by-line diffs. It does not add per-file selection, conversation-only mode or a new global shortcut. Preview does not extend snapshot coverage; `/rewind status` explains that coverage.
