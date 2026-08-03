# vendor — 开源项目完整拷贝

| 目录 | 项目 | commit | 用途 | 引入时间 |
|---|---|---|---|---|
| `opencode/` | sst/opencode | 1882c33 | 桌面壳/UI/Server/SDK 基线 | v0.3（已引入） |
| `pi/` | earendil-works/pi | f0deb8d | 第二 Runtime 基线 | v0.3（已引入） |
| `pi-web/` | pi-web | v0.8.6 | Pi 会话 Web UI / HTTP+SSE API | v0.3（已引入） |

## 后期引入（当前保留在 `开源参考/`）

| 项目 | 触发 Milestone | 用途 |
|---|---|---|
| anything-llm | M14 / M23 | Document/Knowledge Runtime（collector + server + RAG） |
| open-webui | 可选 | 通用 Agent Web UI / Pipelines 参考 |
| open-webui/desktop | 不使用 | Electron 壳与 opencode desktop 重复 |

## 规则

- 全部保持**零修改**；
- 排除 `.codegraph` 目录（由 AgentDesk 根目录统一索引）；
- 升级 = 整体替换目录 + 更新 `../UPSTREAM_SYNC.md`。