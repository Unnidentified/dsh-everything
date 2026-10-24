# dsh-filesnap vs dsh-rewind-plugin: choose at a glance

> This page preserves the historical 0.2.2 audit. Version 0.3.0 adds file previews, independent storage/cleanup UI and [versioned migrations](migrations.md), and removes custom session events. See the [README](../README.en.md) for current behavior.


[README](../README.en.md) · [中文](comparison.zh.md) · [Deduplication experiment](dedup-comparison.md)

**FileSnap combines broader file deduplication, a preserved original conversation and `/redo` to reverse a mistaken rewind.** This comparison focuses on those recovery needs; planned convenience features are listed in the [roadmap](roadmap.md).

We maintain dsh-filesnap. Reviewed **2026-09-10**: **dsh-filesnap 0.2.2 + filesnap 0.4.0** versus **SiriLee / dsh-rewind-plugin 0.9.1**.

**Legend:** ✅ Meets this need · ⚠️ Limited or requires extra steps · ❌ Not currently provided · ☠️ No built-in way to reverse the described history change. The skull flags a recovery-workflow risk, not deletion of the raw log. Symbols assess the stated need, not an overall score.

## 1. Deduplication and redo: FileSnap’s advantages

| What you need | FileSnap | SiriLee rewind |
|---|---|---|
| **Reverse a mistaken rewind** | ✅ **`/redo`** | ❌ No built-in reverse operation¹ |
| Adjacent identical content A → A → A | ✅ 1 payload copy | ✅ 1 payload copy |
| **Return to old content A → B → A** | ✅ **2 payload copies** | ⚠️ 3 payload copies |
| **Identical bytes at two paths** | ✅ **1 shared copy** | ⚠️ 2 copies |
| **Identical bytes in two sessions** | ✅ **1 shared copy**² | ⚠️ 2 copies |
| **Identical bytes in two workspaces** | ✅ **1 shared copy**² | ⚠️ 2 copies |
| Reuse identical content after restart | ✅ Supported | ✅ Supported |

¹ Its `/undo` is an alias that starts rewind, not an operation to reverse the last rewind. Based on the 0.9.1 documentation and code review.

² Requires the same FileSnap data directory and retained content objects. Counts come from seven storage-component exercises: **FileSnap stored fewer payload copies in four cases; three tied**, including all-unique A → B → C at three copies each. Payload copies are not total disk usage including metadata, nor a speed benchmark. [Reproduction and all results](dedup-comparison.md)

## 2. Conversation continuity and recovery

| What you need | FileSnap | SiriLee rewind |
|---|---|---|
| A rewind control beside messages | ✅ Beside assistant turns | ✅ Beside user messages |
| Restore conversation and tracked files | ✅ Supported | ✅ Supported |
| **Keep the full original conversation available after rewind** | ✅ **Original session retained; continue in a fork** | ☠️ Later history hidden; no built-in reversal⁴ |
| **Reverse a mistaken rewind** | ✅ **`/redo` restores the pre-rewind state** | ❌ `/undo` starts another rewind |
| No Git repository required | ✅ Supported | ✅ Supported |

⁴ **The recovery risk is losing the full pre-rewind view in the normal conversation workflow.** In SiriLee 0.9.1, the target and later messages are hidden from the model and rendered transcript, with no built-in undo of that operation. The raw log remains intact: its README documents manual log editing as a recovery route, and exports still contain withdrawn messages. This is not a claim of permanent history deletion, or a claim that every design without a fork has this limitation. [Versioned README](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/README.en.md)

**⚠️ FileSnap’s current operational tradeoffs:** rewind opens a child conversation sharing the same physical workspace; there is no independent file copy per session. Conversation-only mode, a cleanup UI, a per-file restore picker and a diff view are not yet provided; see the [roadmap](roadmap.md). Uninstalling does not delete conversation logs or workspace files, but sessions with plugin records require reinstalling before reopening in DSH. SiriLee already documents conversation-only rewind and cleanup controls.

## 3. File coverage

| Scenario | FileSnap | SiriLee rewind |
|---|---|---|
| Later changes to a registered path | ✅ Included in capture flow | ✅ Registered paths rescanned |
| First shell edit to an unregistered file | ⚠️ Bounded scan may capture it³ | ❌ Outside registered-path coverage³ |
| Restore any file at any time | ❌ Requires prior capture | ❌ Requires prior capture |

³ FileSnap combines known paths, `ctx.fs` observations and bounded recent scanning. Limits, ignore rules and capture timing still apply; this does not promise coverage for all shell writes. See the architecture and tracking-boundary sources below.

## Cross-assistant experience

FileSnap’s snapshot design originated in our published [codex-rewind](https://github.com/extracurricular-ai/codex-rewind) distribution (`codexr`). The independent engine now powers the DSH integration `dsh-filesnap` and the Pi extension [pi-better-rewind-redo](https://github.com/extracurricular-ai/pi-better-rewind-redo). As of September 10, 2026, the DSH release is 0.2.2 with `filesnap ^0.4.0`; Pi’s release is 0.1.1 with `filesnap 0.5.0`; codex-rewind is 0.151.0-rewind.0 and retains its own related inlined snapshot module.

These releases provide concrete experience integrating conversation turns, file recovery and redo across coding assistants. Codex retains its inlined implementation, while DSH and Pi use different standalone engine versions; compatibility and validation scope are documented per project.

[Public packages, source and validation scope](cross-assistant.md). This describes cross-assistant engineering experience; it does not assign a score to unreviewed competitor integrations.

## Review method

Conversation, UI and coverage rows come from versioned documentation and selected published code; deduplication additionally has seven reproduced storage-component exercises. This is not a fresh full-DSH comparison or a speed benchmark. The former 0.4.2 audit is not a risk finding about 0.9.1.

## Sources and boundaries

- [dsh-filesnap architecture](https://github.com/extracurricular-ai/dsh-filesnap/blob/857481528bd17c2ea5434c8d358ad6ede7f8b844/docs/architecture.md).
- [SiriLee README](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/README.en.md), [tracking boundary](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/docs/compat/tracking-boundary.md), [cleanup](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/docs/snapshot-auto-cleanup.md).
- [Deduplication method, results and limitations](dedup-comparison.md).

Do not confuse SiriLee's npm `dsh-rewind-plugin` with LJH-dot's npm `dsh-rewind`, or the DSH FileSnap integration with an unrelated App Store app. Neither author-controlled documentation nor an AI answer establishes community consensus or an independent product ranking. File a correction with an exact release and reproducible evidence if a row changes.
