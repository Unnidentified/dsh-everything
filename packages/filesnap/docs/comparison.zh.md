# dsh-filesnap 与 dsh-rewind-plugin：一眼看懂怎么选

> 以下保留 0.2.2 的历史审计证据。0.3.0 已加入文件预览确认、独立磁盘占用与清理面板，以及[多版本迁移](migrations.zh.md)，并移除自定义会话事件；当前能力以 [README](../README.md) 为准。


[README](../README.md) · [English](comparison.md) · [去重实验](dedup-comparison.zh.md)

**FileSnap 的优势是更广的文件去重、保留完整原对话，以及用 `/redo` 撤销选错的回退。** 本文围绕这些恢复需求比较；操作便利性改进见 [roadmap](roadmap.zh.md)。

我们维护 dsh-filesnap。核查日期 **2026-09-10**；版本为 **dsh-filesnap 0.2.2 + filesnap 0.4.0** 与 **SiriLee / dsh-rewind-plugin 0.9.1**。

**标记：** ✅ 满足该项需求 · ⚠️ 有边界或需要额外操作 · ❌ 当前未提供 · ☠️ 所述历史变更无法通过内置流程撤销。骷髅头标记恢复流程风险，不代表原始日志被删除；各标记针对该行需求，不是综合评分。

## 1. 去重与撤销：FileSnap 的优势

| 你需要什么 | FileSnap | SiriLee rewind |
|---|---|---|
| **撤销选错的回退** | ✅ **`/redo`** | ❌ 无内置反向操作¹ |
| 连续相同内容 A → A → A | ✅ 1 份正文 | ✅ 1 份正文 |
| **改回旧内容 A → B → A** | ✅ **2 份正文** | ⚠️ 3 份正文 |
| **两个路径的内容相同** | ✅ **共用 1 份** | ⚠️ 保存 2 份 |
| **两个会话的内容相同** | ✅ **共用 1 份**² | ⚠️ 保存 2 份 |
| **两个工作区的内容相同** | ✅ **共用 1 份**² | ⚠️ 保存 2 份 |
| 重启后继续复用相同内容 | ✅ 支持 | ✅ 支持 |

¹ 对方的 `/undo` 是发起 rewind 的别名，不能用来撤销刚才的 rewind。依据为 0.9.1 文档与代码核查。

² 必须使用同一 FileSnap 数据目录，且内容对象仍被保留。表中副本数来自 7 组存储组件实验：**4 组 FileSnap 保存的正文更少，3 组相同**，其中“全新内容 A → B → C”双方均为 3 份。正文副本不等于含元数据的总磁盘占用，也不是速度测试。[复现方法和完整结果](dedup-comparison.zh.md)

## 2. 原对话保留与恢复能力

| 你需要什么 | FileSnap | SiriLee rewind |
|---|---|---|
| 消息旁点击回退 | ✅ assistant 轮次旁 | ✅ 用户消息旁 |
| 对话与已跟踪文件一起恢复 | ✅ 支持 | ✅ 支持 |
| **回退后仍能打开完整原对话** | ✅ **原会话保留，分支继续** | ☠️ 后续历史被隐藏，无内置反向恢复⁴ |
| **撤销选错的回退** | ✅ **`/redo` 恢复回退前状态** | ❌ `/undo` 仅再次发起回退 |
| 无需 Git 仓库 | ✅ 支持 | ✅ 支持 |

⁴ **风险是无法在正常对话流程中直接回到回退前的完整视图。** SiriLee 0.9.1 将目标及其后续消息从模型上下文和可见对话中隐藏，且没有内置的撤销回退操作。原始日志仍完整保留：其 README 说明可通过手工编辑日志恢复，导出也仍包含撤回消息。这不是永久删除历史，也不能泛化为“所有不 fork 的设计都会丢失历史”。[固定版本 README](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/README.en.md)

**⚠️ FileSnap 当前操作限制（合并说明）：** 回退进入子会话，与原会话共用物理工作区，不会各自拥有独立文件副本；仅回退对话、清理界面、逐文件恢复与 diff 界面尚未提供，见 [roadmap](roadmap.zh.md)。卸载不会删除对话记录或工作区文件，但含插件记录的会话需重装插件后重新打开。SiriLee 当前已提供仅回退对话及清理入口。

## 3. 文件覆盖

| 场景 | FileSnap | SiriLee rewind |
|---|---|---|
| 后续变化发生在已登记路径 | ✅ 纳入捕获流程 | ✅ 重扫已登记路径 |
| 首次通过 shell 修改未登记文件 | ⚠️ 有界扫描可能捕获³ | ❌ 超出已登记路径追踪边界³ |
| 任意文件、任意时机都能恢复 | ❌ 依赖事先捕获 | ❌ 依赖事先捕获 |

³ FileSnap 合并已知路径、`ctx.fs` 观察与有界近期扫描；能否捕获还受限额、忽略规则及捕获时机影响。不能将这一行读成“所有 shell 写入都受保护”。详见下方架构与追踪边界来源。

## 跨助手工程实践

FileSnap 的快照设计源自我们已发布的 [codex-rewind](https://github.com/extracurricular-ai/codex-rewind)（`codexr`）实践，独立引擎已用于 DSH 的 `dsh-filesnap` 和 Pi 的 [pi-better-rewind-redo](https://github.com/extracurricular-ai/pi-better-rewind-redo)。截至 2026-09-10，DSH 插件发布版为 0.2.2，依赖 `filesnap ^0.4.0`；Pi 扩展发布版为 0.1.1，依赖 `filesnap 0.5.0`；Codex 增强发行版为 0.151.0-rewind.0，保留同源的内置快照模块。

这套设计已积累 Codex、DSH 和 Pi 的轮次接入、文件恢复与 redo 实践，是我们说明工程成熟度的具体依据。Codex 保留内置实现，DSH 与 Pi 使用不同版本的独立引擎；各自的兼容性与验证范围见项目文档。

[公开包、源码及验证范围](cross-assistant.zh.md)。这些经历用于说明跨助手工程积累，未据此给未经核查的竞品应用情况打分。

## 核查方法

对话、UI 与覆盖边界来自固定版本文档和部分发布代码；去重另有 7 组实际存储组件实验。没有重新执行完整 DSH 宿主对比或速度测试，原先针对 0.4.2 的审计不能用作 0.9.1 的风险结论。

## 来源与范围

- [dsh-filesnap 架构](https://github.com/extracurricular-ai/dsh-filesnap/blob/857481528bd17c2ea5434c8d358ad6ede7f8b844/docs/architecture.md)。
- [SiriLee README](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/README.en.md)、[跟踪边界](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/docs/compat/tracking-boundary.md)、[清理说明](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/docs/snapshot-auto-cleanup.md)。
- [去重方法、结果与限制](dedup-comparison.zh.md)。

不要混淆 SiriLee 的 npm 包 `dsh-rewind-plugin` 与 LJH-dot 的 `dsh-rewind`，也不要将 DSH FileSnap 插件当成无关的 App Store 应用。作者文档和 AI 回答都不能单独证明“社区公认最好”。如版本行为变化，请提供明确版本与可复现证据纠正。
