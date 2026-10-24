# dsh-filesnap 架构说明

[README](../README.md) · [English](architecture.md)

## 两层职责

FileSnap 引擎负责有界扫描、内容寻址去重、文件还原、undo 救援数据和垃圾回收。DSH 插件负责捕获时机、原生分支边界、文件预览和界面交互。引擎 JSON Lines 输出只供本次调用读取，不写进聊天历史。

## 捕获与覆盖

`agent/pre-step` 在模型请求和工具运行前等待捕获完成。`fs/write-intent` 与 `fs/edit-intent` 使用 prepend 观察写入前内容，然后继续交给宿主策略决定。覆盖跟随 `ctx.fs`，不按工具名白名单判断；shell 等接口外变化依赖后续轮次的有界扫描。

跟踪集合包括已知文件、观察过的路径和有界近期扫描。忽略规则、大小上限与捕获时机仍会限制范围。相同内容通过 manifest 引用复用，缺失文件的 tombstone 才授权删除。捕获失败不阻塞模型，但该轮不提供快照；恢复失败逐文件报告。

## 原生轮次与快照索引

本版不写任何自定义会话事件。必要的中断恢复状态和 redo 引用独立存放，不属于聊天操作流水。通过 DSH 的 `turn/start`、原生消息、`parentSession` 和 `inheritedEventCount` 判断某个轮次由哪个会话创建，再与引擎的快照索引关联。进入分支时保留祖先的 point id；分支自己的新轮次使用分支 id，避免相同轮次编号串线。

冷祖先在 0.1.x 通过 `sessionPersistence.inspect` 读取，在 0.2.x 通过 `sessionPersistence.open` 打开的只读句柄读取，并始终关闭句柄。迁移枚举兼容原始 header 列表和 header 快照，原始日志路径由后端 locator 提供。祖先会话或快照被删除后，继承恢复点可能无法解析，因此应保留它们。重启后的捕获先查引擎索引，避免重新捕获已存在轮次而覆盖旧状态。

`filesnap` projection 只折叠原生轮次的界面锚点。快照可用性通过独立 RPC 查询；预览、执行结果与清理结果只存在于当前调用和浏览器内存，不进入 projection 缓存。

## 回退顺序

1. 查询可恢复轮次，准备文件变更清单，同时在引擎存储保存救援检查点。
2. 用户确认；令牌限定会话和恢复点，五分钟过期，单次使用。
3. 浏览器走 DSH 自己的 `sessions.fork`，继承部署的 preset 和 workspace 组合。
4. host 再次检查工作区与忽略规则，恢复到指定 point，先持久化命名救援点及恢复状态，再还原文件；完成状态与 child 的 redo 引用一起提交。
5. 被保留轮次中的子智能体按回退切点级联带入 child：在分支下克隆每个子会话并重写血缘，日志截断到切点（递归生效，切点之后出生的后代不被携带），使分支展示的正是切点时刻的家族并可继续它们；无法带入的子智能体只告警，不影响回退。
6. 浏览器打开 child，并在空输入框回填完整原始提示词。部分失败留在浮层中明确展示。

子代理克隆的 ID 采用 `filesnap-carry-v1.<原始ID的sha256>.<uuid>`。稳定哈希在连续回退和冷加载后识别同一血缘，新 UUID 保持各分支克隆独立；相同创建时间、工作目录或预设不再视为同一身份。标识通过原生持久化保存，无需自定义 header 字段或会话事件。没有 catalog 事件的运行时，在每一层都通过存储的父会话 header 查找后代。


取消不恢复文件、不创建分支。检查不是文件系统锁，外部写入仍可能在最终检查后发生。host 拒绝时浏览器已经创建的 child 可能留在列表。headless 命令由服务自行 fork 并返回 child id。

## 独立界面与通信

使用 DSH 公开插槽：`conversation.chat.assistant-actions`、`conversation.session.header.actions`、`settings.section`。设置中的 FileSnap 页面提供中断恢复和多版本迁移入口。

`ctx.connection.rpc.handle('/filesnap', …)` 与浏览器 Connection RPC 对接，沿用宿主的 Host/Origin 检查和浏览器认证。当 Connection 服务注册通道时访问不到 `webServer`（桌面端的 0.2.0-rc.2 构建），插件改为直接在 `ctx.webServer` 上挂载同一前缀路由，准入、信封校验与请求体上限保持一致。请求经 schema 验证，常规回退操作作用于已打开的对应 agent；中断恢复可通过独立记录处理尚未打开的会话。浏览器按钮不调用 `session.command`，因此不产生其 `command/run` 和 `command/done` 卡片。用户手动输入命令仍走宿主标准命令路径。

工作区快照面板独立显示索引占用、共享内容、会话快照数量和未保护路径。清理只调用 `gc`，保留被快照与 undo 引用的数据，不自动删除会话。

## 旧版会话兼容

旧版依赖修改宿主 known-event set 来读取自定义事件，卸载后可能失败。本版已删除这项修改。通过统一迁移入口为旧记录补 `ignorable: true`，不修改消息、序号和分支边界。[迁移流程](migrations.zh.md)。

新会话通过真实持久化后端写入后，由从未加载插件的独立 DSH 进程重新打开验证。迁移同时验证普通 JSONL、多帧 Zstd、重复执行、备份、加载冲突和扫描后文件变化。

## Service API 与构建

`ctx.filesnap` 提供 `points`、`preview`、`rewind`、`redo`、`status`、`previewCleanup`、`cleanup`。结果为 `{ ok: true, value }` 或 `{ ok: false, refusal }`。直接调用 service 的集成方可以自行控制确认流程；命令和浏览器必须传预览令牌。

host 与 client 分开编译，共享普通数据类型 [`src/wire.ts`](../src/wire.ts)。宿主依赖为 optional peer，避免安装第二套 Cordis/DSH。浏览器 bundle 使用宿主构建预设。构建和类型检查以 DSH 0.1.2-rc.1 为兼容基线；运行时测试同时覆盖 npm 已发布的 DSH 0.2.1-rc.2，包括真实 JSONL 冷祖先读取、子代理克隆和历史日志迁移。这里不包含桌面 UI 端到端测试。

## 中断恢复状态

新回退与 redo 的命名救援点、未完成状态和 redo 栈独立持久化。完成状态与栈更新一并提交；设置面板负责预览继续或回滚，文件冲突时拒绝覆盖。引擎仍使用已发布接口。[恢复流程及边界](recovery.zh.md)。
