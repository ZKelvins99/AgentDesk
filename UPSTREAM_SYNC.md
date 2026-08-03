# UPSTREAM_SYNC

## 记录（2026-08-03）

| vendor 目录 | 上游仓库 | commit / 版本 | 说明 |
|---|---|---|---|
| `vendor/opencode` | sst/opencode（`开源参考/opencode`） | 1882c33（2026-08-02） | npm `@opencode-ai/sdk@1.18.11` 与本拷贝版本一致 |
| `vendor/pi` | earendil-works/pi（`开源参考/pi`） | f0deb8d（2026-08-03） | `@earendil-works/pi-client@0.83.0`（未发布 npm） |
| `vendor/pi-web` | pi-web（`开源参考/pi-web`） | v0.8.6（dfab585） | Next.js Web UI |

## 同步流程

1. 更新 `开源参考/` 内对应仓库到目标版本；
2. 用 robocopy 整体替换 `AgentDesk/vendor/<project>`（排除 `.codegraph`）；
3. 更新本表 commit；
4. 对齐适配器依赖版本（如 `runtime-opencode` 的 `@opencode-ai/sdk`）；
5. 跑 Native OpenCode / Native Pi 回归（回归矩阵见文档第 29 节）；
6. 记录到 `AGENTDESK_DEVELOPMENT.md` 的 CHANGE_LOG。

## 原则

- 上游仓库保持零修改；
- 任何必须的 patch 记录到 `AGENTDESK_PATCHES.md`；
- 适配器优先依赖已发布 npm 包，版本与 vendor commit 对齐。