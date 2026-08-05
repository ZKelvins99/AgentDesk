/**
 * AgentDesk Dev Panel HTTP server (M04-T05/T06).
 * Zero-dependency Node http server:
 *   GET  /               -> panel UI (public/index.html)
 *   GET  /api/runtimes   -> runtime list + active selector
 *   POST /api/switch     -> switch active runtime (no restart)
 *   POST /api/send       -> send message to active runtime
 *   GET  /api/events     -> SSE stream of AgentEvents
 */
import { createServer } from "node:http"
import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { AgentDeskPanel } from "./panel.ts"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = Number(process.env.AGENTDESK_PANEL_PORT ?? 8787)
const OPENCODE_URL = process.env.AGENTDESK_OPENCODE_URL ?? "http://127.0.0.1:4096"
const PI_URL = process.env.AGENTDESK_PI_URL ?? "http://127.0.0.1:30141"
const STORAGE_FILE = process.env.AGENTDESK_STORAGE_FILE
const WORKSPACE_PATH = process.env.AGENTDESK_WORKSPACE_PATH

const panel = new AgentDeskPanel({
  opencodeBaseUrl: OPENCODE_URL,
  piBaseUrl: PI_URL,
  ...(STORAGE_FILE ? { storageFile: STORAGE_FILE } : {}),
  ...(WORKSPACE_PATH ? { workspacePath: WORKSPACE_PATH } : {}),
})
await panel.start()

const htmlPath = join(ROOT, "public", "index.html")
const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "<h1>panel missing</h1>"

function json(res: import("node:http").ServerResponse, code: number, body: unknown): void {
  const data = JSON.stringify(body)
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(data) })
  res.end(data)
}

function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ""
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()))
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on("error", reject)
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`)
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      res.end(html)
      return
    }
    if (req.method === "GET" && url.pathname === "/api/runtimes") {
      await panel.refreshHealth()
      json(res, 200, { runtimes: panel.list(), active: panel.activeRuntime() })
      return
    }
    if (req.method === "GET" && url.pathname === "/api/settings") {
      const runtimeId = url.searchParams.get("runtimeId") ?? undefined
      const settings = await panel.nativeSettings(runtimeId)
      json(res, 200, { runtimeId: runtimeId ?? panel.activeRuntime(), settings })
      return
    }
    if (req.method === "GET" && url.pathname === "/api/install-guide") {
      const runtimeId = url.searchParams.get("runtimeId") ?? panel.activeRuntime()
      json(res, 200, panel.installationGuide(runtimeId))
      return
    }
    if (req.method === "GET" && url.pathname === "/api/workspaces") {
      json(res, 200, panel.recoverySnapshot())
      return
    }
    if (req.method === "GET" && url.pathname === "/api/artifacts") {
      json(res, 200, { artifacts: panel.listArtifacts() })
      return
    }
    if (req.method === "POST" && url.pathname === "/api/artifacts") {
      const body = await readBody(req)
      const artifact = panel.createArtifact({
        type: String(body.type ?? "text"),
        title: String(body.title ?? "untitled"),
        uri: String(body.uri ?? ""),
        ownerRuntimeId: body.ownerRuntimeId ? String(body.ownerRuntimeId) : undefined,
        ownerAgentId: body.ownerAgentId ? String(body.ownerAgentId) : undefined,
        metadata: typeof body.metadata === "object" && body.metadata !== null ? (body.metadata as Record<string, unknown>) : undefined,
        parentIds: Array.isArray(body.parentIds) ? (body.parentIds as string[]) : undefined,
      })
      json(res, 200, { ok: true, artifact })
      return
    }
    if (req.method === "POST" && url.pathname === "/api/switch") {
      const body = await readBody(req)
      const id = String(body.runtimeId ?? "")
      panel.switchRuntime(id)
      json(res, 200, { ok: true, active: panel.activeRuntime() })
      return
    }
    if (req.method === "POST" && url.pathname === "/api/send") {
      const body = await readBody(req)
      const message = String(body.message ?? "")
      const directory = body.directory ? String(body.directory) : undefined
      const sessionId = await panel.send(message, undefined, directory, body.sessionId ? String(body.sessionId) : undefined)
      json(res, 200, { ok: true, sessionId })
      return
    }
    if (req.method === "POST" && url.pathname === "/api/resume") {
      const body = await readBody(req)
      const sessionId = await panel.resume(String(body.sessionId ?? ""))
      json(res, 200, { ok: true, sessionId })
      return
    }
    if (req.method === "POST" && url.pathname === "/api/cancel") {
      const body = await readBody(req)
      await panel.cancel(String(body.sessionId ?? ""), body.runtimeId ? String(body.runtimeId) : undefined)
      json(res, 200, { ok: true })
      return
    }
    if (req.method === "POST" && url.pathname === "/api/ui/respond") {
      const body = await readBody(req)
      const ok = await panel.respondUi(
        String(body.sessionId ?? ""),
        String(body.requestId ?? ""),
        {
          value: body.value ? String(body.value) : undefined,
          confirmed: body.confirmed === undefined ? undefined : Boolean(body.confirmed),
          cancelled: body.cancelled === undefined ? undefined : Boolean(body.cancelled),
        },
        body.runtimeId ? String(body.runtimeId) : undefined,
      )
      json(res, 200, { ok: true, delivered: ok })
      return
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      })
      const send = (event: unknown): void => {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
      send({ type: "panel.ready", runtimes: panel.list().map((r) => r.id) })
      const unsubscribe = panel.subscribe((event) => send(event))
      req.on("close", () => unsubscribe())
      return
    }
    json(res, 404, { error: "not found" })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, () => {
  console.log(`AgentDesk Panel: http://localhost:${PORT}`)
})

process.on("SIGINT", async () => {
  await panel.stop()
  server.close()
  process.exit(0)
})
