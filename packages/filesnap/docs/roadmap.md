# Roadmap

[README](../README.en.md) · [中文](roadmap.zh.md)

## Implemented in 0.3.0

- File list preview and confirmation with a fresh state check before restore.
- Independent workspace snapshot panel: records/shared content usage, session counts and unprotected files.
- Confirmed manual collection of unreferenced data, preserving snapshots and redo recovery.
- Versioned migrations in Settings; the first task repairs legacy uninstall compatibility.
- No custom session events; browser buttons use independent RPC.
- Full prompt refill in an empty composer.

## Planned

| Priority | Improvement | Boundary |
|---|---|---|
| P1 | Retention policies and optional automatic cleanup | Age/count/space limits and protected sessions, with explicit previews of recovery points to be removed. |
| P1 | Session snapshot deletion and health checks | Current cleanup collects only unreferenced objects; no session-delete or engine doctor UI yet. |
| P1 | Line-level diffs | Current preview shows paths and actions. |
| P2 | Conversation-only mode | Define branch/redo semantics when files stay unchanged. |
| P2 | Per-file restore | Explain partial conversation/file consistency. |
| P2 | More shortcuts and command navigation | Dialogs support Escape, Tab and Enter; no new global shortcuts. |

These are plans, not existing capabilities or release-date commitments. Future format migrations reuse the [shared entry](migrations.md), with source-specific adapters and tests.
