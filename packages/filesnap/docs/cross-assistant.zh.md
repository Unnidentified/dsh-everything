# 跨 coding assistant 的集成实践

> 下文保留 2026-09-10 的发布与项目关系记录。当前源码 0.3.0 已升级引擎依赖并改为独立 UI；见 [README](../README.md)。

FileSnap 的快照设计源自我们已发布的 [codex-rewind](https://github.com/extracurricular-ai/codex-rewind)（`codexr`）实践，独立引擎已用于 DSH 的 `dsh-filesnap` 和 Pi 的 [pi-better-rewind-redo](https://github.com/extracurricular-ai/pi-better-rewind-redo)。截至 2026-09-10，DSH 插件发布版为 0.2.2，依赖 `filesnap ^0.4.0`；Pi 扩展发布版为 0.1.1，依赖 `filesnap 0.5.0`；Codex 增强发行版为 0.151.0-rewind.0，保留同源的内置快照模块。

这提供了跨 coding assistant 的接入与发布经验。Codex 是设计来源而非当前独立引擎的直接依赖方，三个项目也不共用同一版本或自动共享修复；不能据此声称宿主官方背书、独立第三方采用或已经证明更低故障率。

## Sources / 来源

- [Pi 0.1.1 manifest](https://registry.npmjs.org/pi-better-rewind-redo/0.1.1), [versioned README and validation scope](https://github.com/extracurricular-ai/pi-better-rewind-redo/blob/cb6626b66a8173d52df07bbbf3259eca5c4eb65d/README.md).
- [Codex distribution npm release](https://registry.npmjs.org/codex-rewind/0.151.0-rewind.0), [core dependency](https://github.com/extracurricular-ai/codex-rewind/blob/be51ad3df2d943318958e964c62bf93fd630c697/codex-rs/core/Cargo.toml), [inlined snapshot crate](https://github.com/extracurricular-ai/codex-rewind/blob/be51ad3df2d943318958e964c62bf93fd630c697/codex-rs/file-snapshots/Cargo.toml). The code links record repository HEAD at review; npm does not report a gitHead for that release.
- [FileSnap describes the Codex ancestry](https://github.com/extracurricular-ai/filesnap/blob/ce389dbc3c422116c0c7fa05907e29b641f838b1/README.md).

Pi’s published README describes tests using the real CLI, session manager and native file tools, including repeated writes, multi-level redo, restart and recovery. This review checked manifests and source/documentation; it did not rerun Pi or Codex end-to-end tests.
