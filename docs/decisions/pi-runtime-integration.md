# Pi Runtime 集成选型（M06-T01）

> 日期：2026-08-05
> 阶段：M06 —— Pi Runtime 最小接入
> 决策状态：ACCEPTED（默认 Transport = pi-web HTTP/SSE）

## 背景

M05 完成 OpenCode Runtime Adapter 后，M06 需要让 Pi 以 Runtime 身份接入 AgentDesk，
完成最基础的 Chat + Streaming + Session（暂不接 Pi Extension）。

约束：

- 开发机为 Windows（`D:\code_kj\Agent工具开发\AgentDesk`），必须以 Windows 可运行为前提；
- 必须实现 `AgentRuntime` 契约（runtime-protocol），不得绕过平台层；
- 保留 Pi Extensions / Skills / Packages / Providers 的后续接入路径；
- 与 OpenCode 共用 Runtime Selector（OpenCode / Pi / Echo）。

## 候选方案

| 方案 | 说明 | Windows 兼容 | 维护成本 | 结论 |
| --- | --- | --- | --- | --- |
| A. 官方 client（`@earendil-works/pi-client`） | `vendor/pi/packages/client`，连接 Pi daemon | **不兼容**：`src/unix.ts` 仅支持 unix socket（AF_UNIX） | 低 | 拒绝 |
| B. pi-web HTTP/SSE（`@agegr/pi-web` 0.8.6） | Next.js 服务端内嵌 `@earendil-works/pi-coding-agent`，对外提供 REST + SSE | ✅ 纯 HTTP/SSE，无平台依赖 | 中（需起一个 Next.js 服务） | **采用** |
| C. 直接内嵌 pi SDK 到 runtime-pi | 进程内创建 AgentSession | 需自行处理事件桥与生命周期 | 高（重复 pi-web 已做的工作） | 拒绝（二期可选） |

## 决策

默认 Transport：**pi-web HTTP/SSE**（`@agegr/pi-web` 0.8.6，vendored 于 `vendor/pi-web`）。

理由：

1. Pi 官方 client 仅支持 unix socket，Windows 无法使用；
2. pi-web 在服务端内嵌 pi-coding-agent，通过 HTTP + SSE 暴露会话/事件，与 AgentDesk 的
   Runtime 边界（Adapter 只做边界转换、不重写 Session）一致；
3. SSE 事件流与 M05 的 OpenCode 事件流同构，`runtime-pi` 可复用 M05 的 `readSse` 模式；
4. vendor/pi-web 已随仓库落地（`vendor/pi-web`），不引入新的外部下载。

## 复用 API（vendor/pi-web）

```text
POST /api/agent/new        创建会话（body: { cwd, message?, type? }）
POST /api/agent/[id]       发送命令（body: { type: "user_message", message }）
GET  /api/agent/[id]       查询运行状态（get_state）
GET  /api/agent/[id]/events  SSE 事件流（message_update / agent_end / tool_execution_* 等）
GET  /api/sessions         会话列表（health check）
```

## 事件映射（M06-T06 前置）

```text
pi-web SSE                          → AgentEvent
message_update / assistantMessage   → message.delta
agent_start                         → message.started
agent_end / agent_settled           → session.idle
tool_execution_start                → tool.started
tool_execution_end                  → tool.completed
session_error / error               → session.error
未知事件                            → native（Escape Hatch）
```

## 风险与对策

- **pi-web 依赖安装**：`vendor/pi-web/node_modules` 未落地，首次需 `npm install`（走本地代理 7890）；
- **Next.js 启动耗时**：`next start` 需 `.next` 构建产物，首次需 `next build`；开发期可用 `next dev -p 30141`；
- **取消（M06-T07）**：pi-web 无独立 cancel 端点，首期以 Session 级状态事件兜底，二期补 abort 命令；
- **模型配置**：pi 会话默认模型由 pi-web 启动参数决定，AgentDesk 不在本期接管（遵循"不重写原生"原则）。

## 落地清单（对应手册任务）

- M06-T02：`packages/runtime-pi`（已建：PiWebRuntime + mappers + sse）
- M06-T03：init / dispose（已实现）
- M06-T04：Session 映射 `pi:xxx ↔ 原生 sessionId`（已实现）
- M06-T05：Chat（createSession + send）
- M06-T06：Streaming（attachSessionEventStream + SSE mapper）
- M06-T07：Cancel（事件兜底，二期补 abort）
- M06-T08：Error Mapping（session_error → session.error）
