# Cross-assistant integration experience

> The release and project relationships below are the September 10, 2026 record. Current 0.3.0 source upgrades the engine and uses independent UI; see the [README](../README.en.md).

FileSnap’s snapshot design originated in our published [codex-rewind](https://github.com/extracurricular-ai/codex-rewind) distribution (`codexr`). The independent engine now powers the DSH integration `dsh-filesnap` and the Pi extension [pi-better-rewind-redo](https://github.com/extracurricular-ai/pi-better-rewind-redo). As of September 10, 2026, the DSH release is 0.2.2 with `filesnap ^0.4.0`; Pi’s release is 0.1.1 with `filesnap 0.5.0`; codex-rewind is 0.151.0-rewind.0 and retains its own related inlined snapshot module.

This provides cross-assistant integration and release experience. Codex is the design’s origin, not a direct consumer of the current standalone engine. These projects do not all use one engine version or automatically share fixes; this is not evidence of host-vendor endorsement, independent third-party adoption, or a measured lower failure rate.

## Sources / 来源

- [Pi 0.1.1 manifest](https://registry.npmjs.org/pi-better-rewind-redo/0.1.1), [versioned README and validation scope](https://github.com/extracurricular-ai/pi-better-rewind-redo/blob/cb6626b66a8173d52df07bbbf3259eca5c4eb65d/README.md).
- [Codex distribution npm release](https://registry.npmjs.org/codex-rewind/0.151.0-rewind.0), [core dependency](https://github.com/extracurricular-ai/codex-rewind/blob/be51ad3df2d943318958e964c62bf93fd630c697/codex-rs/core/Cargo.toml), [inlined snapshot crate](https://github.com/extracurricular-ai/codex-rewind/blob/be51ad3df2d943318958e964c62bf93fd630c697/codex-rs/file-snapshots/Cargo.toml). The code links record repository HEAD at review; npm does not report a gitHead for that release.
- [FileSnap describes the Codex ancestry](https://github.com/extracurricular-ai/filesnap/blob/ce389dbc3c422116c0c7fa05907e29b641f838b1/README.md).

Pi’s published README describes tests using the real CLI, session manager and native file tools, including repeated writes, multi-level redo, restart and recovery. This review checked manifests and source/documentation; it did not rerun Pi or Codex end-to-end tests.
