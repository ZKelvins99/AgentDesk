# AgentDesk 本地启动手册

## 一键启动

AgentDesk Panel 内置 sidecar 管理器，启动时自动拉起 OpenCode（:4096）与 Pi Web（:30141）。

```powershell
cd D:\code_kj\Agent工具开发\AgentDesk
npm start
```

打开 http://localhost:8787

（本机另有 PowerShell 快捷方式 `.devlogs\start-panel.ps1`，仅开发用，不入库。）

启动日志（`.devlogs/`）：
- `panel.out.log`：`[sidecar] opencode=ready pi-web=ready`
- `oc-server.out.log` / `oc-server.err.log`：opencode
- `pi-web.out.log` / `pi-web.err.log`：pi-web

状态查询：
```powershell
curl.exe --noproxy "*" http://127.0.0.1:8787/api/sidecars
# → {"opencode":true,"piWeb":true,"childPids":[...]}
```

## 手动逐个启动（调试用）

```powershell
# 1. OpenCode server（:4096）
powershell -File "D:\code_kj\Agent工具开发\AgentDesk\.devlogs\start-oc-server.ps1"

# 2. Pi Web（:30141）
cd D:\code_kj\Agent工具开发\AgentDesk\vendor\pi-web
$env:NEXT_TELEMETRY_DISABLED="1"
node node_modules\next\dist\bin\next dev -H 127.0.0.1 -p 30141

# 3. Panel（:8787）
powershell -File "D:\code_kj\Agent工具开发\AgentDesk\.devlogs\start-panel.ps1"
```

## 环境要求

- Node 24+（本项目验证于 v24.9.0）
- bun 1.3.x（`D:\program\nodejs\node_modules\bun\bin\bun.exe`，随 nvm 安装）
- 用户环境变量 `AGENTDESK_INTERNAL_API_KEY`（内部 LLM 网关 key）
- 代理：git/npm 走 `http://127.0.0.1:7890`；opencode server 内网 LLM 网关 `128.128.2.6` 走 `NO_PROXY` 直连
- 路径按本机 nvm 布局（`D:\program\nodejs`）；换机器需调整 `.devlogs/start-*.ps1` 与 `src/sidecar.ts` 中的可执行路径

## 测试 / 构建

```powershell
cd D:\code_kj\Agent工具开发\AgentDesk
npm test                 # 契约测试
npm run typecheck
node scripts/check-platform-isolation.ts
```

## 面板功能

- Runtime Selector：OpenCode / Pi / Echo / Third-Party Demo / Document Agent
- 聊天 + 事件流 / Artifacts 右侧面板 / Native Settings / Installation Check
- `/api/agents` `/api/tools` `/api/skills` `/api/extensions` `/api/workspaces`
- `/api/logs` `/api/diagnostics` `/api/version` `/api/sidecars`
