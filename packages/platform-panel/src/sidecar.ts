/**
 * AgentDesk Sidecar 管理器：启动 Panel 时自动拉起 Runtime 服务。
 * - opencode server（:4096）
 * - pi-web（:30141）
 * 已监听则跳过（幂等），未监听则后台 spawn，日志写入 .devlogs。
 */
import { spawn, type ChildProcess } from "node:child_process"
import { connect } from "node:net"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { mkdirSync, openSync } from "node:fs"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const DEVLOGS = join(ROOT, ".devlogs")
mkdirSync(DEVLOGS, { recursive: true })

const children: ChildProcess[] = []

function isPortOpen(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" })
    const timer = setTimeout(() => { socket.destroy(); resolve(false) }, timeoutMs)
    socket.once("connect", () => { clearTimeout(timer); socket.destroy(); resolve(true) })
    socket.once("error", () => { clearTimeout(timer); resolve(false) })
  })
}

function logFile(name: string): { stdout: string; stderr: string } {
  return {
    stdout: join(DEVLOGS, `${name}.out.log`),
    stderr: join(DEVLOGS, `${name}.err.log`),
  }
}

/** 拉起 opencode server（bun serve，端口 4096） */
async function ensureOpencode(): Promise<boolean> {
  if (await isPortOpen(4096)) return true
  const bun = process.env.BUN_EXE ?? "D:\\program\\nodejs\\node_modules\\bun\\bin\\bun.exe"
  const log = logFile("oc-server")
  const out = openSync(log.stdout, "a")
  const err = openSync(log.stderr, "a")
  const child = spawn(bun, ["run", "--cwd", "packages/opencode", "--conditions=browser", "src/index.ts", "serve", "--port", "4096"], {
    cwd: join(ROOT, "vendor", "opencode"),
    env: {
      ...process.env,
      AGENTDESK_INTERNAL_API_KEY: process.env.AGENTDESK_INTERNAL_API_KEY ?? "",
      HTTP_PROXY: "http://127.0.0.1:7890",
      HTTPS_PROXY: "http://127.0.0.1:7890",
      NO_PROXY: "127.0.0.1,localhost,128.128.2.6",
    },
    windowsHide: true,
    stdio: ["ignore", out, err],
  })
  children.push(child)
  return waitForPort(4096, 30000)
}

/** 拉起 pi-web（next dev，端口 30141） */
async function ensurePiWeb(): Promise<boolean> {
  if (await isPortOpen(30141)) return true
  const node = process.env.NODE_EXE ?? "D:\\program\\nodejs\\node.exe"
  const log = logFile("pi-web")
  const out = openSync(log.stdout, "a")
  const err = openSync(log.stderr, "a")
  const child = spawn(node, ["node_modules\\next\\dist\\bin\\next", "dev", "-H", "127.0.0.1", "-p", "30141"], {
    cwd: join(ROOT, "vendor", "pi-web"),
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    windowsHide: true,
    stdio: ["ignore", out, err],
  })
  children.push(child)
  return waitForPort(30141, 60000)
}

function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const tick = async () => {
      if (await isPortOpen(port)) return resolve(true)
      if (Date.now() >= deadline) return resolve(false)
      setTimeout(tick, 1000)
    }
    void tick()
  })
}

/** 一键启动：Panel 启动前调用，自动拉起缺失的 Runtime 服务 */
export async function ensureSidecars(): Promise<{ opencode: boolean; piWeb: boolean }> {
  const [opencode, piWeb] = await Promise.all([ensureOpencode(), ensurePiWeb()])
  return { opencode, piWeb }
}

export function sidecarChildren(): ChildProcess[] {
  return children
}
