# upstream-opencode-structure

> 由 M00-T02 生成的 OpenCode 上游目录阅读记录（AgentDesk vendor 基线）。
> 来源：`vendor/opencode`（sst/opencode @ commit `1882c33`，版本 `1.18.11`，2026-08-02）

## 关键目录

| 目录 | 包名 | 作用 |
|---|---|---|
| `packages/app` | `@opencode-ai/app` | 共享 Web UI（React 客户端，`dev:web` 启动） |
| `packages/desktop` | `@opencode-ai/desktop` | Electron 桌面壳（main / preload / renderer） |
| `packages/opencode` | `opencode` | Core / Server / CLI 入口（`src/index.ts`） |
| `packages/server` | `@opencode-ai/server` | HTTP + SSE Server 实现 |
| `packages/client` | `@opencode-ai/client` | TypeScript Client SDK |
| `packages/sdk` | — | SDK 构建产物（`js/`、`openapi.json`） |
| `packages/sdk-next` | — | 新一代 SDK 源码 |
| `packages/ui` | `@opencode-ai/ui` | 共享 UI 组件库 |
| `packages/tui` | — | 终端 TUI |
| `packages/cli` | — | CLI 组装 |
| `packages/core` | — | 核心逻辑（含 node-pty 等原生模块） |
| `packages/protocol` | — | 协议类型定义 |
| `packages/plugin` | — | Plugin SDK |
| `packages/console` / `packages/stats` / `packages/slack` | — | 其他客户端/集成 |

## 启动方式

- UI（Web）：`bun --cwd packages/app dev`
- Desktop（Electron）：`bun --cwd packages/desktop dev`（根脚本 `dev:desktop`）
  - `predev` 自动执行：安装 electron、拷贝 icons、构建 node、下载 CLI 到 resources
- Server / CLI：`bun run --cwd packages/opencode --conditions=browser src/index.ts`（根脚本 `dev`）

## 进程与通信

- Desktop 主进程：`packages/desktop/src/main`（窗口管理、IPC、原生能力）
- Renderer：`packages/desktop/src/renderer`，加载共享 Web UI
- Desktop 与 Core 通信：UI 通过 HTTP + SSE 与 opencode server 通信（Server 由 opencode 包提供），Electron 侧经 preload/IPC 提供桌面原生能力（如 shell/文件对话框）

## Package Manager

- bun（`bun.lock`、`bunfig.toml`），安装命令 `bun install`

## M00-T02 验收结论

- UI 从 `packages/app`（Web）或 `packages/desktop`（Electron 壳加载同一 UI）启动；
- Desktop 主进程在 `packages/desktop/src/main`；
- OpenCode Server 由 `packages/opencode`（`src/index.ts`）启动，HTTP+SSE 提供；
- Desktop 与 Core 通过 HTTP+SSE 通信，桌面能力经 preload/IPC 桥接。
