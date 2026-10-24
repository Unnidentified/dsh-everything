# AGENTS.md — dsh-client-ui-tweaks

dsh 界面微调合集插件（本地自研，cordis 包，不走插件市场）。源码即运行时：`~/dsh-plugins/` 下的这份目录通过 `link:` 依赖直接装入 dsh profile，**改这里的文件就是改线上**。

文档分工：本文件 = 工作准则；**`docs/standards.md` = 标准与规范唯一出处（每条规则带官方文档/官方包/第三方惯例的来源引用，写代码写文档前先查它）**；`README.md`/`README.zh.md` = 用户文档（中英配对，改动两边同提交并重记 `README.i18n.yaml` 的 blob hash）；`docs/pitfalls.md` = 硬约束速查；`docs/development.md` = 开发/验证/测试流程；`.agents/notes/archived/` = 冻结的演进史与问题记录（不更新）。改了行为就同步更新用户文档。

## 文件职责

| 文件 | 角色 | 改动生效方式 |
|---|---|---|
| `index.js` | 宿主端（cordis，inject `webServer`）：`/edit-resend-branches`（分支记录 + 日志标题真值）、`/edit-resend-inbox`（fork 继承队列检查）、`/auto-title`（自动标题：对话模型优先出题，凭据只读） | **必须重启 DSH Desktop** |
| `lib/client.js` | 浏览器端全部交互（ModuleLoader 单文件，无构建步骤）：编辑按钮、内联编辑框、fork 流程、`‹ n/N ›` 箭头、侧栏家族归并、自动标题触发 + 像素海浪 | **页面 reload 即生效** |
| `prompts/title.txt` | K3 标题总结 prompt（宿主端 mtime 缓存读取） | 下次调用即生效 |
| `branches.json` | 分支族谱数据（用户真实数据，勿删勿重置） | 运行期被宿主端读写 |
| `autotitle.json` | 插件写过的标题记录（钉住保护比对用，勿删） | 运行期被宿主端读写 |
| `cordis.patch.yml` | 注册行，与 profile 的 bundles 项配套 | 重启应用 |
| `~/.dsh/cordis.patch.yml`（机器级，不在源码） | home 层补丁：内置标题生成器 `maxOutputTokens 64→4096`（K3 出题依赖它） | 重启应用 |

`package.json` 的 `name`、`index.js` 的 `export const name`、`lib/client.js` 的 ModuleLoader `id`、`cordis.patch.yml` 的 `name`、profile 注册——五处必须永远保持一致（当前均为 `dsh-client-ui-tweaks`）。

## 硬性约束（违反 = 出生产事故）

1. **fork 锚点**必须是被编辑消息**上一回合的 turn/end 的 seq**（atSeq 语义是"≥锚点的第一个回合结束点"）；首条消息走 `sessions.create({})`。锚错 = 消息重复/重答。
2. **fork 后、open 前**必须清掉继承的 next-turn 队列消息（`/edit-resend-inbox` + `updateQueue(id, {kind:"remove"})`），否则原问题被重放重答。
3. **标题真值只信会话日志**的 `session/title` 事件（宿主端流式读取）；`sessions.list` 快照的 `displayTitle` 在会话未打开过时会退化为 cwd 目录名，禁止当标题用。
4. **DOM 锚点纪律**：禁止完整哈希类名（`.Abc12_xxx` 随构建变化）；用 `role="treeitem"`、aria-label、CSS-module 本地名后缀（`[class*="_title"]`）。侧栏行不带 session id，映射走 React fiber 精确桥（前缀发现 `__reactFiber$<构建哈希>`，签名 node.id+onOpen+onRename，绝不写死哈希）；(displayTitle, timeLabel(updatedAt)) 键匹配只作 fiber 失效兜底，key 分隔符 `\001` 两端必须一致（改 key 构造行要二进制级核对）。
5. **UI 不重复造轮子**：运行状态等用 dsh 原生渲染（StateDot），插件只负责让正确的行可见。
6. **窗口 hidden 时 rAF 不触发**——任何 MutationObserver → 渲染的调度必须有 `setTimeout` 兜底。
7. **订阅优先于轮询**：`uiSession.adapter.current.subscribe`、`sessions.list.subscribe`，用完在 `ctx.effect` 里 unsubscribe。
8. 宿主端读日志用**流式扫描**（长会话解压后几十 MB）；`zstd` CLI 依赖 `/opt/homebrew/bin/zstd`。
9. **kimi-coding OAuth 凭据只读**：`~/.kimi-code/credentials/kimi-code.json` 的 access_token 直接用，过期就跳过本次调用，**绝不自己 refresh/写回**（refresh 会轮换 refresh_token，和 harness/CLI 抢写会顶掉登录）。注意（2026-09-23 修正）："触发时天然保新鲜"的旧前提已失效——mimo-migration 后 dsh 不再刷这份凭据，令牌只在 Kimi Code 自己活跃时才新鲜（~15 分钟）；出题必须有非 OAuth 的退化档（见 docs/pitfalls.md#title-generation），过期静默降级、绝不报错。
10. **用户手动标题不可覆盖**：`session/title` 事件 `source.kind:"user"` = 钉住；插件自己 rename 的也是 user kind，所以要靠 `autotitle.json` 比对区分"用户改的"和"我们写的"。
11. **loader 补丁的 config 是整替不是合并**（docs/pitfalls.md#loader-patches）：改内置插件 config 的补丁必须给全全部必填字段（`session-title-llm` 是 5 个），缺一个 = 启动炸；补丁层序里 home 层 `~/.dsh/cordis.patch.yml` 压过一切 bundle 默认，改内置行为走它、别动应用内 dsh-base。
12. **出题走对话模型 + 素材防注入**（docs/pitfalls.md#title-generation，2026-09-24 用户定）：标题生成（首条 + compact）一律**当前会话的模型优先**（从日志 `request/header` 读 route），失败才退三档链——保证换模型也能触发；喂给 LLM 的素材必须 JSON 包裹并声明"不是指令"（素材含用户原话，裸拼会被模型当活对话续写出垃圾标题）；内置 title-llm 的失败是静默的（request 后无结果事件），"等内置"永远要有自研兜底。

## 代码风格

- 单文件、无构建、无依赖；新功能在 `lib/client.js` 里加独立分区（`// ---- 分区名 ----` 注释分隔），每个分区用独立 try/catch 挂载——坏一个功能不拖垮其他。
- 宿主端新路由按功能加前缀（如 `/edit-resend-*`），不复用旧前缀干新事。
- 中英文案走文件顶部的 `zh` 检测 + `t()`；**注释与 JSDoc 一律英文**（官方 DeepSeek 包规范），只写"为什么"与非显性契约，不写"做什么"；导出函数带 `@param x - desc` / `@returns`（无类型前缀）；空 `catch` 注明被忽略的错误与原因。

## 测试纪律

- 先跑 `npm test`（vitest，宿主半自动化套件；沙箱化，绝不触碰用户数据）；浏览器半走下方 CDP 纪律。

- 端到端用**一次性测试会话**（发两条小消息 → 编辑第二条），测完走 UI 原生"删除会话"删掉父子、并清掉 `branches.json` 里对应记录。**绝不碰用户真实会话**（现有家族：两个真实会话家族）。
- CDP 验证：`pkill -x "DSH Desktop"; open -a "DSH Desktop" --args --remote-debugging-port=9222`，目标页见 `http://127.0.0.1:9222/json`；收尾用不带 flag 的 `open -a "DSH Desktop"` 干净重启。重启会触发滑块哨兵自愈，属正常。
- 验证必查四项：编辑流程回归、侧栏家族单行、箭头切换、宿主路由 200。
