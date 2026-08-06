# AgentDesk

> 基于 **Pi Agent Harness** 内核、以 **Electron** 封装的桌面 Agent 应用。
> 交互形态对标 Codex 桌面端，完整保留 Pi 的扩展生态（Extension / Skill / Package / Provider），
> 并在其之上补齐 Pi 刻意不提供的能力：**MCP 管理、权限审批、图形化模型供应商配置、插件市场**。

- 文档版本：`v1.0`
- 文档定位：**本项目唯一需求与工程基线**。任何编码、评审、验收都以本文件为准。
- 目标产物：Windows / macOS / Linux 三平台**开箱即用安装包**（用户机器无需预装 Node / Bun / pi）。

---

## 目录

- [1. 产品定义](#1-产品定义)
- [2. 目标与非目标](#2-目标与非目标)
- [3. 术语表](#3-术语表)
- [4. 上游内核事实清单（Pi）](#4-上游内核事实清单pi)
- [5. 总体架构](#5-总体架构)
- [6. 技术栈](#6-技术栈)
- [7. 仓库结构](#7-仓库结构)
- [8. 子系统详细设计](#8-子系统详细设计)
- [9. UI/UX 规格](#9-uiux-规格)
- [10. 进程间通信契约（IPC）](#10-进程间通信契约ipc)
- [11. 安全模型](#11-安全模型)
- [12. 构建、打包与分发](#12-构建打包与分发)
- [13. 可观测性](#13-可观测性)
- [14. 测试策略](#14-测试策略)
- [15. 开发里程碑](#15-开发里程碑)
- [16. 工程规范](#16-工程规范)
- [17. 风险与开放问题](#17-风险与开放问题)
- [18. 附录](#18-附录)

---

## 1. 产品定义

### 1.1 一句话

AgentDesk 是一个**桌面端 AI 编码/工作 Agent 客户端**：把终端里的 Pi Agent 变成一个有项目管理、会话历史、可视化 Diff、图形化配置与扩展市场的桌面应用。

### 1.2 三个核心命题

| 命题 | 含义 | 硬约束 |
|---|---|---|
| **Pi 是唯一内核** | 不做多 Runtime 抽象层，不接 OpenCode/Claude Code，Agent 循环 100% 交给 pi | 禁止在 AgentDesk 内自研 LLM 调用与 agent loop |
| **零损耗保留 pi 生态** | 用户在终端装的 extension / skill / package / provider，在 AgentDesk 里必须原样生效 | 禁止"转译"pi 资源；禁止 fork/patch pi 源码 |
| **补齐而非替代** | AgentDesk 只补 pi 明确不做的部分（MCP、权限 UI、GUI 配置、前端插件） | 补充能力必须通过 pi 的公开扩展点实现 |

### 1.3 与旧版本（v0.3 多 Runtime 平台）的关系

上一版 AgentDesk 是"可插拔多 Agent 运行时平台"（vendor 拷贝 opencode + pi + pi-web，18 个 package，M00~M24 里程碑）。该方案已废弃，原因：

1. **过度抽象**：为了兼容两个内核，Protocol/Registry/Broker/Router 五层抽象吃掉了绝大部分工时，产出的用户价值接近零。
2. **依赖失控**：vendor 三个上游仓库（含 Next.js、Bun、SolidJS 三套构建体系），本机需装 bun 才能跑，无法打包成安装程序。
3. **多进程链路过长**：Panel(:8787) → opencode(:4096) / pi-web(:30141)，任一环节挂掉整链不可用。

**本版决策：单内核、单产物、直连 pi RPC。** 抽象层只保留一层（Pi Bridge），且不为"未来可能的第二内核"预留任何接口。

---

## 2. 目标与非目标

### 2.1 V1 必须交付（P0）

- [ ] 三平台安装包，双击安装即用，**内置 pi standalone 二进制**
- [ ] 多项目（Workspace）管理，多会话并行，会话历史持久化与恢复
- [ ] 流式对话：文本 / 思考（reasoning）/ 工具调用 / 工具结果 / Token 与费用统计
- [ ] 可视化文件 Diff、可折叠工具调用、Markdown + 代码高亮渲染
- [ ] **模型供应商图形化配置**：内置 provider 目录 + 自定义 OpenAI/Anthropic/Google 兼容端点 + 密钥安全存储
- [ ] **模型选择器**：provider/model 切换、thinking level 切换（off→max）、模型收藏与快捷循环
- [ ] **权限审批**：命令执行/文件写入前弹窗确认，四档审批模式，规则记忆
- [ ] **Skill 管理**：列表 / 启停 / 新建 / 编辑 / frontmatter 校验 / 从仓库安装
- [ ] **MCP 管理**：增删改查 MCP Server（stdio/SSE/HTTP）、工具开关、连通性诊断、工具注入 pi
- [ ] **插件管理**：Pi Package（npm:/git:/local）安装卸载更新、资源级启停、全局/项目作用域
- [ ] 内置终端（PTY）、文件树、会话导出（HTML/Markdown）
- [ ] 自动更新（应用自身）+ `pi update` 内核更新入口

### 2.2 V1.x 计划（P1/P2）

- [ ] 会话树（fork / 分支导航 / branch summary），对应 pi 的 `get_tree` / `fork` / `navigate_tree`
- [ ] Compaction 可视化与手动压缩
- [ ] 计划任务（截图中的"已安排"）：定时/周期触发会话
- [ ] Git 集成与 PR 视图（截图中的"拉取请求"）
- [ ] AgentDesk 前端插件系统（自定义面板、消息渲染器、主题）
- [ ] OAuth 订阅登录（Anthropic / GitHub Copilot 等）内嵌流程
- [ ] 远程/容器化执行（对接 pi 的 containerization 方案）

### 2.3 明确非目标

- ❌ 不实现自己的 agent loop、prompt 工程、上下文压缩算法（全部由 pi 负责）
- ❌ 不做 Web 版 / 多用户 / 云端同步（V1 纯本地单用户）
- ❌ 不做多 Runtime 插拔（不为 opencode/其他 harness 预留适配层）
- ❌ 不做 IDE（不与 VSCode 竞争；文件编辑器仅为轻量查看/改动）
- ❌ 不修改 pi 源码。任何必须的上游改动都走 issue/PR，本地以扩展点绕过

---

## 3. 术语表

| 术语 | 定义 |
|---|---|
| **Pi / 内核** | `@earendil-works/pi-coding-agent`，上游 `earendil-works/pi`，CLI 命令 `pi` |
| **Pi Sidecar** | AgentDesk 拉起的 `pi --mode rpc` 子进程，一个会话一个 |
| **Pi Bridge** | AgentDesk 主进程内负责管理 sidecar 生命周期 + RPC 编解码 + 事件归一化的模块 |
| **Bridge Extension** | AgentDesk 注入给 pi 的**内置 pi 扩展**，实现 MCP 工具注入、权限拦截、UI 桥。文件位于 `resources/pi-ext/` |
| **Agent Dir** | pi 的用户配置根目录，默认 `~/.pi/agent/`，可用 `PI_CODING_AGENT_DIR` 覆盖 |
| **Workspace** | AgentDesk 里的一个项目（一个本地目录），对应 pi 的 `cwd` |
| **Session** | 一次会话。pi 侧持久化为 `sessions/` 下的 JSONL 树；AgentDesk 侧只做索引 |
| **Extension** | pi 扩展，`.ts`/`.js`，能注册 tool/command/hook/provider/UI |
| **Skill** | 符合 [Agent Skills 标准](https://agentskills.io/specification) 的能力包，`SKILL.md` + 附属脚本 |
| **Pi Package** | pi 的包（npm/git/本地路径），可打包 extensions + skills + prompts + themes。**即 AgentDesk UI 上的"插件"** |
| **MCP Server** | Model Context Protocol 服务端。**pi 原生不支持，由 AgentDesk 实现** |
| **Profile** | AgentDesk 的配置档，决定使用哪个 Agent Dir（默认档 = 用户真实 `~/.pi/agent`） |
| **Approval Mode** | 审批模式：`read-only` / `auto-edit` / `full-access` / `plan`。截图中的"完全访问" |

---

## 4. 上游内核事实清单（Pi）

> ⚠️ 本章是**从 pi 源码与官方文档核实过的事实**，不是设计。实现时必须以此为准；升级 pi 后必须重新核对本章（见 [16.5 上游同步](#165-上游同步)）。
> 核实基线：`@earendil-works/pi-coding-agent@0.83.0`（monorepo `earendil-works/pi`）。

### 4.1 运行时要求

| 项 | 值 |
|---|---|
| Node | `>=22.19.0`（monorepo `engines`） |
| Windows | **必须有 bash**：按序探测 `settings.shellPath` → `C:\Program Files\Git\bin\bash.exe` → PATH 上的 `bash.exe`（Cygwin/MSYS2/WSL） |
| 独立二进制 | 上游提供 `scripts/build-binaries.sh`，用 Bun 编译出单文件可执行；GitHub Release 附带各平台产物 + `SHA256SUMS` |
| 配置目录名 | `.pi`（来自 `package.json` 的 `piConfig.configDir`） |
| 关键环境变量 | `PI_CODING_AGENT_DIR`（覆盖 agent dir）、`PI_CODING_AGENT_SESSION_DIR`（覆盖 session dir）、`PI_OFFLINE=1`、`PI_SKIP_VERSION_CHECK=1`、`PI_SHARE_VIEWER_URL` |

### 4.2 目录布局

**全局（Agent Dir，默认 `~/.pi/agent/`）**

```
~/.pi/agent/
├── settings.json        # 用户设置（见 4.3）
├── auth.json            # 凭据：API key / OAuth token（明文 JSON）
├── models.json          # 自定义 provider 与 model（见 4.4）
├── trust.json           # 项目信任决策
├── models-store.json    # 模型目录缓存
├── pi-debug.log         # 调试日志
├── extensions/          # 全局扩展：<name>.ts 或 <name>/index.ts
├── skills/              # 全局技能：<skill>/SKILL.md，根层 .md 也算单文件技能
├── prompts/             # Prompt 模板：<name>.md → /name 展开
├── themes/              # 自定义主题 .json
├── tools/               # 自定义工具
├── bin/                 # pi 托管的二进制（fd、rg）
├── npm/                 # 用户级 npm 包安装位置
├── git/<host>/<path>/   # 用户级 git 包克隆位置
└── sessions/            # 会话存储，按工作目录组织
```

**项目级（`<workspace>/.pi/`，仅在项目被信任后加载）**

```
<workspace>/.pi/
├── settings.json        # 覆盖全局（嵌套对象做 merge）
├── SYSTEM.md            # 替换系统提示
├── APPEND_SYSTEM.md     # 追加系统提示
├── extensions/          # 项目扩展
├── skills/              # 项目技能
├── prompts/
├── resources/
├── npm/  git/           # 项目级包安装位置
└── sessions/            # 若 settings.sessionDir 指向此处
```

另外 pi 会读 `AGENTS.md` / `CLAUDE.md` 作为上下文文件，并递归查找 `.agents/skills/`（cwd 及祖先目录，直到 git 根）与 `~/.agents/skills/`。

### 4.3 `settings.json` 字段（AgentDesk 设置页需 1:1 覆盖）

| 分组 | 字段 | 类型 | 默认 |
|---|---|---|---|
| 模型 | `defaultProvider` / `defaultModel` / `defaultThinkingLevel` | string | – |
| 模型 | `thinkingBudgets` | `{minimal?,low?,medium?,high?}` number | – |
| 模型 | `enabledModels` | string[]（glob，Ctrl+P 循环用） | – |
| 模型 | `hideThinkingBlock` / `showCacheMissNotices` | boolean | false |
| UI | `theme` / `externalEditor` / `quietStartup` / `collapseChangelog` | – | `dark` |
| UI | `uiMode`(`regular`\|`fullscreen`) / `fullscreenScrollbar` | string | `regular` / `auto` |
| UI | `doubleEscapeAction`(`tree`\|`fork`\|`none`) / `treeFilterMode` | string | `tree` / `default` |
| UI | `editorPaddingX` / `outputPad` / `autocompleteMaxVisible` / `showHardwareCursor` | – | 0 / 1 / 5 / false |
| 信任 | `defaultProjectTrust`(`ask`\|`always`\|`never`) | string | `ask`（仅全局） |
| 遥测 | `enableInstallTelemetry` / `enableAnalytics` / `trackingId` | – | true / false |
| 网络 | `httpProxy` | string（仅全局，映射 HTTP(S)_PROXY） | – |
| 网络 | `transport`(`sse`\|`websocket`\|`websocket-cached`\|`auto`) | string | `auto` |
| 网络 | `httpIdleTimeoutMs` / `websocketConnectTimeoutMs` | number | 300000 / 15000 |
| 警告 | `warnings.anthropicExtraUsage` | boolean | true |
| 压缩 | `compaction.enabled` / `.reserveTokens` / `.keepRecentTokens` | – | true / 16384 / 20000 |
| 分支 | `branchSummary.reserveTokens` / `.skipPrompt` | – | 16384 / false |
| 重试 | `retry.enabled` / `.maxRetries` / `.baseDelayMs` | – | true / 3 / 2000 |
| 重试 | `retry.provider.timeoutMs` / `.maxRetries` / `.maxRetryDelayMs` | – | SDK / **0** / 60000 |
| 投递 | `steeringMode` / `followUpMode`（`all`\|`one-at-a-time`） | string | `one-at-a-time` |
| 终端 | `terminal.showImages` / `.imageWidthCells` / `.clearOnShrink` | – | true / 60 / false |
| 图像 | `images.autoResize` / `.blockImages` | boolean | true / false |
| Shell | `shellPath` / `shellCommandPrefix` / `npmCommand`(string[]) | – | – |
| 会话 | `sessionDir` | string | – |
| Markdown | `markdown.codeBlockIndent` | string | `"  "` |
| 资源 | `packages` / `extensions` / `skills` / `prompts` / `themes` | array | `[]` |
| 资源 | `enableSkillCommands` | boolean | true |

资源数组支持 glob 与 `!排除`、`+强制包含`、`-强制排除`；`settings.json` 中相对路径相对于该文件所在的 `.pi`（或 `~/.pi/agent`）解析。
Session dir 优先级：`--session-dir` > `PI_CODING_AGENT_SESSION_DIR` > `settings.sessionDir`。

### 4.4 `models.json`（供应商/模型配置的真正落盘格式）

```jsonc
{
  "providers": {
    "<provider-name>": {
      "baseUrl": "https://...",            // API 端点
      "api": "openai-completions",         // 见下表，可在 model 级覆盖
      "apiKey": "$MY_KEY",                 // 见「值解析」；可省略（改用 auth.json / --api-key）
      "oauth": "radius",                   // 动态 OAuth 类型（当前仅 radius）
      "authHeader": true,                  // 自动加 Authorization: Bearer <apiKey>
      "headers": { "x-portkey-api-key": "$PORTKEY_KEY" },
      "compat": { "supportsDeveloperRole": false, "supportsReasoningEffort": false },
      "models": [
        {
          "id": "llama3.1:8b",             // 必填
          "name": "Llama 3.1 8B (Local)",  // 用于匹配与副标题
          "api": "openai-completions",
          "reasoning": false,
          "thinkingLevelMap": { "minimal": null, "high": "high", "max": "max" },
          "input": ["text", "image"],
          "contextWindow": 128000,
          "maxTokens": 32000,
          "cost": { "input": 5, "output": 30, "cacheRead": 0.5, "cacheWrite": 6.25,
                    "tiers": [{ "inputTokensAbove": 272000, "input": 10, "output": 45,
                                "cacheRead": 1, "cacheWrite": 12.5 }] },
          "compat": { }
        }
      ],
      "modelOverrides": { }                // 覆盖内置/扩展注册模型的字段
    }
  }
}
```

- **文档化的 `api` 取值**：`openai-completions`（兼容性最好）、`openai-responses`、`anthropic-messages`、`google-generative-ai`。内部另有 `azure-openai-responses`、`openai-codex-responses`、`bedrock-converse-stream`、`google-vertex`、`mistral-conversations`、`pi-messages`。
- **值解析**（`apiKey` 与 `headers` 均支持）：
  - `"!command"` → 执行命令取 stdout（**请求时求值**，pi 不做缓存/TTL）
  - `"$VAR"` / `"${VAR}"` → 环境变量插值，可嵌在字面量中
  - `"$$"` → 字面 `$`；`"$!"` → 字面 `!`
  - 其他 → 字面量
- **覆盖内置 provider**：只写 `baseUrl` 即可把内置 provider 整体走代理，内置模型与既有 OAuth/Key 仍可用；带 `models` 则合并自定义模型。
- **Thinking Level**：`off` `minimal` `low` `medium` `high` `xhigh` `max`。`thinkingLevelMap` 三态：省略=用默认映射（`xhigh`/`max` 视为不支持）、字符串=支持并透传该值、`null`=不支持（UI 隐藏/跳过）。
- `models.json` 在每次打开 `/model` 时重新加载，**无需重启**。

### 4.5 `auth.json` 与密钥优先级

- 实现：`packages/coding-agent/src/core/auth-storage.ts`（`AuthStorage`，`CredentialStore` 后端），路径 `~/.pi/agent/auth.json`，**明文 JSON**。
- 认证类型：`api_key` | `oauth`（`AuthType`），OAuth 凭据含刷新逻辑。
- 密钥来源优先级：`--api-key` 参数 → `auth.json` → 环境变量 → `models.json` 的 `providers.*.apiKey`。
- `/model` 的可用性判断只看"是否配置了 auth"，**不会执行 `!command`**。因此 keyless 本地服务（Ollama 等）需要填一个占位 key。

> **AgentDesk 的做法**：不把明文 key 写进 `auth.json`。见 [8.6](#86-providermodel-与密钥管理)。

### 4.6 内置 Provider 目录（`KnownProvider`）

`anthropic` `openai` `openai-codex` `azure-openai-responses` `google` `google-vertex` `amazon-bedrock` `deepseek` `xai` `groq` `cerebras` `mistral` `openrouter` `vercel-ai-gateway` `github-copilot` `huggingface` `fireworks` `together` `nvidia` `zai` `zai-coding-cn` `minimax` `minimax-cn` `moonshotai` `moonshotai-cn` `kimi-coding` `qwen-token-plan` `qwen-token-plan-cn` `xiaomi` `xiaomi-token-plan-cn` `xiaomi-token-plan-ams` `xiaomi-token-plan-sgp` `ant-ling` `radius` `opencode` `opencode-go` `cloudflare-workers-ai` `cloudflare-ai-gateway`

模型目录由 `npm run generate:models` / `hydrate:model-data` 生成，缓存在 `models-store.json`；`pi update --models` 只刷新模型目录。

### 4.7 RPC 模式（AgentDesk 的主集成通道）

启动：`pi --mode rpc [options]`

- **帧格式**：严格 JSONL，**仅** `\n` 分隔；输入端可容忍并剥掉尾部 `\r`。
- ⚠️ **不得使用 Node `readline` 解析**：它还会在 `U+2028`/`U+2029` 断行，而这两个字符在 JSON 字符串中合法。必须自己按 `\n` 切分 Buffer。
- 所有命令可带 `id`，响应回带同一 `id`；`bash_execution_update` 事件也带发起命令的 `id`。
- 响应形如 `{"type":"response","command":"prompt","success":true,"data":{...}}`。`prompt` 的 `success:true` 仅表示**被接受/入队**，后续失败通过事件流报告，不会再发同 id 的第二个 response。

**命令全集**

| 分组 | 命令 |
|---|---|
| 提问 | `prompt`（`message`、`images[]`、`streamingBehavior:"steer"\|"followUp"`）、`steer`、`follow_up`、`abort`、`new_session`（可带 `parentSession`） |
| 状态 | `get_state`、`get_messages` |
| 模型 | `set_model`、`cycle_model`、`get_available_models` |
| 思考 | `set_thinking_level`、`cycle_thinking_level`、`get_available_thinking_levels` |
| 队列 | `set_steering_mode`、`set_follow_up_mode` |
| 压缩 | `compact`、`set_auto_compaction` |
| 重试 | `set_auto_retry`、`abort_retry` |
| Bash | `bash`、`abort_bash` |
| 会话 | `get_session_stats`、`export_html`、`switch_session`、`fork`、`clone`、`get_fork_messages`、`get_entries`、`get_tree`、`get_last_assistant_text`、`set_session_name` |
| 命令 | `get_commands` |

`get_state` 返回：`model`、`thinkingLevel`、`isStreaming`、`isCompacting`、`steeringMode`、`followUpMode`、`sessionFile`、`sessionId`、`sessionName`、`autoCompactionEnabled`、`messageCount`、`pendingMessageCount`。

**事件全集**

`agent_start` `agent_end` `agent_settled` `turn_start` `turn_end` `message_start` `message_update` `message_end` `bash_execution_update` `tool_execution_start` `tool_execution_update` `tool_execution_end` `queue_update` `compaction_start` `compaction_end` `auto_retry_start` `auto_retry_end` `summarization_retry_scheduled` `summarization_retry_attempt_start` `summarization_retry_finished` `extension_error`

**Extension UI 子协议**（stdout 发请求 / stdin 回响应）

请求类型：`select`、`confirm`、`input`、`editor`、`notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`。
响应类型：值响应（select/input/editor）、确认响应（confirm）、取消响应（任意弹窗）。

> **这是 AgentDesk 实现权限弹窗与扩展交互 UI 的唯一通道。**

**消息类型**：`UserMessage`、`AssistantMessage`、`ToolResultMessage`、`BashExecutionMessage`、`Attachment`、`Model`。

### 4.8 SDK 通道（备选，不用于 V1）

`@earendil-works/pi-coding-agent` 导出 `createAgentSession()` / `AgentSession` / `createAgentSessionRuntime()`，以及 `InteractiveMode` / `runPrintMode` / `runRpcMode`。
另有 `packages/server` + `packages/client`（`@earendil-works/pi-client`，**未发布 npm**）走 Unix socket / Named Pipe 的二进制 IPC（CBOR + 4 字节大端长度前缀帧，协议 v2，hello 握手带 token 的 SHA256 摘要）。

**V1 决策：只用 RPC(stdio JSONL)。** 理由见 [5.2](#52-为什么是-sidecar--rpc而不是嵌入-sdk)。

### 4.9 CLI 表面（AgentDesk 会调用的部分）

```
pi [options] [@files...] [messages...]

模式    --print/-p | --mode text|json|rpc | --export
模型    --provider <n> --model <pattern> --api-key <k> --thinking <lvl> --models <glob> --list-models
会话    --continue/-c --resume/-r --session <file> --session-id --fork --session-dir <p> --no-session --name/-n
工具    --tools/-t --exclude-tools/-xt --no-builtin-tools/-nbt --no-tools/-nt
资源    --extension/-e <src> --no-extensions/-ne --skill <p> --no-skills/-ns
        --prompt-template --no-prompt-templates/-np --theme --no-themes --no-context-files/-nc
信任    --approve/-a | --no-approve/-na
其他    --ui-mode --alt --verbose --offline

包管理  pi install <src> | pi remove <src> | pi list | pi config [-l]
        pi update [--all|--extensions|--models|--self [--force]|<src>]
        pi auth print-api-key | print-bearer-token
```

包源三类：`npm:@scope/pkg@1.2.3`、`git:github.com/user/repo@ref`（含 `ssh://`、`git@host:path`）、本地绝对/相对路径。
`-l` 写项目设置 `.pi/settings.json`，默认写用户设置。`-e/--extension` 装到临时目录，仅本次运行有效。

### 4.10 项目信任（Trust）——**必须正确处理，否则项目级资源全部失效**

- 交互模式下 pi 会弹窗询问是否信任项目；**非交互模式（`-p`、`--mode json`、`--mode rpc`）不询问**。
- 无已保存决策时，按全局 `defaultProjectTrust` 处理：`ask`（默认）与 `never` → **忽略项目级资源**；`always` → 信任。
- 决策保存在 `~/.pi/agent/trust.json`，可对父目录生效。
- 单次覆盖：`--approve/-a` 或 `--no-approve/-na`。

> **AgentDesk 必须实现自己的信任 UI**（首次打开项目时询问），并在 spawn sidecar 时按用户决策传 `-a` / `-na`。否则项目里的 `.pi/extensions`、`.pi/skills`、`.pi/settings.json` 会被静默忽略——这是最容易踩的坑。

### 4.11 Skill 规格

- **发现位置**：全局 `~/.pi/agent/skills/`、`~/.agents/skills/`；项目（需信任）`.pi/skills/`、`.agents/skills/`（cwd 及祖先，至 git 根）；Package 的 `skills/` 或 `package.json` 的 `pi.skills`；`settings.skills[]`；CLI `--skill`（可重复，即使 `--no-skills` 也生效）。
- **发现规则**：`~/.pi/agent/skills/` 与 `.pi/skills/` 的根层 `.md` 算单文件技能；所有位置递归查找含 `SKILL.md` 的目录；`~/.agents/skills/` 与项目 `.agents/skills/` 的根层 `.md` **被忽略**。
- **结构**：`<skill>/SKILL.md` + 自由的 `scripts/` `references/` `assets/`，内部用相对路径引用。
- **Frontmatter**

| 字段 | 必填 | 规则 |
|---|---|---|
| `name` | ✅ | ≤64 字符，仅小写字母/数字/连字符，无首尾连字符、无连续连字符。**pi 不要求与目录名一致** |
| `description` | ✅ | ≤1024 字符。决定模型何时加载该技能，必须具体 |
| `license` | – | 许可证名或引用 |
| `compatibility` | – | ≤500 字符，环境要求 |
| `metadata` | – | 任意 KV |
| `allowed-tools` | – | 空格分隔的预批准工具列表（实验性） |
| `disable-model-invocation` | – | `true` 时从系统提示中隐藏，只能 `/skill:name` 调用 |

- **渐进式披露**：启动时只把 name+description 以 XML 形式放进系统提示；模型判断需要时才用 `read` 读全文。
- **调用**：`/skill:<name> [args]`，args 以 `User: <args>` 追加到技能内容后。开关 `settings.enableSkillCommands`。
- **校验**：多数问题只 warning 仍加载；**缺 description 不加载**；重名 warning 且保留先找到的。
- 参考仓库：[anthropics/skills](https://github.com/anthropics/skills)、[badlogic/pi-skills](https://github.com/badlogic/pi-skills)。

### 4.12 Extension 规格（AgentDesk 补能力的落点）

- **位置**：`~/.pi/agent/extensions/<name>.ts` 或 `<name>/index.ts`；项目 `.pi/extensions/*`（需信任）；`settings.extensions[]`；CLI `--extension <path>`。
- **可用导入**：`@earendil-works/pi-ai`、`pi-agent-core`、`pi-coding-agent`、`pi-tui`、`typebox`（写包时列入 `peerDependencies: "*"`，不要打包）。
- **`ExtensionAPI` 关键方法**

```ts
interface ExtensionAPI {
  on(event: string, handler: EventHandler): void;
  registerTool<P, D, S>(tool: ToolDefinition<P, D, S>): void;
  registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void;
  registerShortcut(shortcut: KeyId, options: {...}): void;
  registerFlag(name: string, options: {...}): void;
  getFlag(name: string): boolean | string | undefined;
  registerMessageRenderer<T>(customType: string, r: MessageRenderer<T>): void;
  registerEntryRenderer<T>(customType: string, r: EntryRenderer<T>): void;
  registerMarkdownTransformer(t: MarkdownTransformer): void;
  sendMessage<T>(message: {...}, options?: {...}): void;
  sendUserMessage(content: string | (TextContent | ImageContent)[], options?): void;
  appendEntry<T>(customType: string, data?: T): void;
  setSessionName(name: string): void;  getSessionName(): string | undefined;
  setLabel(entryId: string, label?: string): void;
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  getActiveTools(): string[];  getAllTools(): ToolInfo[];  setActiveTools(names: string[]): void;
  getCommands(): SlashCommandInfo[];
  setModel(model: Model<any>): Promise<boolean>;
  getThinkingLevel(): ThinkingLevel;  setThinkingLevel(l: ThinkingLevel): void;
  registerProvider(provider: Provider): void;
  registerProvider(name: string, config: ProviderConfig): void;
  unregisterProvider(name: string): void;
  events: EventBus;
}
```

- **`ExtensionContext`**：`ui.{select,confirm,input,editor,notify,setStatus,setWidget,setTitle,set_editor_text}`、`mode`、`hasUI`、`cwd`、`isProjectTrusted()`、`sessionManager`、`modelRegistry`/`model`/`scopedModels`/`thinkingLevel`、`signal`、`abort()`、`isIdle()`、`hasPendingMessages()`、`shutdown()`、`getContextUsage()`、`compact()`、`getSystemPrompt()`。
- **`ExtensionCommandContext` 额外**：`getSystemPromptOptions()`、`waitForIdle()`、`newSession()`、`fork()`、`navigateTree()`、`switchSession()`、`reload()`。
- **事件全集**：`project_trust` `resources_discover` `session_start` `session_info_changed` `session_before_switch` `session_before_fork` `session_before_compact` `session_compact` `session_before_tree` `session_tree` `session_shutdown` `context` `before_provider_headers` `before_provider_request` `after_provider_response` `before_agent_start` `agent_start` `agent_end` `agent_settled` `turn_start` `turn_end` `message_start` `message_update` `message_end` `tool_execution_start` `tool_execution_update` `tool_execution_end` `model_select` `thinking_level_select` `user_bash` `input` `tool_call` `tool_result`
- **可干预的事件返回值**（AgentDesk 依赖）：
  - `tool_call` → `ToolCallEventResult` 可 **block 工具执行** ⇒ 权限审批的实现基础
  - `before_agent_start` → 可替换 `systemPrompt`
  - `session_before_compact` → 可取消或自定义压缩
  - `before_provider_request` / `before_provider_headers` → 可改请求与头
- 支持 async factory、长生命周期资源与 shutdown 清理、覆盖内置工具、动态工具加载、输出截断、自定义渲染。

### 4.13 Pi Package 规格（= AgentDesk 的"插件"）

`package.json` 声明：

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"],
    "video": "https://.../demo.mp4",
    "image": "https://.../shot.png"
  }
}
```

- 无 `pi` 清单时按约定目录发现：`extensions/`(.ts/.js)、`skills/`(递归 SKILL.md + 根层 .md)、`prompts/`(.md)、`themes/`(.json)。
- `settings.packages[]` 支持对象形式过滤：`{ source, extensions, skills, prompts, themes }`，`[]`=全不加载，`!pattern` 排除，`+path`/`-path` 精确强制。
- 作用域去重：同一包同时出现在全局与项目时，**项目条目胜出**；若项目条目 `autoload:false` 则作为 delta 叠加。身份判定：npm=包名 / git=去 ref 的仓库 URL / local=解析后的绝对路径。
- `pi config` 可启停已安装包里的各类资源（Tab 切换全局/项目）。
- 依赖规则：第三方运行时依赖进 `dependencies`（pi 安装包时会跑 `npm install`）；引用 pi 核心包放 `peerDependencies: "*"`；引用其他 pi 包需 `bundledDependencies` 并通过 `node_modules/` 路径引用（pi 用独立 module root 加载，互不污染）。

### 4.14 会话存储

- 元数据 SQLite（`packages/storage/sqlite-node`）：`sessions(id, created_at, metadata, cwd, parent_session_id, active_leaf_id)`、`session_entries`、`branch_tips`、`branch_entries`、`entry_materialized`、`session_materialized`、`session_sequences`、`migrations`。
- 内容为**树形 JSONL**（format v3），条目类型：`session_header` `message` `model_change` `thinking_level_change` `compaction` `branch_summary` `custom` `custom_message` `label` `session_info`。
- 默认目录 `~/.pi/agent/sessions/`，按工作目录组织。恢复：`-c`（最近）/ `-r`（选择）/ `--session <file>`。
- `SessionManager` API：`create/open/continueRecent/inMemory/list/listAll/newSession/setSessionFile/appendMessage/appendCustomEntry/getLeafId/getTree`。

### 4.15 ⚠️ Pi 刻意不提供的能力（AgentDesk 的存在理由）

来自上游 `usage.md` 原文：*"It intentionally does not include built-in **MCP**, **sub-agents**, **permission popups**, **plan mode**, **to-dos**, or **background bash**."*
另外 `README.md`：*"Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it."*

| 缺失能力 | AgentDesk 的补法 | 章节 |
|---|---|---|
| MCP | 自建 MCP Host + Bridge Extension `registerTool()` 注入 | [8.3](#83-mcp-host) |
| 权限弹窗 | Bridge Extension 拦截 `tool_call` + Extension UI `confirm` | [8.7](#87-权限与审批) |
| Plan mode / To-dos | Bridge Extension 注册 `plan`/`todo` 工具 + 前端面板（P1） | [8.10](#810-agentdesk-插件系统前端扩展) |
| Sub-agents | Bridge Extension 注册 `spawn_agent` 工具（内部起子 sidecar）（P2） | [17](#17-风险与开放问题) |
| Background bash | 前端内置终端 + `bash` RPC 命令组合（P1） | [9.6](#96-终端面板) |
| 细粒度沙箱 | 引导用户走上游 containerization 方案，不自研（P2） | [11.5](#115-沙箱边界) |

---

## 5. 总体架构

### 5.1 进程模型

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Electron Main Process  (Node, 单实例)                                     │
│                                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│  │ Window Mgr │ │ IPC Router │ │ AppStore   │ │ Updater    │            │
│  │ Menu/Tray  │ │ (zod 校验) │ │ (SQLite)   │ │ Logger     │            │
│  └────────────┘ └─────┬──────┘ └────────────┘ └────────────┘            │
│                       │                                                  │
│  ┌────────────────────┴───────────────────────────────────────────┐     │
│  │ Pi Bridge                                                       │     │
│  │  SidecarPool · RpcClient(JSONL) · EventNormalizer · TrustGate   │     │
│  └───┬─────────────────┬─────────────────┬──────────────────────────┘     │
│      │                 │                 │                                │
│  ┌───┴──────┐   ┌──────┴─────┐   ┌───────┴──────┐  ┌──────────────┐     │
│  │ MCP Host │   │ ConfigStore│   │ Approval Eng │  │ PTY Manager  │     │
│  │ (SDK)    │   │ pi/*.json  │   │ 规则+审计    │  │ node-pty     │     │
│  └───┬──────┘   └────────────┘   └──────────────┘  └──────────────┘     │
└──────┼───────────────────────────────────────────────────────────────────┘
       │ stdio(MCP)                          │ contextBridge (preload)
       ▼                                     ▼
┌──────────────┐  ┌──────────────────────────────────────────────────────┐
│ MCP Servers  │  │ Renderer  (React 19 + Vite, sandbox:true)            │
│ stdio/SSE/   │  │  Sidebar · SessionView · Composer · SettingsPages    │
│ StreamableHTTP│  │  DiffViewer · Terminal · Skill/MCP/Plugin Manager    │
└──────────────┘  └──────────────────────────────────────────────────────┘

       ▲ RPC: JSONL over stdin/stdout（每会话一个进程）
       │
┌──────┴────────────────────────────────────────────────────────────────┐
│ pi sidecar  ×N                                                        │
│   pi --mode rpc --extension <AgentDesk Bridge Extension> [-a] ...     │
│   ├─ 原生 agent loop / tools / compaction / retry                     │
│   ├─ 原生加载：~/.pi/agent/{extensions,skills,prompts,themes} + 项目级│
│   ├─ 原生 provider/model（读 models.json + 注入的 env）               │
│   └─ Bridge Extension：MCP 工具 · 权限拦截 · UI 请求 · 状态上报        │
└───────────────────────────────────────────────────────────────────────┘
```

### 5.2 为什么是 Sidecar + RPC（而不是嵌入 SDK）

| 维度 | Sidecar（`pi --mode rpc`）✅ 采用 | 嵌入 SDK（`createAgentSession`） |
|---|---|---|
| 扩展生态 | pi 用 **jiti** 在自己的进程里加载 `.ts` 扩展，模块解析、`peerDependencies`、独立 module root 全部原生行为 | Electron 主进程的 ASAR/打包/模块解析会破坏 jiti 与 `node_modules` 路径，扩展大面积失效 |
| Node 版本 | sidecar 自带运行时（standalone 二进制），与 Electron 内置 Node 版本解耦（pi 要求 `>=22.19`） | 受 Electron 内置 Node 版本约束，升级 Electron 可能直接跑不起来 |
| 原生依赖 | pi 的 sqlite / photon-wasm 等由其二进制自带 | 需要为 Electron ABI 重编译，跨平台成本高 |
| 崩溃隔离 | 单会话崩溃不影响应用，可自动重启并 `--session <file>` 恢复 | 崩掉整个应用 |
| 内核升级 | 换二进制 / `pi update --self` 即可，无需重新发版 | 必须重新打包发版 |
| 代价 | 需实现 JSONL 协议、进程管理、事件归一化 | – |

**代价可接受，收益是决定性的。** V1 只走 RPC；`packages/client` 的 CBOR/IPC 通道不使用（未发布 npm，且 Windows named pipe 支持需额外验证）。

### 5.3 单会话数据流（发一条消息）

```
用户在 Composer 回车
  → renderer: window.agentdesk.session.prompt({ sessionId, text, images, streamingBehavior })
  → preload contextBridge → ipcMain.handle('session:prompt')  [zod 校验]
  → PiBridge.get(sessionId).send({ id, type:'prompt', message, images })
  → sidecar stdin ← JSONL
  ── sidecar 内部：agent loop → LLM 流式 →
  → stdout JSONL: message_start / message_update×N / tool_execution_start ...
  → RpcClient 按 '\n' 切帧 → JSON.parse → EventNormalizer
  → 归一化为 AgentDeskEvent，写入 SessionStore（增量）
  → webContents.send('session:event', evt)  [批量合流，16ms 节流]
  → renderer Zustand store → 虚拟列表增量渲染
```

**工具调用需要审批时插入**：

```
sidecar: Bridge Extension 收到 tool_call 事件
  → ctx.ui.confirm({...})  → stdout: {type:'extension_ui_request', request:'confirm', ...}
  → PiBridge → ApprovalEngine 查规则
      命中 allow/deny 规则 → 直接回响应（不打扰用户）
      未命中 → webContents.send('approval:request') → 渲染层弹窗 → 用户决策
  → stdin: {type:'extension_ui_response', ...}
  → Bridge Extension 返回 ToolCallEventResult（放行 / block + 理由）
```

### 5.4 Sidecar 生命周期

| 阶段 | 行为 |
|---|---|
| **spawn** | 新建会话或打开历史会话时按需拉起。参数见 [8.1.2](#812-启动参数矩阵) |
| **就绪** | spawn 后立即 `get_state` + `get_available_models` + `get_commands` 探活，超时 10s 判失败 |
| **空闲回收** | `agent_settled` 后空闲 > `idleTimeout`（默认 15 min）且非当前激活会话 → 优雅关闭；再次打开时用 `--session <file>` 重建 |
| **并发上限** | 默认 4（可配，1~16）。超限时 LRU 关闭最久未用的空闲进程 |
| **异常退出** | 指数退避重启（1s/2s/4s，最多 3 次），恢复到同一 session 文件；连续失败 → 会话标记 `degraded` 并在 UI 展示 stderr 尾部 200 行 |
| **应用退出** | 先发 `abort` → 等 2s → SIGTERM → 再等 3s → SIGKILL；Windows 用 job object / `taskkill /T` 保证子孙进程一并清理 |

> **Windows 注意**：pi 会 spawn bash 子进程，必须用进程组/Job Object 管理，否则会残留孤儿进程。

---

## 6. 技术栈

### 6.1 选型表

| 层 | 选择 | 理由 / 约束 |
|---|---|---|
| 桌面壳 | **Electron**（跟随 stable，≥ 内置 Node 22） | 生态最成熟、三平台打包与自动更新方案完备。`contextIsolation:true` `sandbox:true` `nodeIntegration:false` |
| 构建 | **electron-vite** + **Vite** | main/preload/renderer 三入口开箱即用，HMR，esbuild 预构建 |
| 语言 | **TypeScript**（`strict` + `noUncheckedIndexedAccess`） | 全仓统一，`any` 需 eslint-disable 并注明理由 |
| 包管理 | **pnpm** workspaces + **Turborepo** | 严格 peer 依赖、磁盘友好、任务缓存 |
| UI 框架 | **React 19**（`use`, Actions, Suspense） | 生态与 AI 流式渲染组件最丰富 |
| 路由 | **TanStack Router**（file-based，类型安全） | 设置页/管理页需要嵌套路由与类型化 search params |
| 组件库 | **shadcn/ui**（Radix Primitives，源码内联） | 无黑盒、可深度定制以贴合 Codex 视觉 |
| 样式 | **Tailwind CSS v4**（CSS-first config） | 设计 token 走 CSS 变量，支持明/暗/跟随系统 |
| 客户端状态 | **Zustand**（slice 化 + `subscribeWithSelector`） | 流式高频更新场景下 re-render 可控；避免 Redux 样板 |
| 异步/缓存 | **TanStack Query** | 设置、Skill/MCP/Plugin 列表等"服务端状态"统一缓存与失效 |
| 表单 | **React Hook Form** + **Zod** resolver | Provider/MCP 配置表单校验复杂，schema 与 IPC 契约共用 |
| 虚拟列表 | **TanStack Virtual** | 长会话（数千条目）必须虚拟化 |
| Markdown | **react-markdown** + remark-gfm + **rehype-shiki** | Shiki 用 VSCode 语法，与 Diff 高亮同源 |
| 代码/Diff | **CodeMirror 6**（`@codemirror/merge` 做 unified/split diff） | 比 Monaco 轻 5×，移动/嵌入友好，主题可与 Shiki 对齐 |
| 终端 | **xterm.js**（`@xterm/xterm` + fit/webgl/search addon）+ **node-pty** | 事实标准 |
| 图标 | **Lucide** | 与 shadcn 同源 |
| 动画 | **Motion**（framer-motion 后继） | 侧栏/面板过渡，谨慎使用 |
| 主进程存储 | **SQLite**（`better-sqlite3`）+ **Drizzle ORM** | 会话索引/审批审计/使用统计需要查询与迁移；Drizzle 提供类型化 schema 与 migration |
| 配置文件读写 | 自研 `ConfigStore`（原子写 + JSONC 容错 + 文件监听 chokidar） | 必须与 pi 共享 `settings.json`/`models.json`，不能破坏用户手写内容与注释 |
| 密钥 | **Electron `safeStorage`**（OS Keychain / DPAPI / libsecret） | 明文永不落盘，运行时以 env 注入 sidecar |
| MCP | **`@modelcontextprotocol/sdk`**（stdio / SSE / StreamableHTTP） | 官方 SDK，避免手写协议 |
| IPC | 自研**类型化 IPC**：共享 zod 契约 + `invoke/handle` + `send/on` 封装 | 不引入 electron-trpc 等薄封装依赖；契约集中在 `@agentdesk/ipc` |
| 日志 | **pino**（主进程，JSONL 落盘 + 轮转） | 结构化，便于诊断报告聚合 |
| 校验 | **Zod** | IPC、配置、MCP 配置、SKILL frontmatter 全部统一 |
| 单测 | **Vitest** | 与 Vite 同源 |
| E2E | **Playwright**（`_electron` API） | 官方支持 Electron |
| 打包 | **electron-builder** | NSIS/DMG/AppImage/deb + `publish` 自动更新元数据 |
| 自动更新 | **electron-updater**（GitHub Releases 或自建源） | 差分更新、签名校验 |
| 崩溃/错误 | **Sentry**（可选，默认关闭，需用户显式开启） | 隐私优先 |
| 代码规范 | **ESLint 9** flat config + **Prettier** + **lint-staged** + **Husky** | – |
| 提交/发版 | **Conventional Commits** + **changesets** | 生成 CHANGELOG 与版本 |
| CI | **GitHub Actions**（三平台 matrix 构建 + 签名 + Release） | – |

> 具体版本号以 `pnpm-lock.yaml` 为准；本表只锁"选择"不锁"版本"。升级依赖走独立 PR 并跑全量测试。

### 6.2 明确不采用

| 不采用 | 原因 |
|---|---|
| Tauri | 需要 Rust 工具链；pi sidecar + PTY + 复杂前端生态在 Electron 下成本更低；WebView 版本碎片化 |
| Next.js | 桌面端不需要 SSR/路由约定，Vite 更轻更快 |
| Redux Toolkit / MobX | 流式场景 Zustand 足够且样板更少 |
| Monaco Editor | 体积与打包复杂度不划算（V1 不做完整编辑器） |
| Prisma | 需要额外 query engine 二进制，打包麻烦；Drizzle 纯 TS |
| 在渲染进程直接 `require('node:*')` | 违反 sandbox 安全模型，一律走 IPC |

---

## 7. 仓库结构

```
AgentDesk/
├── apps/
│   └── desktop/                       # Electron 应用（electron-vite）
│       ├── electron.vite.config.ts
│       ├── src/
│       │   ├── main/                  # 主进程
│       │   │   ├── index.ts           # 入口：单实例锁、协议注册、窗口
│       │   │   ├── windows/           # 窗口与自定义标题栏、菜单、Tray
│       │   │   ├── ipc/               # 各域 handler（session/config/skill/mcp/plugin/...）
│       │   │   ├── pi/                # PiBridge：SidecarPool / RpcClient / EventNormalizer
│       │   │   ├── mcp/               # MCP Host
│       │   │   ├── config/            # ConfigStore：settings/models/auth/trust 读写与监听
│       │   │   ├── approval/          # ApprovalEngine：规则匹配、审计
│       │   │   ├── skills/            # Skill 扫描、校验、脚手架、仓库安装
│       │   │   ├── packages/          # Pi Package 管理（封装 pi install/remove/list/update/config）
│       │   │   ├── pty/               # 终端
│       │   │   ├── store/             # SQLite + Drizzle（schema/migrations/repo）
│       │   │   ├── secrets/           # safeStorage 封装
│       │   │   ├── updater/           # 应用自更新 + 内核更新
│       │   │   └── telemetry/         # 日志、诊断报告
│       │   ├── preload/               # contextBridge 暴露 window.agentdesk
│       │   └── renderer/              # React 应用
│       │       ├── routes/            # TanStack Router 文件路由
│       │       ├── features/          # session/ composer/ diff/ terminal/ skills/ mcp/ plugins/ settings/
│       │       ├── components/        # 通用组件（shadcn 生成物在 components/ui）
│       │       ├── stores/            # Zustand slices
│       │       ├── hooks/
│       │       └── styles/
│       └── resources/                 # 打包进安装包的资源
│           ├── bin/                   # pi standalone 二进制（按平台）
│           │   ├── win32-x64/pi.exe
│           │   ├── darwin-arm64/pi
│           │   ├── darwin-x64/pi
│           │   └── linux-x64/pi
│           └── pi-ext/                # Bridge Extension 源码（随包分发，运行时用 --extension 注入）
│               └── agentdesk-bridge/
│                   ├── index.ts       # 入口：装配下列模块
│                   ├── mcp-tools.ts   # 从 IPC 拉 MCP 工具清单 → registerTool
│                   ├── approval.ts    # tool_call 拦截 → ctx.ui.confirm
│                   ├── uplink.ts      # 与主进程的控制通道（见 8.2.2）
│                   └── package.json   # peerDependencies: pi 核心包
├── packages/
│   ├── ipc/                           # IPC 契约：zod schema + 通道常量 + 类型（main/renderer 共用）
│   ├── pi-protocol/                   # pi RPC 命令/事件的 zod schema 与 TS 类型（对齐 4.7）
│   ├── domain/                        # 领域模型：Workspace/Session/Message/ToolCall/Provider/...
│   ├── pi-config/                     # pi settings.json / models.json / auth.json / trust.json 的读写与 schema
│   ├── mcp-core/                       # MCP 客户端封装（与 Electron 解耦，可单测）
│   ├── ui/                            # 跨页面复用的展示组件（无业务依赖）
│   └── tsconfig/  eslint-config/      # 共享配置
├── scripts/
│   ├── fetch-pi-binary.mjs            # 下载/校验 pi standalone 二进制（SHA256SUMS）
│   ├── verify-pi-facts.mjs            # 用当前 pi 二进制回归验证第 4 章事实（见 14.5）
│   └── release.mjs
├── docs/
│   ├── decisions/                     # ADR（每个架构决策一份）
│   ├── pi-facts.md                    # 第 4 章的机器可校验版本
│   └── runbook.md                     # 本地开发与排障手册
├── e2e/                               # Playwright
├── turbo.json  pnpm-workspace.yaml  package.json
└── README.md                          # 本文件
```

**依赖方向（单向，CI 强制检查）**

```
renderer → @agentdesk/ipc, @agentdesk/domain, @agentdesk/ui
main     → @agentdesk/ipc, @agentdesk/domain, @agentdesk/pi-protocol,
           @agentdesk/pi-config, @agentdesk/mcp-core
packages/* 之间：domain ← 其他都可依赖；domain 不依赖任何包
禁止：renderer → main 任何模块；packages/* → electron
```

---

## 8. 子系统详细设计

### 8.1 Pi Bridge

#### 8.1.1 模块职责

| 模块 | 职责 |
|---|---|
| `SidecarPool` | 进程池：按 `sessionId` 索引，负责 spawn/复用/空闲回收/并发上限/崩溃重启（见 [5.4](#54-sidecar-生命周期)） |
| `RpcClient` | 一个 sidecar 一个实例。**自研 JSONL 切帧**（严格按 `\n`，剥尾部 `\r`，**禁用 `readline`**）；`id` 关联的 request/response Promise 表（默认超时 60s，`prompt` 不设超时）；写入背压处理 |
| `EventNormalizer` | pi 事件 → `AgentDeskEvent`（见 8.1.4）；合并 `message_update` 的 delta；把 tool 生命周期折叠成一个 `ToolCall` 对象 |
| `TrustGate` | 查 AgentDesk 的信任决策，决定 spawn 时传 `-a` / `-na`；首次打开项目触发信任 UI |
| `SidecarLog` | 收集 sidecar stderr（环形缓冲 1000 行），供诊断与 `degraded` 展示 |

#### 8.1.2 启动参数矩阵

```
<piBinary> --mode rpc
  --session-dir  <resolved session dir>        # 见下
  [--session <file>]                           # 恢复已有会话
  [--name <sessionName>]
  --provider <p> --model <m> --thinking <lvl>  # 来自 AgentDesk 的会话级选择
  --extension <resources/pi-ext/agentdesk-bridge>   # Bridge Extension（始终注入）
  [-a | -na]                                   # 由 TrustGate 决定，必须显式传
  [--offline]                                  # 用户开启离线模式
  cwd = <workspace path>
  env:
    PI_CODING_AGENT_DIR       = <profile 的 agent dir>（默认不设，即用 ~/.pi/agent）
    AGENTDESK_UPLINK          = <控制通道地址/fd>（见 8.2.2）
    AGENTDESK_SESSION_ID      = <sessionId>
    AGENTDESK_KEY_<PROVIDER>  = <解密后的 API key>（见 8.6）
    PI_SKIP_VERSION_CHECK     = 1（应用自己管更新提示）
    HTTP_PROXY/HTTPS_PROXY/NO_PROXY = 来自 AgentDesk 网络设置
    (Windows) 若探测到 Git Bash，确保其在 PATH 或已写入 settings.shellPath
```

**必须显式传 `-a`/`-na`**：RPC 模式不会询问信任，默认回落 `defaultProjectTrust`（通常 `ask` ⇒ 忽略项目级资源），不显式传会导致项目 `.pi/` 资源静默失效。

#### 8.1.3 会话与进程的映射

- 1 个 UI 会话 ↔ 1 个 sidecar（简单、隔离好）。
- 不使用 `switch_session` 复用进程（除"恢复历史会话"时可复用同 workspace 的空闲进程作为优化，V1 不做）。
- `fork` / `clone` / `new_session` 走 RPC 命令，pi 内部换 session 文件，AgentDesk 侧更新索引。

#### 8.1.4 事件归一化契约

```ts
type AgentDeskEvent =
  | { k: 'session.state';  state: SessionState }                  // get_state 快照
  | { k: 'turn.start' | 'turn.end'; turnId: string }
  | { k: 'msg.start';     msgId: string; role: 'assistant' }
  | { k: 'msg.delta';     msgId: string;
      part: { t: 'text'; v: string } | { t: 'thinking'; v: string } }
  | { k: 'msg.end';       msgId: string; usage?: Usage }
  | { k: 'tool.start';    callId: string; name: string; args: unknown }
  | { k: 'tool.progress'; callId: string; patch: unknown }
  | { k: 'tool.end';      callId: string; ok: boolean; result: unknown; ms: number }
  | { k: 'bash.output';   cmdId: string; chunk: string }
  | { k: 'queue';         pending: number; mode: 'steer' | 'followUp' }
  | { k: 'compact.start' | 'compact.end'; before?: number; after?: number }
  | { k: 'retry';         phase: 'start' | 'end'; attempt: number; delayMs?: number }
  | { k: 'agent.settled' }
  | { k: 'ui.request';    reqId: string; kind: UiRequestKind; payload: unknown }
  | { k: 'error';         scope: 'extension' | 'sidecar' | 'provider'; message: string; detail?: unknown };
```

- **原始事件逃生口**：所有原始 JSONL 保留在会话调试通道（`session:raw`，仅在"开发者模式"开启时推送），用于排查归一化缺陷。
- **节流**：`msg.delta` 与 `bash.output` 在主进程按 16ms 合批后再发渲染层，避免 IPC 洪泛。

#### 8.1.5 二进制解析（pi 可执行文件）

按序探测，UI 中可见并可手动指定：

1. 用户在设置中显式配置的路径
2. 应用内置：`process.resourcesPath/bin/<platform>-<arch>/pi[.exe]`
3. PATH 上的 `pi`
4. 报错并引导安装

启动时执行 `pi --version`，与"已验证兼容范围"比对：低于最低版本 → 阻断并提示；高于已验证上限 → 允许但显示"未验证内核版本"角标（见 [16.5](#165-上游同步)）。

### 8.2 Bridge Extension（注入式 pi 扩展）

AgentDesk 在 pi 进程内的"代理人"。**它是补齐 MCP / 权限 / 前端交互的唯一合法途径。**

#### 8.2.1 设计原则

1. **只用公开 API**：`pi.registerTool` / `pi.on` / `pi.registerCommand` / `ctx.ui.*`。
2. **不写入用户扩展目录**：以 `--extension <app resources 路径>` 注入，用户的 `~/.pi/agent/extensions/` 保持干净；卸载 AgentDesk 不留残留。
3. **失败降级不致命**：uplink 断开时，MCP 工具注册为空、审批降级为"按会话默认模式放行/拒绝"，但 pi 主流程必须继续可用。
4. **可关闭**：设置中可禁用（"纯净 pi 模式"），用于排查"是否 AgentDesk 引入的问题"。

#### 8.2.2 Uplink 控制通道

Bridge Extension 需要与主进程双向通信，但 stdin/stdout 已被 RPC 协议占用。方案（按优先级）：

- **主选**：主进程监听本机 HTTP（127.0.0.1，随机端口）+ 一次性 Bearer token，通过 `AGENTDESK_UPLINK=http://127.0.0.1:<port>` 与 `AGENTDESK_TOKEN` 传给扩展；扩展用 `fetch` + SSE 收推送。
  - 优点：跨平台一致、无原生依赖、易调试。
  - 安全：仅绑 `127.0.0.1`；token 每进程一次性；校验 `Origin`/`Host`；请求带 `AGENTDESK_SESSION_ID` 且服务端核对。
- 备选：Named Pipe / Unix Socket（需处理 Windows 差异，V1 不做）。

Uplink 接口（HTTP）：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/mcp/tools` | 拉取该会话应注册的 MCP 工具清单（JSON Schema） |
| POST | `/mcp/call` | 转发一次 MCP 工具调用，返回结果（支持流式 chunk via SSE） |
| POST | `/approval` | 请求审批（工具名、参数摘要、风险等级），返回 allow/deny/always |
| GET | `/events` (SSE) | 主进程 → 扩展的推送：MCP 工具热更新、强制中止、设置变更 |
| POST | `/log` | 扩展日志转发到统一日志 |

#### 8.2.3 内部模块

```ts
// resources/pi-ext/agentdesk-bridge/index.ts（结构示意，非最终代码）
export default async function (pi: ExtensionAPI, ctx: ExtensionContext) {
  const uplink = createUplink(process.env.AGENTDESK_UPLINK, process.env.AGENTDESK_TOKEN);

  // 1) MCP：把 MCP 工具注册成 pi 原生工具
  await registerMcpTools(pi, uplink);            // 见 8.3.4

  // 2) 权限：拦截工具调用
  pi.on('tool_call', async (e) => decideApproval(e, ctx, uplink));   // 见 8.7.3

  // 3) 状态上报：让 AgentDesk 拿到 pi 内部无法从 RPC 得到的信息
  pi.on('resources_discover', (e) => uplink.post('/state/resources', e));  // 已发现的 skill/extension 真实清单
  pi.on('context',            (e) => uplink.post('/state/context', e));    // 上下文占用
  pi.on('extension_error',    (e) => uplink.post('/log', e));

  // 4) 热更新：MCP 配置变更时重注册
  uplink.on('mcp:changed', () => reloadMcpTools(pi, uplink));

  ctx.signal.addEventListener('abort', () => uplink.close());
}
```

> **`resources_discover` 是关键**：Skill/Extension 的"真实生效清单"只有 pi 自己知道（涉及信任、glob、去重、重名保留规则）。AgentDesk 的管理界面**必须以此事件为准**，而不是自己扫目录猜——自己扫目录必然与 pi 的实际加载结果不一致。
>
> **pi 0.83.0 实测**：`resources_discover` 只发通知（`{ type, cwd, reason }`，不含清单）。AgentDesk 以该事件为触发，清单缺省时用与 pi 相同规则计算的生效清单补齐（全局/项目扩展目录 + `settings.skills[]` 排除 diff + `/skill:<name>` 命令列表），再广播 `event:resources`。

### 8.3 MCP Host

> pi 不支持 MCP（[4.15](#415-️-pi-刻意不提供的能力agentdesk-的存在理由)）。AgentDesk 自己做 MCP Host，把 MCP 工具"翻译"成 pi 工具。

#### 8.3.1 配置格式（AgentDesk 自有，存 `~/.agentdesk/mcp.json`）

```jsonc
{
  "version": 1,
  "servers": {
    "filesystem": {
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspace}"],
      "env": { "FOO": "bar" },
      "cwd": "${workspace}",
      "scope": "global",            // global | workspace
      "timeoutMs": 30000,
      "toolFilter": { "allow": ["read_*"], "deny": ["write_*"] },
      "autoApprove": ["read_file"], // 免审批工具白名单
      "startupTimeoutMs": 15000
    },
    "github": {
      "enabled": true,
      "transport": "http",          // StreamableHTTP
      "url": "https://api.example.com/mcp",
      "headers": { "Authorization": "Bearer ${secret:github-mcp}" },
      "scope": "global"
    },
    "legacy-sse": {
      "transport": "sse",
      "url": "https://example.com/sse",
      "reconnect": { "maxRetries": 5, "baseDelayMs": 1000 }
    }
  }
}
```

- 变量插值：`${workspace}`、`${home}`、`${env:VAR}`、`${secret:<id>}`（从 safeStorage 取，**绝不写明文**）。
- `scope: workspace` 的 server 配置存 `<workspace>/.agentdesk/mcp.json`，与全局合并（同名以 workspace 优先）。
- 支持一键导入 Claude Desktop / Cursor / VSCode 的 `mcpServers` 配置块。

#### 8.3.2 连接管理

- 用 `@modelcontextprotocol/sdk` 的 `Client` + 对应 Transport（`StdioClientTransport` / `SSEClientTransport` / `StreamableHTTPClientTransport`）。
- 生命周期：应用启动时**懒连接**（首次需要工具清单时才连），或用户点"连接"。
- 健康状态机：`disconnected → connecting → ready → degraded → failed`，指数退避重连。
- 能力协商后缓存 `tools/list`、`prompts/list`、`resources/list`；订阅 `notifications/tools/list_changed` 等变更通知并推送到 UI + 通知 Bridge Extension 重注册。
- stdio server 的进程管理复用 sidecar 的进程组清理逻辑（Windows Job Object）。

#### 8.3.3 工具命名与冲突

- pi 侧工具名：`mcp__<serverId>__<toolName>`（双下划线分隔，避免与内置工具冲突）。
- 名称非法字符（非 `[a-zA-Z0-9_]`）替换为 `_`；超长（>64）截断并追加 4 位哈希。
- 与 pi 内置工具或其他扩展工具重名时：**MCP 让位**，记录 warning 并在 UI 标红。
- 参数 schema：MCP 的 JSON Schema → pi `registerTool` 需要 typebox/`TSchema`。做一个 JSON Schema → TypeBox 的运行时转换（不支持的构造降级为 `Type.Any()` 并记录）。

#### 8.3.4 调用链路

```
模型决定调用 mcp__github__create_issue
  → pi 执行 Bridge Extension 注册的 tool.execute()
  → (先过审批：MCP 工具默认需要审批，除非在 autoApprove 里)
  → uplink POST /mcp/call { server, tool, args }
  → MCP Host → client.callTool()  [超时 timeoutMs，可 abort]
  → 结果：text / image / resource → 转成 pi 的 AgentToolResult
      · text        → output 字符串
      · image       → ImageContent（若模型不支持 image 输入则降级为占位文本 + 保存为附件）
      · resource    → 摘要文本 + 资源引用（前端可点开）
      · isError     → 抛错，pi 记为工具失败
  → 长输出按 pi 的 output truncation 规则截断（保留头尾 + 提示完整内容路径）
```

- 进度：MCP 的进度通知 → `AgentToolUpdateCallback` → `tool_execution_update` → UI 实时进度条。
- 取消：pi 的 `ctx.signal` abort → 传播到 MCP `callTool` 的 AbortSignal。

#### 8.3.5 MCP Prompts / Resources（P1）

- Prompts → `pi.registerCommand('/mcp:<server>:<prompt>')`，参数用 `ctx.ui.input` 收集，展开后 `pi.sendUserMessage()`。
- Resources → 响应 `resources_discover` 事件把 MCP 资源加入 pi 的资源列表；UI 提供 `@` 引用选择器。

#### 8.3.6 管理界面要求

列表展示：名称、传输类型、状态灯、工具数、最后错误、作用域标签。
操作：新增（表单/JSON 双模式）、编辑、启停、测试连接（显示握手耗时与 server info）、查看工具清单（含 schema 展开）、按工具粒度开关与免审批、查看最近 20 次调用日志（参数/结果/耗时，敏感字段脱敏）、导入/导出。

### 8.4 Skill 管理

#### 8.4.1 数据来源（**以 pi 为准**）

- **生效清单**：来自 Bridge Extension 的 `resources_discover` 事件（真实加载结果，含来源路径、是否被重名覆盖、校验 warning）。
- **可管理清单**：AgentDesk 扫描 [4.11](#411-skill-规格) 中所有位置得到"磁盘上存在的 skill"，与生效清单做 diff，标注 `active` / `shadowed` / `untrusted` / `invalid` / `disabled`。
- 启停：写 `settings.json` 的 `skills[]`（`!排除` / `-精确排除`）或包过滤，**不删用户文件**。

#### 8.4.2 功能清单

| 功能 | 说明 |
|---|---|
| 浏览 | 按作用域（全局/项目/包/XDG）分组；搜索 name/description/metadata |
| 详情 | 渲染 SKILL.md、frontmatter 表格、文件树（scripts/references/assets）、来源路径、校验结果 |
| 启停 | 全局/项目两个作用域独立开关 |
| 新建 | 脚手架向导：填 name/description → 生成合规 `SKILL.md` + 目录骨架；可选模板（脚本型/文档型/API 型） |
| 编辑 | 内置 CodeMirror 编辑 SKILL.md，**实时 frontmatter 校验**（见下） |
| 安装 | 从 Git 仓库/本地 zip/目录导入；内置推荐源：`anthropics/skills`、`badlogic/pi-skills`（列表页可浏览 + 一键装） |
| 导入其他 harness | 一键把 `~/.claude/skills`、`~/.codex/skills` 加入 `settings.skills[]` |
| 调用 | 会话内 `/skill:<name>` 自动补全；技能卡片"运行"按钮直接发起 |
| 冲突诊断 | 重名、name 与目录不一致、描述过短/过长、缺 description（不加载）等 |

#### 8.4.3 Frontmatter 校验规则（前端即时反馈，规则同 [4.11](#411-skill-规格)）

| 级别 | 规则 |
|---|---|
| **error** | 缺 `description`（pi 直接不加载） |
| **error** | frontmatter 非法 YAML |
| warning | `name` >64 字符 / 含非 `[a-z0-9-]` / 首尾连字符 / 连续连字符 |
| warning | `description` >1024 字符 |
| warning | `compatibility` >500 字符 |
| info | `name` 与父目录名不一致（pi 允许，Agent Skills 标准不允许 → 跨 harness 共享时可能报错） |
| info | `description` <40 字符（模型难以判断何时加载） |
| info | 使用了 `allowed-tools`（实验性字段，行为可能变化） |

### 8.5 插件管理（Pi Package）

UI 上的"插件"= Pi Package。**必须让用户清楚：安装插件 = 执行第三方代码，拥有完整系统权限。**

#### 8.5.1 能力矩阵

| 能力 | 实现 |
|---|---|
| 列表 | 读 `settings.packages[]`（全局+项目）+ `pi list` 输出；展示来源类型、版本/ref、作用域、包含的资源数（extensions/skills/prompts/themes） |
| 安装 | `pi install <src>`（`-l` 写项目）。UI 支持三种来源输入：npm 包名（带版本选择）、Git URL（带 ref）、本地目录选择 |
| 卸载 | `pi remove <src>` |
| 更新 | `pi update <src>` / `pi update --extensions`（批量）；npm 带版本的 spec 会被跳过，UI 需说明 |
| 资源级启停 | 写 `settings.packages[]` 的对象形式过滤（`extensions`/`skills`/`prompts`/`themes` 数组 + `!`/`+`/`-`） |
| 作用域 | 全局 / 项目 两个 tab；同名包冲突时按 pi 规则展示"项目覆盖全局"或"delta 叠加（`autoload:false`）" |
| 市场 | 抓取 npm `keywords:pi-package` + pi.dev 包库；展示 `pi.video`/`pi.image` 预览；卡片式浏览 |
| 安全审查 | 安装前：显示将安装的文件清单、`package.json` 的 `dependencies`、是否含 `postinstall` 脚本；要求用户显式确认"我理解此包将以我的权限运行任意代码" |
| 详情 | README 渲染、资源清单、许可证、安装路径（`~/.pi/agent/npm/` 或 `git/<host>/<path>`）、启停开关 |
| 日志 | 安装/更新过程的完整 stdout/stderr（`pi install` 会跑 `npm install`，需可见） |

#### 8.5.2 Extension 兼容性标注

pi 扩展可以调用只在终端 TUI 下有意义的 API。AgentDesk 必须诚实标注：

| 等级 | 判定 | UI 表现 |
|---|---|---|
| **FULL** | 只用 `registerTool` / `registerCommand` / `on` / `ui.{confirm,select,input,notify}` / `registerProvider` | 正常 |
| **PARTIAL** | 用了 `setStatus` / `setWidget` / `setTitle` / `set_editor_text` | 映射到桌面状态栏/侧栏小组件，可能样式受限 |
| **DEGRADED** | 用了 `registerMessageRenderer` / `registerEntryRenderer` / `registerMarkdownTransformer`（返回 TUI Component） | 渲染降级为纯文本/JSON；提示"此扩展的自定义渲染在桌面端不可用" |
| **TUI_ONLY** | 用了自定义 `Component` / Overlay / 自定义 Editor / `registerShortcut` 依赖终端按键 | 标灰 + 提供"在终端中打开此会话"按钮（起系统终端跑 `pi --session <file>`） |

判定方式：静态扫描扩展源码的 API 调用（AST，best-effort）+ 运行时捕获（Extension UI 请求里出现无法映射的类型时降级并记录）。**不阻止加载**，只标注。

### 8.6 Provider/Model 与密钥管理

#### 8.6.1 分层

```
AgentDesk Provider 配置 UI
   ├─ 内置 provider 目录（38 个，见 4.6）：选择 → 只需填 key（或走 OAuth 引导）
   ├─ 自定义 provider：名称 + baseUrl + api 类型 + 认证方式 + headers + compat + 模型列表
   └─ 覆盖内置 provider：仅改 baseUrl（走公司代理/网关）
          ↓ 写入
   ~/.pi/agent/models.json        ← 结构化配置（不含明文密钥）
   ~/.agentdesk/secrets (加密)     ← 密钥密文（safeStorage）
          ↓ spawn 时
   env AGENTDESK_KEY_<PROVIDER> = <明文>
   models.json 里 apiKey: "$AGENTDESK_KEY_<PROVIDER>"
```

#### 8.6.2 密钥不落盘明文（核心决策）

- 用户在 UI 输入 key → `safeStorage.encryptString()` → 密文存 `~/.agentdesk/secrets.json`（含 keyId、provider、创建时间、最后使用时间，**不含明文**）。
- `models.json` 中该 provider 的 `apiKey` 写成 `"$AGENTDESK_KEY_ANTHROPIC"`（利用 pi 的环境变量插值能力，[4.4](#44-modelsjson供应商模型配置的真正落盘格式)）。
- spawn sidecar 时解密并注入对应 env，**只注入当前会话用得到的 provider 的 key**（最小暴露）。
- 若 `safeStorage.isEncryptionAvailable()` 为 false（部分 Linux 无 keyring）：降级为"仅内存保存 + 每次启动询问"或引导用户改用 `!command` 形式（如 `pass`/`op read`），**绝不静默明文落盘**。
- 已存在于 `auth.json` 的用户密钥：只读展示（标注"由 pi 管理，明文存储"），提供"迁移到 AgentDesk 加密存储"一键操作。
- 日志/诊断报告/崩溃上报：统一 secret redaction（正则 + 已知 key 前缀 + 已注册 secret 值的精确匹配）。

#### 8.6.3 Provider 配置表单字段

| 字段 | 控件 | 校验/说明 |
|---|---|---|
| 名称 | 文本 | 唯一；与内置同名 = 覆盖内置（UI 明确提示） |
| API 类型 | 下拉 | `openai-completions`（默认/最兼容）/ `openai-responses` / `anthropic-messages` / `google-generative-ai`（+"高级"里暴露其余内部类型，标注未文档化） |
| Base URL | 文本 | http(s) 校验；`google-generative-ai` 自定义模型时**必填** |
| 认证方式 | 单选 | API Key（AgentDesk 加密）/ 环境变量 / Shell 命令(`!cmd`) / 无认证（填占位）/ OAuth（引导） |
| API Key | 密码框 | 保存即加密；显示"已配置"不回显 |
| `authHeader` | 开关 | 自动加 `Authorization: Bearer` |
| Headers | KV 列表 | 值支持 `$ENV` / `!cmd` / `${secret:id}` |
| `compat` | 折叠 | `supportsDeveloperRole`、`supportsReasoningEffort`（本地 OpenAI 兼容服务常需关闭） |
| 模型列表 | 表格 | 见下 |

**模型行字段**：`id`(必填) / `name` / `api`(覆盖) / `reasoning` / `input`(text,image) / `contextWindow`(默认 128000) / `maxTokens`(默认 16384) / `cost`(input/output/cacheRead/cacheWrite + tiers) / `thinkingLevelMap`(七级三态编辑器) / `compat`。

**便捷能力**：
- **一键预设**：Ollama / LM Studio / vLLM / SGLang / OpenRouter / DeepSeek / 硅基流动等，自动填 baseUrl + api + compat + 占位 key。
- **模型自动发现**：对 OpenAI 兼容端点调 `GET {baseUrl}/models` 拉列表让用户勾选（失败则手填）。
- **连通性测试**：发一次最小 completion，展示状态码、首 token 延迟、返回片段、错误原文。
- **Keyless 提醒**：pi 要求"有 auth 才在 `/model` 出现"，本地无密钥服务必须填占位 key —— 表单在检测到 localhost baseUrl 且无 key 时自动填 `"local"` 并提示原因。
- **写入即生效**：`models.json` 在 pi 打开模型选择时重载；AgentDesk 保存后对活动 sidecar 发 `get_available_models` 刷新列表，无需重启进程。

#### 8.6.4 模型选择器（截图右下"自定义 最高"）

- 两段式：**模型**（provider/model，支持搜索、收藏、最近使用、能力标签：reasoning/image/context 长度/价格）+ **思考强度**（`off`→`max`，按 `thinkingLevelMap` 隐藏不支持项）。
- 对接 RPC：`get_available_models` / `set_model` / `cycle_model` / `get_available_thinking_levels` / `set_thinking_level` / `cycle_thinking_level`。
- 会话级覆盖 vs 全局默认（`settings.defaultProvider/defaultModel/defaultThinkingLevel`）双层，UI 区分显示。
- 快捷循环：`Ctrl+P`（对应 `settings.enabledModels` 的 glob 列表，UI 可视化编辑）。

#### 8.6.5 OAuth / 订阅登录（V1 有限支持）

- pi 的登录流程在交互模式的 `/login` 里，RPC 模式无对应命令。
- **V1 方案**：在应用内置终端里执行 `pi`（交互模式）并引导用户完成 `/login`，完成后 pi 写入 `auth.json`，AgentDesk 读取并展示登录态。同时支持 `pi auth print-api-key` / `print-bearer-token` 读取可用凭据。
- **V1.x 方案**：直接对接 `@earendil-works/pi-ai` 的 `AuthInteraction`（`AuthPrompt`: text/secret/select/manual_code；`AuthEvent`: info/auth_url/device_code/progress）实现原生 GUI 登录向导。
- 文档中必须诚实标注 V1 的这一限制。

### 8.7 权限与审批

> pi 无权限系统，进程权限 = 用户权限。审批是 AgentDesk 提供的**用户体验层保护**，不是安全沙箱（见 [11.5](#115-沙箱边界)）。

#### 8.7.1 四档审批模式（截图中的"完全访问"）

| 模式 | 读文件 | 写/编辑文件 | 执行命令 | 网络类工具 / MCP |
|---|---|---|---|---|
| `plan` | ✅ | ❌ 全拦截 | ❌ 全拦截 | ❌ |
| `read-only` | ✅ | 每次询问 | 每次询问 | 每次询问 |
| `auto-edit` | ✅ | ✅ 工作区内自动 | 每次询问 | 每次询问 |
| `full-access` | ✅ | ✅ | ✅ | ✅（仅高危仍询问） |

- 模式是**会话级**，Composer 上一个 chip 直接切换，切换写入会话记录（可审计）。
- 工作区边界：写操作路径不在 workspace 内 → 无论何模式都询问，并高亮"越界写入"。

#### 8.7.2 风险分级

| 等级 | 判定示例 |
|---|---|
| 高危 | `rm -rf`、`sudo`、磁盘/分区操作、`curl \| sh`、写系统目录、修改 `.git/config`、`git push --force`、凭据文件读取（`.env`、`id_rsa`、`auth.json`）、发送数据到外部域名 |
| 中危 | 工作区外写入、安装依赖、启动长驻进程、未在白名单的 MCP 工具 |
| 低危 | 工作区内读写、格式化/构建/测试命令、白名单 MCP 工具 |

高危项**在 `full-access` 下仍然询问**，且弹窗需二次确认（输入确认词或按住 1 秒）。

#### 8.7.3 实现

```ts
// Bridge Extension 侧
pi.on('tool_call', async (e): Promise<ToolCallEventResult | void> => {
  const verdict = await uplink.post('/approval', {
    tool: e.toolName, args: e.args, cwd: ctx.cwd, sessionId: SESSION_ID,
  });
  if (verdict === 'deny') {
    return { block: true, reason: '用户拒绝了此操作（AgentDesk 审批）' };
  }
  // allow / always → 不返回，放行
});
```

- 主进程 `ApprovalEngine`：规则匹配（会话模式 → 会话内 always 记录 → workspace 规则 → 全局规则 → 风险分级默认）→ 命中则直接返回，未命中则弹窗。
- 弹窗内容：工具名、人类可读的操作摘要（bash 命令高亮、edit 展示 diff 预览、write 展示目标路径与字节数、MCP 展示 server+参数）、风险徽标、四个按钮（**允许一次 / 总是允许（此命令/此工具/此 server） / 拒绝 / 拒绝并告诉 Agent 原因**）。
- "拒绝并说明"把理由通过 `block.reason` 回传给模型，让它改变策略（比拒绝更有用）。
- 所有决策写入 `approval_audit` 表（时间、会话、工具、参数哈希、决策、规则来源），设置页可查看/导出/清空。
- ⚠️ `tool_call` 只能拦截**工具调用**。pi 的 `!command`（用户主动 bash）与内置 bash 工具都走工具通道，可拦；但扩展内部直接调用 `pi.exec()` 或 Node API 的行为**无法拦截**——必须在插件安装页明确告知。

### 8.8 会话与存储

#### 8.8.1 职责划分（不重复存储）

| 数据 | 存储方 |
|---|---|
| 会话完整内容（消息树、工具结果、compaction） | **pi**（`sessions/` 下 JSONL + 其内部 SQLite） |
| 会话索引（标题、workspace、模型、时间、token/费用汇总、sessionFile 路径、状态） | AgentDesk SQLite |
| 会话渲染缓存（已归一化的事件流，用于秒开） | AgentDesk SQLite（可重建，可清理） |
| Workspace 列表与设置、信任决策镜像 | AgentDesk SQLite |
| 审批规则与审计、MCP 配置、插件市场缓存、UI 状态 | AgentDesk SQLite / JSON |

打开历史会话：优先读渲染缓存秒开 → 后台起 sidecar 用 `--session <file>` 恢复 → `get_entries`/`get_messages` 校正差异。

#### 8.8.2 数据库 schema（Drizzle）

```ts
workspaces        (id, path, name, icon, trust, lastOpenedAt, settingsJson, createdAt)
sessions          (id, workspaceId, piSessionId, sessionFile, title, provider, model,
                   thinkingLevel, approvalMode, status, messageCount,
                   inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd,
                   createdAt, updatedAt, archivedAt, parentSessionId)
session_events    (id, sessionId, seq, kind, payloadJson, createdAt)          -- 渲染缓存
approval_rules    (id, scope, workspaceId, matcherJson, decision, createdAt, expiresAt)
approval_audit    (id, sessionId, tool, argsHash, argsSummary, risk, decision, ruleId, at)
mcp_servers       (id, scope, workspaceId, configJson, enabled, lastStatus, lastError, updatedAt)
mcp_call_log      (id, sessionId, serverId, tool, ms, ok, errorMessage, at)
providers_meta    (id, providerName, secretId, lastTestedAt, lastTestResultJson)
secrets_meta      (id, label, providerName, createdAt, lastUsedAt)            -- 无明文
plugin_cache      (id, source, metaJson, fetchedAt)
app_state         (key, valueJson)
migrations        (id, appliedAt)
```

#### 8.8.3 Profile（配置档）

- 默认 Profile 直接用 `~/.pi/agent`（**与终端 pi 完全共享**，这是"保留 pi 扩展能力"的字面落实）。
- 可创建隔离 Profile：`~/.agentdesk/profiles/<name>/agent`，spawn 时设 `PI_CODING_AGENT_DIR`。用途：试验性配置、多套 key、演示环境。
- Profile 切换需重启所有 sidecar（UI 明确提示）。

### 8.9 Workspace 与文件

- 添加 workspace：目录选择器 / 拖拽文件夹 / 最近项目。
- 首次打开触发**信任对话框**：说明将加载 `.pi/settings.json`、`.pi/extensions`、`.pi/skills`，可能安装项目声明的包并执行其代码；选项：本次信任 / 永久信任 / 永久信任父目录 / 不信任。决策写 AgentDesk DB **并**通过 `pi` 的 `trust.json` 语义对齐（spawn 时传 `-a`/`-na`）。
- 文件树：懒加载、尊重 `.gitignore`、搜索（内置 `rg`，优先用 pi 托管的 `~/.pi/agent/bin/rg`）。
- Diff 视图：来自 `edit`/`write` 工具结果与 git 工作区状态；支持 unified/split、逐块接受/回滚（回滚 = 反向 patch 写回，记入审计）。
- Git 面板（P1）：当前分支、变更列表、暂存/提交、生成提交信息（调 pi）。

### 8.10 AgentDesk 插件系统（前端扩展，P1）

与 Pi Package 正交：Pi Package 扩展**Agent 能力**，AgentDesk 插件扩展**桌面 UI**。

- 形态：目录 + `agentdesk-plugin.json` 清单（id/name/version/permissions/contributes）。
- 贡献点：`contributes.panels`（右侧/底部面板）、`contributes.renderers`（按 `customType` 渲染自定义消息）、`contributes.commands`（命令面板）、`contributes.themes`、`contributes.settings`。
- 运行时：渲染层沙箱 `<iframe sandbox>`（无 node），通过 postMessage + 受限 API 通信；需要后台能力的插件跑在 `utilityProcess` 中并声明权限（`fs:read:<glob>`、`net:<host>`、`pi:events`）。
- 权限在安装时一次性授予，可随时撤销；未授权 API 调用直接拒绝并记日志。
- V1 只预留清单格式与加载器骨架，不开放第三方分发。

---

## 9. UI/UX 规格

目标：**第一眼像 Codex 桌面端**，第二眼比它更能干（多内核配置、MCP、Skill、插件）。

### 9.1 设计基调

| 维度 | 规格 |
|---|---|
| 窗口 | 无系统标题栏（`titleBarStyle: 'hidden'` + `titleBarOverlay`），自绘菜单栏「文件 / 编辑 / 视图 / 帮助」；macOS 用 `trafficLightPosition` 对齐 |
| 主题 | 深色为默认，浅色/跟随系统可切；主题即一组 CSS 变量，支持导入 pi theme 文件的配色映射 |
| 字体 | UI：`ui-sans-serif, -apple-system, "Segoe UI Variable", "Segoe UI", Inter, "Noto Sans SC"`；等宽：`ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas` |
| 字号 | 基准 13px（可在设置里 12/13/14/15 四档），行高 1.6，正文最大宽度 76ch |
| 圆角 | 卡片/输入 10px，chip/按钮 8px，气泡 12px |
| 密度 | 紧凑：侧栏行高 28px，消息块垂直间距 12px |
| 动效 | Motion 驱动；进入 120ms `ease-out`，退出 90ms；`prefers-reduced-motion` 时全部降级为 0ms |
| 焦点 | 全键盘可达，焦点环 2px 高对比，不使用 `outline: none` |

核心 CSS 变量（`packages/ui/src/theme/tokens.css`）：

```css
:root[data-theme="dark"] {
  --bg-app:        #0d0d0f;   /* 窗口底 */
  --bg-sidebar:    #131316;
  --bg-surface:    #1a1a1e;   /* 卡片/工具块 */
  --bg-elevated:   #22222a;   /* 弹层 */
  --bg-input:      #17171b;
  --border-subtle: #26262d;
  --border-strong: #34343d;
  --fg-primary:    #ececf1;
  --fg-secondary:  #a1a1aa;
  --fg-muted:      #6e6e78;
  --accent:        #4d9fff;   /* 主色：链接/选中/发送 */
  --accent-fg:     #ffffff;
  --ok:            #3fb950;
  --warn:          #d29922;
  --danger:        #f85149;
  --thinking:      #8b7fd4;   /* 思考块专用 */
  --diff-add-bg:   #12261a;
  --diff-del-bg:   #2d1416;
}
```

### 9.2 整体布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ● ● ●   文件  编辑  视图  帮助                                    ─  □  ✕    │ 32px 自绘标题栏
├────────────────────┬─────────────────────────────────────────────────────────┤
│ AgentDesk      ⌄   │  AgentDesk  ›  重构 Pi Bridge      打开位置 ⌄   ⊞  ⧉    │ 44px 会话头
│              🔍 🔔 │─────────────────────────────────────────────────────────│
│                    │                                                         │
│ ＋ 新对话      ⌘N  │   ┌─ 你 ────────────────────────────────────────────┐  │
│ ⑂ 拉取请求         │   │ 把 sidecar 的重启逻辑抽成独立模块              │  │
│ ⏱ 已安排           │   └────────────────────────────────────────────────┘  │
│ ⧩ 插件             │                                                         │
│                    │   ▸ 思考 4s                                             │ 折叠的思考块
│ 项目               │                                                         │
│   ▸ AgentDesk      │   我会先看一下现有实现。                                │
│   ▸ pi-bridge      │                                                         │
│   ＋ 添加项目      │   ⌗ read  packages/pi-bridge/src/sidecar.ts             │ 工具卡（成功）
│                    │     └ 读取 214 行 · 12ms                        ▸       │
│ 最近               │                                                         │
│ • 重构 Pi Bridge   │   ⌗ edit  packages/pi-bridge/src/sidecar.ts     ▾       │ 工具卡（含 diff）
│   MCP 超时排查     │     ┌───────────────────────────────────────────┐       │
│   Skill 校验器     │     │ - const p = spawn(bin, args)              │       │
│   全部会话 →       │     │ + const p = spawnSidecar(cfg)             │       │
│                    │     └───────────────────────────────────────────┘       │
│                    │       接受此更改   撤销                                 │
│                    │                                                         │
│                    │   ⏱ Worked for 42秒  ›              ⧉ 复制  ↗ 分享     │ 回合汇总
│                    │─────────────────────────────────────────────────────────│
│                    │  ┌───────────────────────────────────────────────────┐  │
│                    │  │ Do anything                                       │  │ Composer
│                    │  │                                                   │  │
│                    │  │ ＋   ⚠ 完全访问 ⌄        自定义 · 最高 ⌄     ↑    │  │
│                    │  └───────────────────────────────────────────────────┘  │
│ deepseek-v3    ⌄   │                                                         │
│ ? 帮助             │                                                         │
└────────────────────┴─────────────────────────────────────────────────────────┘
  260px（可拖 200-420，⌘B 折叠）
```

栈叠面板（覆盖在会话区右侧或底部，非独立窗口）：

| 面板 | 触发 | 位置 | 说明 |
|---|---|---|---|
| 文件树 | `⌘⇧E` / 会话头 `⊞` | 左二栏（240px） | workspace 文件浏览 + 搜索 |
| Diff 查看器 | 点工具卡 diff 的「在面板中打开」 | 右侧（可拖，默认 50%） | CodeMirror merge 视图 |
| 终端 | `` ⌘` `` | 底部（默认 240px） | xterm + node-pty，多标签 |
| 上下文用量 | 点会话头 token 徽标 | 右侧抽屉 | 按消息/工具/系统提示分解 |
| 会话树 | `⌘⇧T` | 全屏覆盖层 | 对应 pi `/tree`，分支导航与 fork |

### 9.3 左侧栏

**9.3.1 品牌区（顶部 44px）**
- `AgentDesk ⌄`：点开下拉 —— 切换 Profile（Agent Dir 隔离）、切换内核版本、打开设置、检查更新、关于。
- 🔍 全局搜索（`⌘K`）：会话标题/消息内容/文件名/Skill/MCP 工具混合搜索，结果分组。
- 🔔 通知中心：后台会话完成、审批待处理、MCP 断连、内核升级可用。

**9.3.2 主导航**

| 项 | 快捷键 | 行为 |
|---|---|---|
| ＋ 新对话 | `⌘N` | 在当前 workspace 新建会话；按住 `⌥` 弹出「选择 workspace + 模型 + 审批模式」向导 |
| ⑂ 拉取请求 | — | Git 集成视图（P1）：本地分支 / GitHub PR 列表，可对 PR 起会话 |
| ⏱ 已安排 | — | 定时/触发式任务（P2）：cron 表达式 + 提示词模板，产出写入会话 |
| ⧩ 插件 | — | 插件中心：AgentDesk 插件 + Pi Package + MCP Server + Skill 四个 tab 的统一入口 |

**9.3.3 项目区**
- 每个 workspace 一行，图标显示 git 状态（干净/有改动/冲突）与信任状态（未信任显示 ⚠）。
- 展开后列该 workspace 下的会话（按更新时间倒序，最多 8 条 + 「更多」）。
- 右键菜单：在编辑器中打开、在终端中打开、项目设置（`.pi/settings.json` 图形化）、信任设置、移除。

**9.3.4 最近区**
- 跨 workspace 最近会话；未读/运行中显示蓝点脉冲；hover 出「置顶 / 重命名 / 归档 / 删除」。

**9.3.5 底部状态**
- 当前模型名（点开 = 模型选择器，同 Composer 里那个）。
- `? 帮助`：快捷键表、文档、诊断报告、反馈。
- 内核异常时此处变为红色横条：`⚠ Pi 内核未就绪 · 点击修复`。

### 9.4 会话视图

**9.4.1 会话头**

```
AgentDesk  ›  重构 Pi Bridge  ✎        [42.1k/200k ▓▓▓░░]   打开位置 ⌄   ⊞   ⧉
```

- 面包屑：workspace › 会话名（双击重命名，空名时由模型自动生成标题）。
- token 徽标：`已用/上限` + 进度条；接近压缩阈值变黄，压缩中显示旋转图标。
- 「打开位置 ⌄」：在 VS Code / 终端 / 文件管理器中打开 cwd。
- `⊞` 切换文件树，`⧉` 切换右侧面板布局（单栏 / 会话+Diff / 会话+终端）。

**9.4.2 消息流元素规格**

| # | 元素 | 视觉 | 交互 |
|---|---|---|---|
| 1 | 用户消息 | 右对齐轻底色气泡，附件缩略图/文件 chip | hover 出「编辑并重发」「复制」；编辑重发 = fork 分支 |
| 2 | 助手文本 | 无气泡纯文本流，markdown 渲染，流式打字 | 选中出浮动条「复制 / 引用 / 解释」 |
| 3 | 思考块 | `▸ 思考 4s` 折叠条，展开后 `--thinking` 色左边框、斜体 | 默认折叠（遵循 `hideThinkingBlock`）；流式时自动展开末尾若干行 |
| 4 | 工具卡（通用） | 单行头：`⌗ 图标 工具名 · 主参数摘要`，右侧状态（转圈/✓/✗/⊘）与耗时 | 点击展开完整参数（JSON 折叠树）与结果；`⌥` 点展开全部 |
| 5 | `read` | 摘要 `文件路径 · N 行` | 展开显示带行号的代码（Shiki 高亮），可跳转到文件树 |
| 6 | `edit`/`write` | 摘要 `文件路径 · +12 −3` | 内联 diff（默认折叠超过 40 行的块），底部「接受此更改 / 撤销 / 在面板中打开」 |
| 7 | `bash` | 摘要 `命令首行`，输出流式追加 | 等宽输出区，支持 ANSI 颜色；超 500 行折叠为「显示全部」；可「在终端中继续」 |
| 8 | MCP 工具 | 摘要前缀显示服务器徽标 `github ›` | 展开显示原始 MCP 响应；结果含 resource 时可点开预览 |
| 9 | 审批请求 | 醒目卡片：橙色左边框 + 操作描述 + 风险提示 | 按钮「允许一次 / 总是允许此工具 / 总是允许此命令前缀 / 拒绝」；`⌘⏎` 允许，`⌘⌫` 拒绝 |
| 10 | 压缩标记 | 全宽虚线分隔 `⎯⎯ 上下文已压缩：182k → 46k ⎯⎯` | 点击查看被压缩内容的摘要 |
| 11 | 重试提示 | 灰色小字 `provider 超时，2s 后重试（1/3）` | 可「立即重试」「取消」 |
| 12 | 错误块 | 红色左边框卡片，分层显示 message / 可展开 detail | 「复制诊断信息」「查看日志」 |
| 13 | 回合汇总 | `⏱ Worked for 42秒 ›` + 右侧 `⧉ 复制  ↗ 分享` | 点 `›` 展开该回合统计：模型、tokens（in/out/cache）、成本估算、工具调用次数 |

**9.4.3 流式渲染要求**
- delta 合并窗口 16ms（一帧）批量 flush，避免逐 token setState。
- 长会话用 TanStack Virtual 虚拟化；虚拟项高度用 `ResizeObserver` 测量后缓存。
- 自动滚底：仅当用户处于底部 ±80px 内；一旦上滑显示「跳到最新 ↓」浮动按钮。
- markdown 增量解析：只对最后一个未闭合块做重解析，已完成块记忆化。

### 9.5 Composer（底部输入区）

```
┌──────────────────────────────────────────────────────────────────┐
│ Do anything                                                      │
│                                                                  │
│  ＋    ⚠ 完全访问 ⌄                    自定义 · 最高 ⌄       ↑   │
└──────────────────────────────────────────────────────────────────┘
```

| 控件 | 说明 |
|---|---|
| 输入区 | 自增高（1–12 行后内滚），占位符 `Do anything`；`⏎` 发送，`⇧⏎` 换行；支持粘贴图片/文件、拖拽入框 |
| `＋` | 菜单：附加文件、附加图片、粘贴板截图、引用当前 diff、插入 Prompt 模板、运行 Skill(`/skill:`)、运行斜杠命令 |
| `@` 补全 | 文件/目录（模糊匹配 + gitignore 过滤）、Skill、MCP 资源；`Tab` 接受 |
| `/` 补全 | pi 内置命令 + Extension 命令 + `/skill:*` + MCP prompts，来源用徽标区分 |
| 审批模式 chip | 四档：`计划` / `只读` / `自动编辑` / `完全访问`（危险，橙色 ⚠ 图标）；hover 显示该档允许什么 |
| 模型 chip | 形如 `自定义 · 最高`：左半 = provider/model 选择器，右半 = 思考强度选择器（只列 `thinkingLevelMap` 允许的档位） |
| 发送按钮 | 空闲 `↑`；运行中变 `■ 停止`（`Esc` 亦可）；有排队消息时显示 `↑ 2` |

**9.5.1 运行中输入的语义**
- 会话运行中输入并回车 → **steer**（插队引导），气泡显示黄色左边框「引导中」。
- 已 `settled` 但仍在收尾 → **follow-up**（排队），显示「已排队 · N」。
- 两者的批量策略跟随 pi 的 `steeringMode` / `followUpMode`（`all` / `one-at-a-time`），设置页可改。

**9.5.2 模型选择器**
- 分组：已配置（有可用 auth）/ 未配置（灰显，点击跳到密钥配置）/ 本地（Ollama 等）。
- 每项显示：model id、name（副标题）、context window、是否支持 reasoning、是否支持 image 输入、成本（$/M in-out）。
- 顶部搜索 + 「仅显示 `enabledModels`」开关；底部「管理供应商 →」。
- 切换模型**立即生效于下一回合**（通过 RPC `set_model`，不重启 sidecar）。

### 9.6 终端面板

- 多标签，每标签一个 `node-pty`；shell 默认取 pi 的 `shellPath` 逻辑（Windows 上探测 Git Bash / MSYS2 / WSL）。
- cwd 默认 = 会话 workspace；顶部显示 cwd 与 shell 名。
- 支持「把选中输出发给 Agent」（写入 Composer 并加代码块包裹）。
- 与 pi 的 `bash` 工具**互不共享进程**，UI 上明确区分（工具卡是 Agent 执行，终端是用户执行）。

### 9.7 设置页（`⌘,`）

左侧导航 + 右侧内容，全部改动即时落盘并显示「已保存」轻提示。

| # | 页面 | 内容 |
|---|---|---|
| 1 | 常规 | 语言、主题、字号、启动行为、窗口恢复、托盘 |
| 2 | Agent 内核 | 内核来源（内置/自定义路径/npm 全局）、版本与健康检查、`--offline`、`PI_SKIP_VERSION_CHECK`、Profile（Agent Dir）管理 |
| 3 | 供应商 | 内置 38 provider 列表 + 自定义 provider CRUD（baseUrl/api/headers/authHeader/oauth/compat），映射到 `models.json` |
| 4 | 模型 | 自定义模型 CRUD（id/name/api/reasoning/thinkingLevelMap/input/contextWindow/maxTokens/cost+tiers/compat）、默认模型、`enabledModels` 模式串 |
| 5 | 密钥与登录 | 每 provider 的 API Key（写入加密存储）、OAuth 登录（走 pi 的 auth 交互协议：text/secret/select/manual_code + auth_url/device_code 事件）、密钥来源可选「AgentDesk 保管 / 环境变量 / `!命令`」 |
| 6 | 思考与压缩 | `defaultThinkingLevel`、`thinkingBudgets`、`hideThinkingBlock`、`compaction.*`、`branchSummary.*` |
| 7 | 重试与网络 | `retry.*`、`httpProxy`、`transport`、`httpIdleTimeoutMs`、`websocketConnectTimeoutMs` |
| 8 | 权限与审批 | 默认审批模式、按工具的默认策略、bash 命令前缀白/黑名单、路径白名单、自动批准的 MCP 工具、审批超时行为 |
| 9 | Skill | 见 [8.4](#84-skill-管理) |
| 10 | MCP | 见 [8.3](#83-mcp-host) |
| 11 | Pi Package | 见 [8.5](#85-插件管理) |
| 12 | AgentDesk 插件 | 见 [8.10](#810-agentdesk-插件系统前端扩展p1) |
| 13 | Prompt 与主题 | pi `prompts`/`themes` 资源管理，主题预览 |
| 14 | Shell 与工具 | `shellPath`、`shellCommandPrefix`、`npmCommand`、pi 托管二进制（`~/.pi/agent/bin`）状态 |
| 15 | 会话与存储 | `sessionDir`、数据库位置、导出/导入、清理策略、磁盘占用 |
| 16 | 高级 | 日志级别、打开日志目录、诊断报告、原始配置编辑器（`settings.json`/`models.json` 带 schema 校验的 CodeMirror）、重置 |

**原始配置编辑器**是逃生舱：任何 UI 未覆盖的 pi 设置都能在这里改，保存时用 JSON Schema 校验并给出行内错误。

### 9.8 快捷键

| 快捷键 | 动作 |
|---|---|
| `⌘N` / `Ctrl+N` | 新对话 |
| `⌘⇧N` | 新窗口 |
| `⌘K` | 全局搜索 |
| `⌘P` | 命令面板 |
| `⌘B` | 折叠/展开侧栏 |
| `⌘,` | 设置 |
| `` ⌘` `` | 终端面板 |
| `⌘⇧E` | 文件树 |
| `⌘⇧T` | 会话树 |
| `⏎` / `⇧⏎` | 发送 / 换行 |
| `Esc` | 停止当前回合 |
| `Esc Esc` | 会话树 / fork（跟随 `doubleEscapeAction`） |
| `⌘⏎` / `⌘⌫` | 批准 / 拒绝当前审批 |
| `⌘⌥←/→` | 切换会话标签 |
| `⌘/` | 切换思考块显示 |
| `⌘⇧M` | 打开模型选择器 |
| `⌘⇧A` | 切换审批模式 |

### 9.9 国际化与无障碍

- i18n：`zh-CN`（默认）+ `en`，`i18next` + 类型安全 key；所有面向用户的字符串禁止硬编码。
- 日期/数字/相对时间用 `Intl`；成本按用户区域格式化。
- a11y：所有交互元素有 `aria-label`；消息流用 `role="log" aria-live="polite"`；审批卡用 `role="alertdialog"`；对比度 ≥ WCAG AA；完整键盘导航（含工具卡展开/折叠）。

---

## 10. 进程间通信契约（IPC）

### 10.1 五条原则

1. **渲染层零 Node**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；一切能力经 preload 白名单暂开。
2. **双向分离**：请求/响应用 `invoke`（带返回值），事件推送用 `send`（单向，带 `sessionId` 路由）。
3. **全量 Zod 校验**：每个通道的入参在主进程侧用 Zod parse，失败直接报错不执行。通道类型定义在 `packages/shared` 单一源。
4. **无缓存可恢复**：渲染层崩溃/刷新后，只要重新 `session.attach` 就能拉到完整历史 + 当前状态（事件带单调递增 `seq`，支持断点重传）。
5. **密钥不过渲染层**：任何通道的响应不得包含密钥明文；只能返回 `{ configured: true, hint: 'sk-…Xy9' }`。

### 10.2 通道清单

**会话**

| 通道 | 类型 | 说明 |
|---|---|---|
| `session:create` | invoke | `{ workspaceId, model?, thinking?, approvalMode?, profileId? }` → `{ sessionId }`，内部 spawn sidecar |
| `session:attach` | invoke | `{ sessionId, sinceSeq? }` → `{ history, state, seq }` |
| `session:detach` | invoke | 停止推送（sidecar 保留） |
| `session:send` | invoke | `{ sessionId, text, attachments[] }` → `{ accepted, mode: 'normal'\|'steer'\|'followUp' }` |
| `session:abort` | invoke | 中断当前回合 |
| `session:setModel` | invoke | `{ provider, model, thinking? }` |
| `session:setApprovalMode` | invoke | 四档切换 |
| `session:fork` | invoke | `{ fromMessageId }` → 新 sessionId |
| `session:compact` | invoke | 手动触发压缩 |
| `session:list` | invoke | 列表 + 分页 + 搜索 |
| `session:rename` / `session:archive` / `session:delete` | invoke | 元数据操作 |
| `session:export` | invoke | `{ format: 'md'\|'json' }` → 文件路径 |
| `session:command` | invoke | 执行斜杠命令（透传给 pi） |

**审批**

| 通道 | 类型 | 说明 |
|---|---|---|
| `approval:respond` | invoke | `{ reqId, decision: 'allow'\|'allowAlwaysTool'\|'allowAlwaysPrefix'\|'deny', rememberScope? }` |
| `approval:listRules` / `approval:upsertRule` / `approval:deleteRule` | invoke | 持久规则管理 |
| `approval:audit` | invoke | 审计日志查询（分页/筛选） |

**Workspace 与文件**

| 通道 | 类型 | 说明 |
|---|---|---|
| `workspace:add` / `remove` / `list` | invoke | 项目管理 |
| `workspace:trust` | invoke | `{ workspaceId, decision: 'once'\|'always'\|'alwaysParent'\|'never' }` |
| `workspace:tree` | invoke | 懒加载目录（`{ path, depth }`） |
| `workspace:readFile` | invoke | 返回内容 + 语言推断（有大小上限） |
| `workspace:search` | invoke | ripgrep 封装，流式返回前 N 条 |
| `workspace:revealInOS` / `openExternal` | invoke | 只允许 workspace 内路径与 `http(s)` |
| `workspace:applyRevert` | invoke | 回滚某次 edit（反向 patch） |

**Pi 配置**

| 通道 | 类型 | 说明 |
|---|---|---|
| `piconfig:readSettings` / `writeSettings` | invoke | `{ scope: 'global'\|'project', patch }`，写入采用原子替换 + 备份 |
| `piconfig:readModels` / `writeModels` | invoke | `models.json` 读写 |
| `piconfig:listProviders` | invoke | 内置 + 自定义 provider 合并清单（含 auth 状态） |
| `piconfig:listModels` | invoke | 等价于 `--list-models`，从一个临时 sidecar 拉取并缓存 |
| `piconfig:validate` | invoke | 校验任意 JSON 片段，返回错误位置 |

**密钥与登录**

| 通道 | 类型 | 说明 |
|---|---|---|
| `secret:set` | invoke | `{ providerId, value }` → `safeStorage` 加密存盘 |
| `secret:status` | invoke | 逐 provider 返回 `{ configured, source, hint }` |
| `secret:delete` | invoke | 删除 |
| `auth:startOAuth` | invoke | 启动 OAuth 流，返回 `flowId` |
| `auth:submitPrompt` | invoke | 回答 pi 的 `AuthPrompt`（text/secret/select/manual_code） |
| `auth:cancel` | invoke | 取消流 |

**Skill / MCP / 插件**

| 通道 | 类型 | 说明 |
|---|---|---|
| `skill:list` | invoke | 磁盘清单 × 生效清单 diff 后的结果 |
| `skill:read` / `skill:write` | invoke | SKILL.md 读写 |
| `skill:create` | invoke | 脚手架向导 |
| `skill:toggle` | invoke | 写 settings 的 `skills[]` 包含/排除 |
| `skill:validate` | invoke | frontmatter 完整校验（同 pi 规则） |
| `skill:install` | invoke | 从 git URL / 本地目录 / 压缩包安装 |
| `mcp:list` / `upsert` / `delete` / `toggle` | invoke | Server CRUD |
| `mcp:test` | invoke | 握手测试，返回 server info + 工具数 + 耗时 |
| `mcp:tools` | invoke | 工具清单（含 schema） |
| `mcp:setToolPolicy` | invoke | 按工具开关/免审批 |
| `mcp:logs` | invoke | 最近调用日志 |
| `mcp:import` / `export` | invoke | 兼容 Claude Desktop / Cursor 的 `mcpServers` 格式 |
| `pkg:list` / `install` / `uninstall` / `update` | invoke | Pi Package 管理（调 `pi package` 子命令） |
| `pkg:info` | invoke | 包内资源清单与过滤配置 |
| `extensions:list` | invoke | Extension 兼容性标注（FULL / PARTIAL / DEGRADED / TUI_ONLY，静态扫描 + 运行时捕获） |
| `plugin:list` / `install` / `uninstall` / `enable` / `permissions` | invoke | AgentDesk 插件（P1） |

**内核 / 终端 / 应用**

| 通道 | 类型 | 说明 |
|---|---|---|
| `kernel:status` | invoke | 二进制路径、版本、Node/bash 探测结果、健康度 |
| `kernel:switch` | invoke | 切换内核来源（内置/自定义路径） |
| `kernel:doctor` | invoke | 一键诊断（逐项检查 + 修复建议） |
| `profile:list` / `create` / `switch` / `delete` | invoke | Agent Dir 隔离配置 |
| `pty:create` / `write` / `resize` / `kill` | invoke | 终端 |
| `app:getVersion` / `checkUpdate` / `installUpdate` | invoke | 自动更新 |
| `app:openLogsDir` / `diagnosticReport` | invoke | 可观测性 |
| `app:setTheme` / `setLocale` / `setFontSize` | invoke | 外观 |

**事件推送（主 → 渲染）**

| 通道 | 负载 |
|---|---|
| `event:session` | `{ sessionId, seq, ev: AgentDeskEvent }`（见 8.1 契约） |
| `event:approval` | `{ reqId, sessionId, tool, args, risk, cwd }` |
| `event:auth` | `{ flowId, kind: 'prompt'\|'info'\|'auth_url'\|'device_code'\|'progress'\|'done'\|'error', payload }` |
| `event:mcp` | `{ serverId, state, toolCount?, error? }` |
| `event:resources` | `{ sessionId, skills[], extensions[], commands[], prompts[] }`（来源 `resources_discover`） |
| `event:kernel` | `{ state: 'ok'\|'missing'\|'incompatible'\|'upgradable', detail }` |
| `event:pty` | `{ ptyId, data }` |
| `event:update` | `{ state: 'checking'\|'available'\|'downloading'\|'ready'\|'error', progress? }` |
| `event:toast` | `{ level, message, actions? }` |

### 10.3 preload 形态

```ts
// apps/desktop/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

const invoke = <C extends keyof InvokeMap>(c: C, p: InvokeMap[C]['in']) =>
  ipcRenderer.invoke(c, p) as Promise<InvokeMap[C]['out']>;

const on = <C extends keyof EventMap>(c: C, cb: (p: EventMap[C]) => void) => {
  const h = (_: unknown, p: EventMap[C]) => cb(p);
  ipcRenderer.on(c, h);
  return () => ipcRenderer.off(c, h);
};

contextBridge.exposeInMainWorld('agentdesk', { invoke, on, platform: process.platform });
```

- `InvokeMap` / `EventMap` 定义在 `packages/shared`，**主进程与渲染层共用同一套类型**；新增通道必须先改 map，否则类型不通过。
- 禁止向渲染层暴露任何 `ipcRenderer` 本体、`require`、`fs`、`child_process`。

---

## 11. 安全模型

### 11.1 Electron 硬性配置

| 项 | 值 | 理由 |
|---|---|---|
| `contextIsolation` | `true` | 隔离 preload 与页面上下文 |
| `nodeIntegration` | `false` | 渲染层不得接触 Node |
| `sandbox` | `true` | 渲染进程开启 OS 级沙箱 |
| `webSecurity` | `true` | 不关闭同源策略 |
| `allowRunningInsecureContent` | `false` | — |
| `webviewTag` | `false` | 不使用 webview |
| CSP | `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'` | 生产构建无外部请求 |
| `will-navigate` / `setWindowOpenHandler` | 全部拦截 | 外部链接走 `shell.openExternal` 且仅允许 `https:`/`http:`/`mailto:` |
| 远程内容 | 不加载 | UI 全部本地打包，头像/图片等远程资源经主进程代理后以 `data:` 下发 |

### 11.2 信任与代码执行（诚实告知）

AgentDesk 必须在 UI 上明确告知下列事实，**不得模糊处理**：

1. 信任一个项目 = 允许加载 `.pi/settings.json`、**执行** `.pi/extensions` 下的代码、安装并执行项目声明的 npm/git 包。
2. Skill 可以指使模型做任何事，且可能包含可执行脚本；安装前应审阅。
3. MCP Server 是你本机启动的子进程，拥有与你相同的权限；`command`/`args` 等同于终端命令。
4. `完全访问` 审批模式下，Agent 可以无确认写文件、执行 shell。切换到该模式需二次确认，且会话头持续显示橙色提示条。
5. 首次安装后的引导页必须展示上述风险说明并要求确认。

### 11.3 密钥红线

- 密钥只存于 `safeStorage` 加密后的 `~/.agentdesk/secrets.json`（文件权限 `0600`）。
- 明文**仅**存在于：主进程内存、spawn sidecar 时的 env。
- `models.json` 写入的是 `$AGENTDESK_KEY_<PROVIDER>` 引用，**永不写密钥明文**。
- 日志、错误上报、诊断报告统一过脉敏方法：匹配 `sk-[\w-]{16,}`、`Bearer\s+\S+`、`(api[-_]?key|token|secret|password)\s*[:=]\s*\S+` 替换为 `***`。
- 若 `safeStorage.isEncryptionAvailable()` 为 false（部分 Linux 无 keyring）：拒绍落盘，提示用户改用环境变量或 `!命令` 模式。
- 审批/审计日志中的工具参数存储前同样过脉敏。

### 11.4 供应链

- 内置 pi 二进制从上游 Release 下载，**构建时校验 `SHA256SUMS`**，校验失败则 CI 失败；哈希值写入 `resources/bin/MANIFEST.json` 并在运行时首次启动时再校验一次。
- 依赖锁定 `pnpm-lock.yaml`，CI 跑 `pnpm audit --audit-level high` 与许可扫描。
- Windows 代码签名（EV 证书），macOS 签名 + 公证（notarize），Linux 提供 `.AppImage` 的 GPG 签名。
- 自动更新仅信任官方 feed，`electron-updater` 开启签名验证。

### 11.5 沙箱边界声明

> **审批是防手滑，不是安全沙箱。**

AgentDesk 的审批拦截发生在 Bridge Extension 的 `tool_call` 事件层，它能阻止 pi 的内置工具与注入工具的执行，但它**不能**：

- 限制已经启动的 MCP Server 子进程的行为；
- 限制项目级 pi Extension 在加载阶段的副作用（加载即执行）；
- 限制 `bash` 工具获批后子进程的任意行为；
- 防御提示词注入（模型被恶意仓库内容诱导）。

需要真正隔离时，推荐用容器/虚拟机跑 workspace。V1.x 计划提供「DevContainer 模式」（sidecar 跑在容器内，RPC 走 stdio 附着）作为 P2 项。

---

## 12. 构建、打包与分发

### 12.1 本地开发

| 命令 | 作用 |
|---|---|
| `pnpm i` | 安装依赖 |
| `pnpm kernel:fetch` | 下载当前平台的 pi 二进制到 `resources/bin/`，校验 SHA256 |
| `pnpm dev` | electron-vite 开发模式（主/preload/渲染三路 HMR） |
| `pnpm build` | Turborepo 全量构建 |
| `pnpm typecheck` | `tsc --noEmit` 全包 |
| `pnpm lint` / `pnpm format` | Biome 检查 / 格式化 |
| `pnpm test` | Vitest 单测 |
| `pnpm test:e2e` | Playwright `_electron` E2E |
| `pnpm verify:pi-facts` | 对当前内核跑事实回归（见 14.5） |
| `pnpm package` | 当前平台安装包 |
| `pnpm package:all` | 三平台（CI matrix） |

### 12.2 electron-builder 配置

```jsonc
{
  "appId": "dev.agentdesk.app",
  "productName": "AgentDesk",
  "directories": { "output": "release/${version}", "buildResources": "build" },
  "files": [
    "dist/**",
    "!node_modules/**/{test,__tests__,docs,example,examples}/**",
    "!**/*.{md,map,ts}"
  ],
  "asar": true,
  "asarUnpack": [
    "**/node_modules/node-pty/**",
    "**/node_modules/better-sqlite3/**"
  ],
  "extraResources": [
    { "from": "resources/bin/${platform}-${arch}", "to": "bin" },
    { "from": "resources/pi-ext",                  "to": "pi-ext" }
  ],
  "win": {
    "target": [{ "target": "nsis", "arch": ["x64", "arm64"] }],
    "icon": "build/icon.ico",
    "signtoolOptions": { "signingHashAlgorithms": ["sha256"] }
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "AgentDesk",
    "deleteAppDataOnUninstall": false
  },
  "mac": {
    "target": [{ "target": "dmg", "arch": ["x64", "arm64"] }],
    "category": "public.app-category.developer-tools",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "notarize": true
  },
  "linux": {
    "target": ["AppImage", "deb", "rpm"],
    "category": "Development",
    "maintainer": "AgentDesk"
  },
  "publish": [{ "provider": "github", "releaseType": "release" }]
}
```

要点：
- **pi 二进制不进 asar**，运行时路径 `path.join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'pi.exe' : 'pi')`；首次启动在 macOS/Linux 上 `chmod 0755`。
- **Bridge Extension 不进 asar**（pi 需要直接读取源文件），产出为单文件 `index.js`（避免依赖 jiti 解析 TS）。
- 原生模块（`node-pty`、`better-sqlite3`）必须 `asarUnpack`，并在 CI 上用 `electron-rebuild` 对应 Electron ABI。
- 安装包不预装 Node：pi 二进制是自包含的；但 `bash` 依赖在 Windows 上需引导用户安装 Git for Windows（安装后首次启动检测，给下载链接）。

### 12.3 自动更新

- `electron-updater`，GitHub Releases 作为 feed；通道 `stable` / `beta`（设置可选）。
- 策略：启动后 30s + 每 6h 检查；下载完成后不强制重启，只在侧栏底部提示「重启以更新」；**有会话正在运行时绝不自动重启**。
- 内核版本与应用版本解耦：应用可单独提示「Pi 内核有新版本」，允许只更新内核（下载到 `~/.agentdesk/kernels/<version>/` 并切换）。

### 12.4 平台差异清单

| 项 | Windows | macOS | Linux |
|---|---|---|---|
| 标题栏 | `titleBarOverlay` 自绘 | `hiddenInset` + 红绿灯位置 | 自绘（部分 WM 需降级） |
| bash | 探测 Git Bash → MSYS2 → WSL，否则引导安装 | 系统自带 | 系统自带 |
| IPC 内部通道 | Named Pipe / HTTP loopback | Unix socket / HTTP loopback | 同 macOS |
| 密钥存储 | DPAPI | Keychain | libsecret（缺失时降级提示） |
| 路径大小写 | 不敏感，统一 `path.resolve` + 小写比较 | 默认不敏感 | 敏感 |
| 长路径 | 启用长路径支持，代码不假设 <260 | — | — |
| 换行符 | 读时容 CRLF，写时保持原文件风格 | LF | LF |
| 自启动 | 注册表 | LaunchAgent | `.desktop` autostart |

---

## 13. 可观测性

### 13.1 日志

- `pino`，JSON 结构化，按天轮转，保留 7 天 / 单文件 ≤ 10MB。
- 位置：`app.getPath('logs')/agentdesk/`，分 `main.log` / `sidecar-<sessionId>.log` / `mcp-<serverId>.log`。
- 每条带 `traceId`：一个回合一个 traceId，贯穿 `渲染发送 → IPC → sidecar RPC → Bridge 事件 → MCP 调用 → 回传`。
- **原始 RPC 报文录制**（`--debug-rpc`）：每行 JSONL 原文写入独立文件，过脉敏后保留；这是排查内核升级兼容问题的唯一可靠手段。
- 渲染层错误边界捕获 → `event:toast` + 写日志，不白屏。

### 13.2 本地指标

存入 SQLite，设置页可视化（**不上传**）：

- 启动耗时拆分（app ready / 首帧 / DB 就绪 / 内核探测）。
- sidecar 启动到首事件延迟、崩溃次数与退出码分布。
- 每回合：首 token 延迟、总耗时、token 用量与估算成本、工具调用次数。
- MCP：握手耗时、调用 P50/P95、超时率、错误率。
- 审批：请求数、批准率、平均决策耗时。
- 渲染：长会话帧率、虚拟列表 jank 次数。

### 13.3 诊断报告

`设置 → 高级 → 生成诊断报告` 产出一个 zip（默认不自动发送，用户自行选择分享）：

- 应用/内核/Electron/Node/OS 版本，bash 探测结果。
- 过脉敏后的 `settings.json` / `models.json` / MCP 配置。
- 最近 200 行 `main.log` 与最近一个 sidecar 日志。
- `resources_discover` 最后一次快照（Skill/Extension 生效清单）。
- 关键指标汇总。

---

## 14. 测试策略

| 层级 | 工具 | 覆盖对象 | 硬指标 |
|---|---|---|---|
| 单测 | Vitest | 纯函数：事件归一化、JSON Schema→TypeBox、审批规则引擎、设置合并、测脉敏、路径白名单 | 行覆盖 ≥ 80%，`pi-bridge` 与 `mcp-host` ≥ 90% |
| 契约测试 | Vitest + 录制回放 | 用真实录制的 RPC JSONL 回放，验证解析器与归一化层 | 内核升级时必跑，不得 skip |
| 集成 | Vitest + 真 sidecar | 真实 spawn pi，模型指向 Mock Provider | 关键链路全绿 |
| E2E | Playwright `_electron` | 完整用户旅程 | 10 个场景全绿 |
| 视觉 | Playwright 截图对比 | 主界面/设置页/深浅主题 | 差异 < 0.2% |
| 打包验收 | CI matrix | 三平台安装包可装可启可跑一轮对话 | 每个 Release 必过 |

### 14.1 E2E 关键场景

1. 首次启动 → 引导页（风险告知、选内核、填密钥）→ 进主界面。
2. 添加 workspace → 信任弹窗选「永久信任」→ 新对话 → 发一句话 → 流式渲染完成 → 回合汇总出现。
3. 请模型改一个文件 → 审批弹卡 → 拒绝 → 模型收到拒绝理由并改变策略。
4. 切到「自动编辑」→ 同样请求无弹窗执行 → diff 卡出现 → 点「撤销」文件恢复原样。
5. 配置一个本地 stdio MCP Server → 测试连接成功 → 工具出现在工具清单 → 引导模型调用它 → 工具卡带服务器徽标。
6. MCP Server 进程被杀 → 状态灯变红 → 自动重连成功 → 工具重新可用。
7. 新建 Skill（向导）→ `resources_discover` 中出现 → `/skill:name` 能调起 → 禁用后消失。
8. 安装一个 npm Pi Package → 包内 skill/extension 生效 → 部分过滤后只保留指定资源 → 卸载干净。
9. 切换 provider/model → 下一回合生效且 sidecar 未重启；思考强度选择器只列合法档位。
10. 会话运行中强杀 sidecar → UI 提示内核崩溃 → 点「重连并恢复」→ 历史完整、可继续对话。

### 14.2 Mock Provider

`packages/testing/mock-provider`：一个本地 HTTP 服务，实现 `openai-completions` 子集，按脚本回放。

- 能构造：纯文本、thinking 块、连续多个 tool_call、长输出（测虚拟列表）、429/500/超时（测重试）、超长上下文（测压缩）。
- 通过 `models.json` 注入为 `mock` provider，E2E 不花真钱、不联网、结果确定。

### 14.3 反耦合 CI 检查

以下任一失败则 CI 红：

1. `packages/ui` 不得 import Node 内置模块或 `electron`。
2. `apps/desktop/src/renderer` 不得出现 `require(`、`process.` （除 `process.env.NODE_ENV`）。
3. 新增 IPC 通道必须同时出现在 `InvokeMap`/`EventMap` 与 preload 白名单中。
4. 任何包不得 import `apps/*`（依赖方向单向）。
5. `resources/pi-ext` 不得 import `packages/*`（它跑在 pi 进程内，必须自包含）。
6. 源码中不得出现硬编码的人类可读中英文 UI 文案（i18n 检查）。
7. 不得使用 Node `readline` 处理 sidecar stdout（专项 lint 规则）。

### 14.4 性能预算

| 指标 | 预算 |
|---|---|
| 冷启动到可交互 | ≤ 1.5s（SSD，不含内核 spawn） |
| sidecar spawn 到可发送 | ≤ 1.2s |
| 首 token 显示延迟 | ≤ provider 延迟 + 80ms |
| 2000 消息会话滚动 | ≥ 55fps |
| 流式渲染 CPU（渲染进程） | ≤ 25%（单核） |
| 空闲内存（主+渲染） | ≤ 320MB |
| 安装包体积 | ≤ 180MB（含 pi 二进制） |

### 14.5 上游事实回归（`pnpm verify:pi-facts`）

因为本 README 第 4 章的每一条都是开发假设，内核升级会默默弄坏它们。这个脚本对当前内核实测：

| 检查 | 断言 |
|---|---|
| `pi --version` | 符合声明的兼容范围 |
| `pi --mode rpc` 启动 | 能收到预期的启动事件 |
| RPC 命令集 | README 列出的命令全部存在且参数名未变 |
| RPC 事件集 | README 列出的事件全部能触发到 |
| `tool_call` 拦截 | 返回 `{ block: true }` 确实能阻止执行 |
| `registerTool` | 注入工具能被模型看到并调用 |
| `resources_discover` | 能触发；载荷为通知（pi 0.83.0），AgentDesk 用自身规则补齐 skills/extensions/commands 清单 |
| 信任行为 | 不传 `-a` 时项目资源确实不加载；传 `-a` 时加载 |
| 配置路径 | `PI_CODING_AGENT_DIR` 确实重定向全部子目录 |
| `$VAR` 插值 | `models.json` 的 `$AGENTDESK_KEY_X` 能从 env 取到 |
| thinking 档位 | `thinkingLevelMap` 的 `null` 确实被跳过 |

输出一份 Markdown 报告，每项 ✅/❌/⚠；**任何 ❌ 都要先改 README 再改代码**。

---

## 15. 开发里程碑

每个里程碑带一个 **Gate**：验收不过不得进下一个。Gate 必须是**可执行的命令或可观察的行为**，不接受「代码已写完」这种描述。

### M0 地基

- pnpm workspace + Turborepo + TS strict + Biome + Vitest 骨架。
- `packages/shared` 类型与 Zod schema 骨架。
- electron-vite 三路构建跑通，空窗口能开，preload 白名单机制就位。
- `pnpm kernel:fetch` 能下载并校验 pi 二进制。

**G0**：`pnpm dev` 开出窗口；`pnpm typecheck && pnpm lint && pnpm test` 全绿；`resources/bin/` 下有校验通过的 `pi`，`pi --version` 能跑。

### M1 Pi Bridge 最小闭环

- sidecar spawn / 参数矩阵 / env 注入 / 生命周期管理。
- JSONL 分帧器（**自写，不用 readline**）+ 背压处理 + 部分行缓存。
- 事件归一化层（`AgentDeskEvent`）。
- 内核探测与健康检查（包含 Windows bash 探测）。

**G1**：命令行集成测试下，能 `spawn → 发一句 → 收到 msg.delta 流 → agent.settled → 优雅退出`；杀进程能被检测到并上报。

### M2 会话 UI 骨干

- 三栏布局 + 自绘标题栏 + 主题 token。
- 消息流：用户/助手/思考/工具卡四类元素，markdown + Shiki。
- Composer：输入、发送、停止、steer/follow-up 状态。
- 虚拟列表 + 自动滚底策略。

**G2**：接真实 provider（或 Mock）能完整跑一轮多回合对话；2000 消息会话滚动 ≥ 55fps；流式时渲染进程 CPU ≤ 25%。

### M3 存储与会话管理

- SQLite + Drizzle schema 与迁移。
- 会话 CRUD、列表、搜索、归档、导出。
- `session:attach` 断点重传（`seq`）。
- workspace 管理 + 信任流程（含 `-a`/`-na` 传递）。

**G3**：刷新渲染层/重启应用后，会话历史与运行状态完整恢复；E2E 场景 2 与 10 通过。

### M4 Provider / Model / 密钥

- 内置 provider 目录 + 自定义 provider/model CRUD → `models.json`。
- `safeStorage` 密钥存储 + `$AGENTDESK_KEY_*` 注入链路。
- OAuth 交互桥（`AuthPrompt` 四种形态 + `auth_url`/`device_code`）。
- 模型选择器与思考强度选择器（遵循 `thinkingLevelMap`）。

**G4**：纯 UI 操作完成「新增一个 OpenAI 兼容供应商 + 一个模型 + 填密钥 → 对话成功」；`grep -r "sk-" ~/.pi ~/.agentdesk` 无命中；E2E 场景 9 通过。

### M5 权限与审批

- Bridge Extension 落地（uplink + `tool_call` 拦截）。
- 四档审批模式 + 规则引擎（工具粒度 / bash 前缀 / 路径白名单）。
- 审批 UI（卡片 + 快捷键 + 记住选择）+ 审计日志。

**G5**：E2E 场景 3 与 4 通过；`只读` 档下模型无法写入任何文件（硬盘快照对比无变化）；审批超时默认行为为拒绝。

### M6 MCP Host

- Server CRUD（stdio/SSE/StreamableHTTP）+ 连接池 + 重连与退避。
- 工具发现 → 命名 → JSON Schema→TypeBox → `registerTool` 注入。
- 调用链路（含进度、取消、image/resource 降级、输出截断）。
- 管理界面（状态灯、测试连接、工具清单、调用日志、导入导出）。

**G6**：E2E 场景 5 与 6 通过；导入 Claude Desktop 格式的 `mcpServers` 配置即可用；MCP 超时不拖死回合。

### M7 Skill / Package / 设置全面

- Skill 管理全功能（浏览/详情/启停/新建/编辑/校验/安装/冲突提示）。
- Pi Package 管理（npm/git/本地，资源过滤，作用域）。
- 16 个设置页全部落地 + 原始配置编辑器（schema 校验）。
- Profile（Agent Dir 隔离）。

**G7**：E2E 场景 7 与 8 通过；任意 pi 设置项都能在 UI 里改到（图形化或原始编辑器）；切 Profile 后两套配置互不影响。

### M8 工作区体验

- 文件树 + 搜索（ripgrep）。
- Diff 面板（CodeMirror merge）+ 逐块接受/回滚。
- 终端面板（xterm + node-pty，多标签）。
- 会话树 / fork、上下文用量抽屉、全局搜索、命令面板。

**G8**：全部快捷键可用；视觉回归差异 < 0.2%；空闲内存 ≤ 320MB。

### M9 发行

- electron-builder 三平台打包 + 签名/公证。
- `electron-updater` 自动更新 + 内核独立升级。
- 首次启动引导页（含风险告知）。
- 日志/指标/诊断报告。
- i18n 完成度 100%，a11y 审查。

**G9**：三平台安装包在干净环境（无 Node、无 pi、无配置）可装可启，跑完引导页后能完成一轮含工具调用的对话；安装包 ≤ 180MB；自动更新从 N-1 到 N 验证成功。

### P1 / P2 候选（V1 之后）

拉取请求视图与 Git 面板、已安排任务、AgentDesk 插件开放分发、MCP Prompts/Resources 完整打通、多会话并行与子任务编排、DevContainer 模式、会话云同步（端到端加密）。

---

## 16. 工程规范

### 16.1 代码

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`；**禁用 `any`**（必要时用 `unknown` + 收缩）。
- 边界数据（IPC、RPC、配置文件、MCP 响应）全部过 Zod；**类型断言不算校验**。
- 错误统一用 `AgentDeskError`（`code` + `scope` + `cause` + `userMessage`）；不得 `throw` 字符串。
- 禁止在渲染层做路径拼接与文件判断；一律过主进程。
- 异步取消全部基于 `AbortSignal`，不用自定义 flag。
- 命名：文件 `kebab-case`，类型 `PascalCase`，函数/变量 `camelCase`，常量 `SCREAMING_SNAKE`，IPC 通道 `domain:action`。
- 注释只写**为什么**（尤其是与 pi 行为相关的 workaround 必须注明上游依据），不写**是什么**。

### 16.2 Git

- 分支：`main`（可发布）/ `feat/*` / `fix/*` / `chore/*`。
- Conventional Commits；作用域用包名（`feat(pi-bridge): ...`）。
- PR 必须关联里程碑与 Gate 项；涉及上游行为的变更必须同步更新 README 第 4 章。
- 禁止 force push 到 `main`。

### 16.3 完成定义（DoD）

一个功能算完成，必须全部满足：

1. 类型、lint、单测全绿；新逻辑有对应测试。
2. 涉及 IPC 的，`InvokeMap`/`EventMap`/preload 三处同步。
3. 涉及 UI 的，深浅主题、中英文、键盘导航、空态/加载态/错误态都已处理。
4. 涉及外部进程的，有超时、取消、失败重试、进程残留清理。
5. 涉及敏感数据的，已确认日志与持久化路径上无明文。
6. 影响用户可见行为的，README 相应章节已更新。
7. 重大技术选择有 ADR。

### 16.4 ADR

`docs/adr/NNNN-title.md`，格式：背景 / 决定 / 替代方案及否定理由 / 后果与失效条件。已规划：

| ID | 主题 |
|---|---|
| ADR-0001 | 只支持 Pi 单内核，废弃多 Runtime 抽象 |
| ADR-0002 | Sidecar + RPC 而非嵌入 SDK |
| ADR-0003 | Bridge Extension 作为能力注入点 |
| ADR-0004 | MCP 自建 Host 而非等上游支持 |
| ADR-0005 | 审批基于 `tool_call` 拦截，并声明其边界 |
| ADR-0006 | 密钥用 `safeStorage` + env 注入 + `$VAR` 引用 |
| ADR-0007 | Electron 而非 Tauri |
| ADR-0008 | SQLite/Drizzle 作为本地存储，不接管 pi 会话文件 |
| ADR-0009 | Uplink 用 HTTP loopback + 一次性 token |
| ADR-0010 | 默认共享用户真实 `~/.pi/agent`，Profile 为可选隔离 |

### 16.5 上游同步流程

pi 是快速迭代的上游，固定流程：

1. 锅定一个兼容基线版本，记在 `resources/bin/MANIFEST.json`。
2. 升级时先跑 `pnpm verify:pi-facts`，输出差异报告。
3. 有 ❌ 先改 README 第 4 章（事实清单），再改适配代码，再跑契约测试与 E2E。
4. 升级单独开 PR，不与功能改动混提。
5. 保留上一个内核版本二进制一个发行周期，允许用户回退。

---

## 17. 风险与开放问题

### 17.1 风险登记

| ID | 风险 | 影响 | 应对 |
|---|---|---|---|
| R1 | pi 升级改动 RPC 契约 | 高 | 事实回归脚本 + 契约测试 + 内核版本锅定与回退 |
| R2 | Bridge Extension 被用户误禁用或被项目配置排除 | 高（MCP+审批全失效） | 强制以 `--extension` 传入（不依赖 settings）；启动后校验 `resources_discover` 中存在，缺失则拒绝进入会话 |
| R3 | 项目信任遗漏 `-a` 导致资源静默失效 | 中高（难排查） | 启动参数必填校验；`resources_discover` 与磁盘清单 diff 后在 UI 显示 `untrusted` |
| R4 | Windows 无 bash | 高（bash 工具不可用） | 启动探测 + 引导安装 + 降级提示；诊断报告包含探测结果 |
| R5 | 原生模块 ABI 与 Electron 不匹配 | 中 | CI 跑 `electron-rebuild`；失败时 `node-pty` 降级为禁用终端而非崩溃 |
| R6 | MCP Server 质量参差（挂死/刷日志/工具 schema 非法） | 中 | 进程级隔离 + 超时 + 日志限流 + schema 降级为 `Any` + 熊断器 |
| R7 | 长会话渲染卡顿 | 中 | 虚拟列表 + 帧内批量 flush + markdown 块记忆化 + 性能预算卡 CI |
| R8 | 密钥泄露（日志/报告/截图） | 高 | 统一过脉层 + 专项单测 + CI 扫描日志样本 |
| R9 | 审批被误以为是安全沙箱 | 中 | UI 与文档明确声明边界（见 11.5） |
| R10 | 上游许可与商标合规 | 中 | 确认 pi 许可证后再内置分发；保留归属声明；不使用上游商标作为本产品标识 |

### 17.2 待定问题

| ID | 问题 | 当前倾向 |
|---|---|---|
| Q1 | 内置 pi 二进制是否符合上游许可？ | 先核实 LICENSE；若不允许，改为首次启动从官方 Release 下载 |
| Q2 | 一会话一进程在多会话并行时的内存开销？ | 先实测；若超预算则引入「空闲会话冻结（退出进程，保留会话文件，下次发言时 `--session` 恢复）」 |
| Q3 | Uplink 用 HTTP 还是 Unix socket / Named Pipe？ | HTTP loopback 优先（跳平台、好调试）；如有端口冲突或安全顾虑再换 |
| Q4 | 是否接管 pi 的会话文件作为唯一真相？ | 不接管。pi 会话文件用于恢复/fork，AgentDesk DB 存 UI 层需要的归一化历史 |
| Q5 | 多窗口同时附着同一会话？ | V1 允许多附着（事件广播），但发送串行化 |
| Q6 | AgentDesk 插件是否开放市场？ | V1 不开；先把权限模型做死 |
| Q7 | 是否支持远程内核（SSH/容器）？ | 架构上预留（sidecar 启动器可插拔），V1 不实现 |

---

## 18. 附录

### 18.1 路径速查

| 用途 | 路径 |
|---|---|
| Pi 全局配置 | `~/.pi/agent/`（`PI_CODING_AGENT_DIR` 可覆盖） |
| Pi 项目配置 | `<workspace>/.pi/` |
| Pi 设置 / 认证 / 模型 / 信任 | `~/.pi/agent/{settings,auth,models,trust}.json` |
| Pi 资源 | `~/.pi/agent/{extensions,skills,prompts,themes,tools}/` |
| Pi 托管二进制 | `~/.pi/agent/bin/` |
| Pi 包 | `~/.pi/agent/{npm,git}/`、`<ws>/.pi/npm/` |
| 共享 Skill 目录 | `~/.agents/skills/`、`<ws>/.agents/skills/` |
| AgentDesk 数据目录 | `~/.agentdesk/` |
| AgentDesk 数据库 | `~/.agentdesk/agentdesk.db` |
| AgentDesk 密钥 | `~/.agentdesk/secrets.json`（`safeStorage` 加密，`0600`） |
| AgentDesk MCP 配置 | `~/.agentdesk/mcp.json` |
| AgentDesk Profile | `~/.agentdesk/profiles/<id>/agent/` |
| AgentDesk 内核缓存 | `~/.agentdesk/kernels/<version>/` |
| AgentDesk 日志 | `app.getPath('logs')/agentdesk/` |
| 内置 pi 二进制（已安装） | `<resourcesPath>/bin/pi[.exe]` |
| Bridge Extension（已安装） | `<resourcesPath>/pi-ext/agentdesk-bridge/` |

### 18.2 上游文档索引

开发时请直接查阅 pi 仓库 `packages/coding-agent/docs/`：

| 文档 | 用途 |
|---|---|
| `rpc.md` | **最重要**。RPC 命令/事件/Extension UI 子协议全表 |
| `extensions.md` | Extension API 完整参考（工具注册、事件、UI） |
| `settings.md` | `settings.json` 全字段 |
| `models.md` | `models.json` provider/model 格式与值解析 |
| `skills.md` | Skill 发现规则与 frontmatter |
| `packages.md` | Pi Package 源、清单、作用域 |
| `sdk.md` | 编程式嵌入（本项目不用，但可参考类型） |
| `usage.md` | CLI 参数与能力边界声明 |
| `windows.md` | Windows bash 依赖与探测顺序 |
| `sessions.md` | 会话文件格式与恢复 |
| `auth.md` | 认证与 OAuth 流程 |
| `themes.md` / `prompts.md` | 主题与提示模板 |

### 18.3 术语映射（UI 文案 ↔ pi 概念）

| UI 文案 | 对应 pi 概念 |
|---|---|
| 新对话 | 新 session（新 sidecar 进程） |
| 项目 | workspace（sidecar 的 `cwd`） |
| 思考强度 | `thinkingLevel` |
| 审批模式 | AgentDesk 自有概念（pi 无权限系统） |
| 技能 | Skill（Agent Skills 标准） |
| 扩展包 | Pi Package（npm/git/本地） |
| 工具服务器 | MCP Server（AgentDesk 自建） |
| 插件 | AgentDesk 前端插件（与 Pi Package 正交） |
| 配置集 | Profile（独立 Agent Dir） |
| 上下文压缩 | `compaction` |
| 引导 / 排队 | steering / follow-up |
| 会话树 | pi `/tree` |

### 18.4 许可与致谢

- AgentDesk 自身许可证待定（待 Q1 核实上游许可后确定）。
- 内核来自 [`earendil-works/pi`](https://github.com/earendil-works/pi)（`@earendil-works/pi-coding-agent`），保留其许可与归属声明。
- Skill 遵循 [Agent Skills 规范](https://agentskills.io/specification)。
- 工具集成遵循 [Model Context Protocol](https://modelcontextprotocol.io)。
- UI 形态参考 OpenAI Codex 桌面端，不使用其商标与资源。

---

**AgentDesk** — 把终端里的 Pi，变成桌面上的 Agent。
