# AgentDesk — 可插拔多 Agent 桌面平台

> 唯一工程基线文档：`AGENTDESK_DEVELOPMENT.md`（v0.3）。

## 这是什么

基于 **OpenCode Desktop** 交互体验的多 Agent 桌面平台。采用 **vendor 完整拷贝策略**：
能直接拿来用的开源项目一律完整拷入 `vendor/`，AgentDesk 只自研“平台编排层”。

## 目录结构

```text
AgentDesk/
├── AGENTDESK_DEVELOPMENT.md   # 开发实施文档（唯一状态基线）
├── UPSTREAM_SYNC.md           # 上游同步策略与 commit 记录
├── AGENTDESK_PATCHES.md       # 对上游的必须修改（当前为空）
├── vendor/
│   ├── opencode/              # 完整拷贝（commit 1882c33）
│   ├── pi/                    # 完整拷贝（commit f0deb8d）
│   └── pi-web/                # 完整拷贝（v0.8.6）
├── packages/                  # AgentDesk 平台层（零依赖纯 TS）
│   ├── runtime-protocol/      # 协议类型：Runtime/Event/Capability/Artifact/...
│   ├── registry-core/         # Runtime/Agent/Capability/Session Registry
│   ├── event-bus/             # 统一事件总线 + reducers
│   ├── platform-core/         # 平台门面：组装注册表 + 事件总线
│   ├── runtime-demo/          # 演示 Runtime（G02/G03/G22 解耦证明）
│   ├── runtime-opencode/      # OpenCode 适配器（复用 @opencode-ai/sdk）
│   └── runtime-pi/            # Pi 适配器（复用 pi-web HTTP/SSE API）
├── scripts/                   # check-platform-isolation 等
└── tests/contracts/           # node:test 契约测试
```

## 快速开始

```bash
# 平台层（零依赖包）类型检查 + 契约测试（需要 node >= 22.6）
npm install
npm run typecheck
npm test

# 原生运行时基线（需要 bun，见 vendor/opencode README）
cd vendor/opencode && bun install && bun run dev:desktop
```

## 复用决策（详见文档 5.1/5.2/5.3）

| 项目 | 决策 |
|---|---|
| opencode | ✅ 完整拷贝：桌面壳/UI/Server/SDK 全部直接复用 |
| pi | ✅ 完整拷贝：第二 Runtime 基线 |
| pi-web | ✅ 完整拷贝：Pi 会话 Web UI / HTTP+SSE API |
| anything-llm | ⏳ 后期引入（Document/Knowledge Runtime） |
| open-webui / desktop | ⏳/❌ 参考或不用（桌面壳由 opencode desktop 承担） |