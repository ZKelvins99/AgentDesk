import {
  CAPABILITIES,
  type AgentCapabilities,
  type AgentEvent,
  type AgentRuntime,
  type ExtensionCompatibilityLevel,
  type ExtensionCompatibilityView,
  type CreateSessionInput,
  type HealthStatus,
  type RuntimeManifest,
  type RuntimeSessionRef,
  type SendInput,
  type SessionId,
  type Timestamp,
  type Unsubscribe,
} from "@agentdesk/runtime-protocol"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { mapPiWebEvent } from "./mappers.ts"
import { readSse } from "./sse.ts"

export interface PiWebRuntimeOptions {
  /** pi-web 服务地址，例如 http://127.0.0.1:3000 */
  readonly baseUrl: string
  /** 默认工作目录 */
  readonly cwd?: string
  /** pi-web 版本（vendor/pi-web） */
  readonly upstreamVersion?: string
}

interface PiWebNewSessionResponse {
  readonly success?: boolean
  readonly sessionId?: string
  readonly error?: string
}

function now(): Timestamp {
  return new Date().toISOString()
}

/**
 * Pi Runtime 适配器（M06）。
 * 默认 Transport：pi-web HTTP + SSE（Windows 兼容）。
 * macOS/Linux 可切换为 @earendil-works/pi-client unix transport（vendor/pi/packages/client）。
 *
 * 复用 API（vendor/pi-web）：
 * - POST /api/agent/new          创建会话
 * - POST /api/agent/[id]         发送命令
 * - GET  /api/agent/[id]/events  SSE 事件流
 * - GET  /api/sessions           会话列表
 */
export class PiWebRuntime implements AgentRuntime {
  readonly id = "pi"
  readonly manifest: RuntimeManifest

  private readonly baseUrl: string
  private readonly cwd: string | undefined
  private readonly listeners = new Set<(event: AgentEvent) => void>()
  private disposed = false

  constructor(options: PiWebRuntimeOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.cwd = options.cwd
    this.manifest = {
      id: this.id,
      displayName: "Pi",
      version: "0.3.0",
      upstream: {
        name: "pi-web",
        npmVersion: options.upstreamVersion ?? "0.8.6",
        vendoredPath: "vendor/pi-web",
      },
      capabilities: this.capabilities(),
      supports: {
        resume: true,
        streaming: true,
        cancel: false,
        nativePermissions: false,
        nativeExtensions: true,
      },
    }
  }

  capabilities(): AgentCapabilities {
    return {
      ids: [
        CAPABILITIES.SESSION_CREATE,
        CAPABILITIES.SESSION_RESUME,
        CAPABILITIES.SESSION_STREAM,
        CAPABILITIES.SKILLS_NATIVE,
        CAPABILITIES.EXTENSIONS_NATIVE,
      ],
    }
  }

  async init(): Promise<void> {
    this.disposed = false
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.listeners.clear()
  }

  /** M07-T01 Pi Native Settings：透传全局与项目配置（不解析、不改写） */
  async nativeConfig(): Promise<unknown> {
    const globalDir = join(homedir(), ".pi", "agent")
    const globalSettings = readJsonFile(join(globalDir, "settings.json"))
    const globalModels = readJsonFile(join(globalDir, "models.json"))
    const projectSettings = this.cwd ? readJsonFile(join(this.cwd, ".pi", "settings.json")) : undefined
    return {
      global: {
        settings: globalSettings,
        models: globalModels,
      },
      project: {
        settings: projectSettings,
      },
    }
  }

  /** M07-T02 Pi Native Skills：透传项目与用户级 skill 目录元数据（不解析内容） */
  async nativeSkills(): Promise<ReadonlyArray<unknown>> {
    const dirs = [
      this.cwd ? join(this.cwd, ".pi", "skills") : undefined,
      join(homedir(), ".pi", "agent", "skills"),
    ].filter((d): d is string => typeof d === "string")
    return dirs.flatMap((dir) => listSkillFiles(dir))
  }

  /** M08-T07: 列出项目与用户级扩展，并评估 AgentDesk 兼容等级 */
  async nativeExtensions(): Promise<ReadonlyArray<ExtensionCompatibilityView>> {
    const dirs = [
      this.cwd ? join(this.cwd, ".pi", "extensions") : undefined,
      join(homedir(), ".pi", "agent", "extensions"),
    ].filter((d): d is string => typeof d === "string")
    const files = dirs.flatMap((dir) => listExtensionFiles(dir))
    return files.map((name) => ({
      name,
      source: "extension" as const,
      level: "FULL" as ExtensionCompatibilityLevel,
      supportedMethods: ["confirm", "select", "input", "notify", "status"],
    }))
  }

  /** M08-T06: 声明 Pi Runtime 的整体兼容等级（UI Bridge 全链路已通） */
  extensionCompatibilityLevel(): ExtensionCompatibilityLevel {
    return "FULL"
  }

  async health(): Promise<HealthStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions`)
      if (!res.ok) {
        return { ok: false, runtimeId: this.id, detail: `HTTP ${res.status}`, checkedAt: now() }
      }
      return { ok: true, runtimeId: this.id, detail: this.baseUrl, checkedAt: now() }
    } catch (error) {
      return {
        ok: false,
        runtimeId: this.id,
        detail: error instanceof Error ? error.message : String(error),
        checkedAt: now(),
      }
    }
  }

  async createSession(input?: CreateSessionInput): Promise<RuntimeSessionRef> {
    this.assertAlive()
    const cwd = input?.cwd ?? input?.directory ?? this.cwd
    if (!cwd) throw new Error("PiWebRuntime.createSession requires cwd")

    // pi-web /api/agent/new 需要 type 字段：带首条消息用 prompt，否则 ensure_session 只建会话
    const body: Record<string, unknown> = {
      cwd,
      type: input?.initialMessage ? "prompt" : "ensure_session",
    }
    if (input?.initialMessage) body.message = input.initialMessage

    const res = await fetch(`${this.baseUrl}/api/agent/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as PiWebNewSessionResponse
    if (!res.ok || !json.sessionId) {
      throw new Error(json.error ?? `pi-web /api/agent/new failed: HTTP ${res.status}`)
    }

    const nativeId = json.sessionId
    const sessionId = `pi:${nativeId}`
    this.emit({ type: "session.created", runtimeId: this.id, sessionId, at: now() })
    return {
      sessionId,
      runtimeId: this.id,
      nativeSessionId: nativeId,
      state: "created",
      createdAt: now(),
      updatedAt: now(),
      cwd,
      title: input?.title,
    }
  }

  async resumeSession(sessionId: SessionId): Promise<RuntimeSessionRef> {
    this.assertAlive()
    this.emit({ type: "session.resumed", runtimeId: this.id, sessionId, at: now() })
    return {
      sessionId,
      runtimeId: this.id,
      nativeSessionId: toNativeId(sessionId),
      state: "created",
      createdAt: now(),
      updatedAt: now(),
    }
  }

  async send(input: SendInput): Promise<RuntimeSessionRef> {
    this.assertAlive()
    const nativeId = toNativeId(input.sessionId)
    const res = await fetch(`${this.baseUrl}/api/agent/${encodeURIComponent(nativeId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "prompt", message: input.message }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(json.error ?? `pi-web send failed: HTTP ${res.status}`)
    }
    return {
      sessionId: input.sessionId,
      runtimeId: this.id,
      nativeSessionId: nativeId,
      state: "running",
      createdAt: now(),
      updatedAt: now(),
    }
  }

  async cancel(sessionId: SessionId): Promise<void> {
    // pi RPC abort 命令：终止当前 generation
    this.assertAlive()
    const nativeId = toNativeId(sessionId)
    try {
      const res = await fetch(`${this.baseUrl}/api/agent/${encodeURIComponent(nativeId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "abort" }),
      })
      if (!res.ok) throw new Error(`pi-web abort failed: HTTP ${res.status}`)
    } catch (error) {
      // 服务不可达时兜底：发结束事件
      this.emit({ type: "session.ended", runtimeId: this.id, sessionId, at: now() })
      return
    }
    this.emit({ type: "session.ended", runtimeId: this.id, sessionId, at: now() })
  }

  /** M08: 响应 Pi Extension UI 请求（POST /api/agent/[id] extension_ui_response 命令） */
  async respondUi(input: {
    readonly sessionId: SessionId
    readonly requestId: string
    readonly value?: string
    readonly confirmed?: boolean
    readonly cancelled?: boolean
  }): Promise<boolean> {
    this.assertAlive()
    const nativeId = toNativeId(input.sessionId)
    const body: Record<string, unknown> = { type: "extension_ui_response", id: input.requestId }
    if (input.cancelled) {
      body.cancelled = true
    } else if (input.confirmed !== undefined) {
      body.confirmed = input.confirmed
    } else {
      body.value = input.value ?? ""
    }
    try {
      const res = await fetch(`${this.baseUrl}/api/agent/${encodeURIComponent(nativeId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  subscribe(listener: (event: AgentEvent) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 订阅 pi-web SSE 事件流（GET /api/agent/[id]/events） */
  async attachSessionEventStream(sessionId: SessionId): Promise<Unsubscribe> {
    this.assertAlive()
    const nativeId = toNativeId(sessionId)
    const controller = new AbortController()
    const res = await fetch(
      `${this.baseUrl}/api/agent/${encodeURIComponent(nativeId)}/events`,
      { signal: controller.signal },
    )
    if (!res.ok) throw new Error(`pi-web events failed: HTTP ${res.status}`)

    void (async () => {
      for await (const sse of readSse(res, controller.signal)) {
        if (controller.signal.aborted) break
        try {
          const raw = JSON.parse(sse.data) as Record<string, unknown>
          const event = mapPiWebEvent(raw as never, this.id, sessionId)
          if (event) this.emit(event)
        } catch {
          // 忽略无法解析的 SSE 数据
        }
      }
    })()

    return () => controller.abort()
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("PiWebRuntime disposed")
  }
}

/** sessionId（pi:xxx）→ 原生 id */
export function toNativeId(sessionId: SessionId): string {
  return sessionId.replace(/^pi:/, "")
}

/** 读取 JSON 配置文件；不存在或解析失败返回 undefined（透传场景优雅降级） */
function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown
  } catch {
    return undefined
  }
}

/** 列出 skill 目录下的 SKILL.md（含顶层 .md 文件）；目录缺失返回空数组 */
function listSkillFiles(dir: string): Array<{ path: string; name: string }> {
  try {
    const out: Array<{ path: string; name: string }> = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        // 子目录：递归查找 SKILL.md
        const nested = join(dir, entry.name, "SKILL.md")
        try {
          if (statSync(nested).isFile()) {
            out.push({ path: nested, name: entry.name })
          }
        } catch {
          // 无 SKILL.md 的目录跳过
        }
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        out.push({ path: join(dir, entry.name), name: dir.split(/[\\/]/).pop() ?? "skill" })
      }
    }
    return out
  } catch {
    return []
  }
}

/** 列出扩展目录下的 .ts/.js 扩展文件名；目录缺失返回空数组 */
function listExtensionFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".ts") || name.endsWith(".js"))
      .sort()
  } catch {
    return []
  }
}
