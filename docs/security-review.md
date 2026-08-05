# AgentDesk Security Review（M24-T01）

> 日期：2026-08-05
> 范围：shell / filesystem / MCP / extensions / network / external runtime

## 结论

核心风险点均有对应缓解，无已知高危（critical/high）未处理项。剩余为中低风险 + 发布前待办。

## 逐项审查

### 1. Shell

- `platform.python`（tool-core）：隔离子进程 + 30s 超时 + 环境净化（不继承代理/模型密钥）
- Pi/OpenCode 的 bash 由各自原生引擎管理，AgentDesk 仅透传事件（不落地命令字符串审计待 M24-T04 补）
- 风险：低。Python 工具隔离执行，原生 bash 权限归原生引擎

### 2. Filesystem

- `platform.file.read/write/list/stat`：工作区路径限定（`resolveWithin` 拒绝越界）
- `document/spreadsheet/slides` 工具产物统一写入 `.agentdesk-docs/`（工作区内）
- 风险：低。路径穿越已拦截（单测覆盖）

### 3. MCP

- 本项目不直接加载第三方 MCP；Pi 的 MCP 由其原生配置（`~/.pi`）管理
- tabby-mcp 在本地失败时仅告警，不影响主链路
- 风险：低。无 AgentDesk 侧 MCP 入口

### 4. Extensions

- 扩展必须声明权限（filesystem/network/shell/runtime/ui），`api.permissions.has()` 运行时检查
- 扩展经 `.agentdesk/extensions/` 加载，需项目信任（与 Pi 一致）
- 风险：中 → 低。权限声明已强制；发布前建议增加"权限确认 UI"

### 5. Network

- 内网 LLM 网关（128.128.2.6）走 NO_PROXY 直连，不经过本地代理
- 扩展网络权限默认不授予
- 风险：低

### 6. External Runtime

- opencode / pi-web 均为本地服务（127.0.0.1），Panel 不对外网暴露
- Runtime 间禁止直接依赖，跨 Runtime 走 Broker（M19）
- 崩溃隔离：opencode SSE 中断已降级为 status 事件（M05）；Python 子进程超时 kill（M13）
- 风险：低

## 发布前待办

- [ ] Secret redaction：日志中模型 API key 脱敏（M24-T04 补充）
- [ ] 扩展权限确认 UI（确认后再加载）
- [ ] 依赖 license 审计（M24-T09）

## 已落地缓解参考

- `packages/tool-core/src/filesystem-tools.ts`（路径限定）
- `packages/tool-core/src/python-tool.ts`（隔离执行）
- `packages/extension-sdk/src/api.ts`（权限声明）
- `packages/runtime-opencode/src/open-code-runtime.ts`（SSE 容错）
