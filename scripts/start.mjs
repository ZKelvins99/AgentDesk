/**
 * AgentDesk 一键启动（跨平台，不依赖 PowerShell）。
 * 用法：npm start
 * Panel 启动时会自动拉起 opencode（:4096）与 pi-web（:30141），已运行则跳过。
 */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const DEVLOGS = join(ROOT, ".devlogs")
mkdirSync(DEVLOGS, { recursive: true })

process.env.AGENTDESK_PANEL_PORT = process.env.AGENTDESK_PANEL_PORT ?? "8787"
process.env.AGENTDESK_STORAGE_FILE = process.env.AGENTDESK_STORAGE_FILE ?? join(DEVLOGS, "agentdesk.db")
const workspace = join(ROOT, "test-workspace")
process.env.AGENTDESK_WORKSPACE_PATH = process.env.AGENTDESK_WORKSPACE_PATH ?? (existsSync(workspace) ? workspace : undefined)

const serverEntry = join(ROOT, "packages", "platform-panel", "src", "server.ts")
const child = spawn(process.execPath, [serverEntry], {
  cwd: ROOT,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
})

child.on("exit", (code) => process.exit(code ?? 0))
