# dsh-filesnap 与 dsh-rewind-plugin：文件去重对比

[README](../README.md) · [English](dedup-comparison.md) · [使用方式对比](comparison.zh.md)

**结论：在本次核查的版本中，dsh-filesnap 的内容复用范围更广。** 相同文件内容可以跨路径、跨非相邻版本、跨会话，以及同一 FileSnap 数据目录下的工作区复用。双方都能对连续相同内容去重，不能宣传成“对方没有去重”。

我们是 dsh-filesnap 的维护者。核查日期：**2026-09-10**。版本：**dsh-filesnap 0.2.2**、其兼容的 **filesnap 0.4.0** 引擎，以及 **dsh-rewind-plugin 0.9.1**。npm 同时已有 filesnap 0.5.0，但它不在插件 `^0.4.0` 依赖范围内，本次没有用它替代旧引擎。后续版本需重新核查。

## 先分清比较对象

- `dsh-filesnap`，展示名 **DSH Rewind & Redo — by FileSnap**，是 DSH 插件：接入轮次生命周期、提供 Web UI 回退按钮、联动恢复对话与已跟踪文件，并支持 `/redo`。
- `filesnap` 是它使用的 Rust 快照引擎。引擎与宿主集成分层，不代表插件“不理解对话”。
- App Store 的 **File Converter — FileSnap** 是无关的同名应用。
- 本文 `dsh-rewind-plugin` 指 **SiriLee/dsh-rewind**，不是 LJH-dot 另行发布的 `dsh-rewind` 包。

## 源码中的去重方式

**FileSnap：** 用完整文件内容的 SHA-256 标识 blob。相同字节再次写入时复用已有对象；工作区 manifest 引用这些对象，同一数据目录下的工作区共享内容存储。这是应用层的整文件内容寻址，不是文件系统块级去重，也不是全盘镜像。大文件即使只改一个字符，仍可能新增一份完整文件内容。

**dsh-rewind-plugin：** `SnapshotStore.lastEntry` 用 `sessionId + path` 作索引。`recordEntry` 将新的 `before` 字符串与该索引最近的内容比较：相同则存 `ref`，否则存新正文；重启后从保留的磁盘记录中恢复索引。引用可以形成链，保留策略会处理这些引用关系。

这里比较的是**同一会话、同一路径的最近记录**，不一定是紧邻的上一轮 DSH 对话。“按对话事件记录”本身不能证明其去重比内容寻址更节省存储。

## 已复现的存储场景

每组使用全新存储，内容为 64 KiB ASCII 文本。下表统计**文件正文副本数**，不包括 manifest、记录元数据、文件系统分配和清理策略的影响。A、B 是不同的完整内容，最后一个 A 与最初 A 字节相同。

| 场景 | FileSnap 0.4.0 正文副本 | dsh-rewind-plugin 0.9.1 正文副本 |
|---|---:|---:|
| 同会话、同路径，A → A → A | 1 | 1，另有 2 条引用 |
| 同会话、同路径，A → B → A | **2** | 3 |
| 两个路径内容相同 | **1** | 2 |
| 两个会话内容相同 | **1** | 2 |
| 两个工作区共享数据目录、内容相同 | **1** | 2 |
| 三份内容都不同 | 3 | 3 |
| 重新打开存储后再次记录相同内容 | 1 | 1，另有 1 条引用 |

FileSnap 的 blob 按预期 SHA-256 与字节核对；对方每条记录通过自身 `resolveBefore` 解引用后与输入核对，包括引用链。核查通过的是存储内容的解析，不是 DSH 对话回退或完整恢复流程。

**这证明什么：** FileSnap 的复用范围更广，在上述四种重复内容场景里正文副本更少。复用要求对应内容仍保留在共享存储中；不同数据目录之间不会共享 blob。

**这没有证明什么：** 所有场景的总空间比例、捕获更快、恢复更快、压缩更强，或者产品整体“最好”。两边都有元数据，工作负载、排除项与清理策略也会影响总量。本次没有测试二进制文件恢复或完整 DSH 界面；R01–R06 端到端比较仍单独跟踪。

## 复现与证据

Linux x64 / Node.js 的完整下载和执行步骤见 [英文复现说明](dedup-comparison.md#reproduce-and-inspect)。

[实验脚本](https://github.com/extracurricular-ai/dsh-filesnap/blob/main/scripts/compare-dedup.mjs) 调用真实发布的 FileSnap CLI，并提取对方发布包中的 `SnapshotStore` 模块。只适配默认宿主目录解析器；测试始终传入显式临时目录。去重、磁盘记录、引用解析和正常清理代码没有改写，不读取真实 DSH 数据。这是存储组件实验，不是两个完整插件在宿主中运行的测试。

[结果与发布包校验值](https://github.com/extracurricular-ai/dsh-filesnap/blob/main/docs/evidence/dedup-2026-09-10.json) 保存了输入、捕获输出、计数和环境。被执行的已安装 0.4.0 引擎与新下载的同版发布二进制逐字节一致。

固定版本源码：

- [FileSnap 内容哈希与复用](https://github.com/extracurricular-ai/filesnap/blob/320c42877cd260f7dcd836f75c971785434af29d/crates/filesnap/src/blob.rs)、[跨工作区共享布局](https://github.com/extracurricular-ai/filesnap/blob/320c42877cd260f7dcd836f75c971785434af29d/crates/filesnap/src/workspace.rs)。
- [SiriLee 快照实现](https://github.com/SiriLee/dsh-rewind/blob/c059e38ceb8e3da087387bcb808796461aa6064c/src/snapshot.ts)；实际测试的是 [npm 0.9.1](https://registry.npmjs.org/dsh-rewind-plugin/0.9.1) 的 `lib/index.js`，关键方法为 `recordEntry` 与 `resolveBefore`。
- [dsh-filesnap 轮次与对话集成](https://github.com/extracurricular-ai/dsh-filesnap/blob/857481528bd17c2ea5434c8d358ad6ede7f8b844/docs/architecture.md)。
