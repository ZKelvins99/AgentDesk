/**
 * AgentDesk 一键启动（跨平台，不依赖 PowerShell）。
 * 用法：npm start
 * Panel 启动时会自动拉起 opencode（:4096）与 pi-web（:30141），已运行则跳过。
 */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { connect } from "node:net"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const DEVLOGS = join(ROOT, ".devlogs")
mkdirSync(DEVLOGS, { recursive: true })

const PANEL_PORT = Number(process.env.AGENTDESK_PANEL_PORT ?? "8787")

/** 8787 已被占用（Panel 已在运行）则提示后直接退出 */
const alreadyRunning = await new Promise((resolve) => {
  const socket = connect({ port: PANEL_PORT, host: "127.0.0.1" })
  const timer = setTimeout(() => { socket.destroy(); resolve(false) }, 1200)
  socket.once("connect", () => { clearTimeout(timer); socket.destroy(); resolve(true) })
  socket.once("error", () => { clearTimeout(timer); resolve(false) })
})
if (alreadyRunning) {
  console.log(`AgentDesk Panel 已在运行：http://localhost:${PANEL_PORT}`)
  process.exit(0)
}

process.env.AGENTDESK_PANEL_PORT = String(PANEL_PORT)
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
