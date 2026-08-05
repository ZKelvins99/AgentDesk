import { AgentDeskPlatform } from "@agentdesk/platform-core"
import { RuntimeLifecycleManager } from "@agentdesk/registry-core"
import type { AgentEvent, AgentRuntime, RuntimeId, SessionId } from "@agentdesk/runtime-protocol"
import type { SkillDescriptor } from "@agentdesk/runtime-protocol"
import { join } from "node:path"
import { AgentDeskDatabase, WorkspaceStore, CrashRecovery, type SessionBinding } from "@agentdesk/storage-core"
import { ArtifactStore, type Artifact, type CreateArtifactInput } from "@agentdesk/artifact-core"
import { SkillRegistry, loadSkillsFromDir } from "@agentdesk/skill-core"
import { AgentDefinitionRegistry, type AgentDefinition } from "@agentdesk/agent-core"
import { AgentBroker, runtimeExecutor } from "@agentdesk/broker-core"
import { ModeSwitch, TaskClassifier, TaskRouter, buildHybridWorkflow, type HybridMode } from "@agentdesk/router-core"
import {
  ToolRegistry,
  fileReadTool,
  fileWriteTool,
  fileListTool,
  fileStatTool,
  pythonTool,
  documentCreateTool,
  documentReadTool,
  documentRenderTool,
  documentEditTool,
  pdfReadTool,
  pdfMetaTool,
  spreadsheetCreateTool,
  spreadsheetReadTool,
  spreadsheetSetCellsTool,
  spreadsheetFormulaTool,
  spreadsheetFormatTool,
  spreadsheetChartTool,
  spreadsheetAnalyzeTool,
  slidesCreateTool,
  slidesAddSlideTool,
  slidesUpdateSlideTool,
  slidesDeleteSlideTool,
  slidesRenderTool,
} from "@agentdesk/tool-core"
import { EchoRuntime } from "@agentdesk/runtime-echo"
import { OpenCodeRuntime } from "@agentdesk/runtime-opencode"
import { PiWebRuntime } from "@agentdesk/runtime-pi"

export interface AgentDeskPanelOptions {
  readonly opencodeBaseUrl?: string
  readonly opencodeDirectory?: string
  /** pi-web HTTP/SSE 服务地址（M06，Windows 兼容 Transport） */
  readonly piBaseUrl?: string
  /** M10: SQLite 数据库文件路径；缺省不持久化 */
  readonly storageFile?: string
  /** M10: 默认工作区（恢复时回填 last_opened_at） */
  readonly workspacePath?: string
  /** extra runtimes to register (third-party decoupling demo) */
  readonly extraRuntimes?: readonly AgentRuntime[]
}

export interface RuntimeView {
  readonly id: RuntimeId
  readonly displayName: string
  readonly version: string
  readonly description?: string
  readonly state: string
  /** M09-T02: 用户可读状态标签（Ready/Starting/Busy/Error/Not Installed） */
  readonly statusLabel: string
  readonly ok: boolean
  readonly detail?: string
  readonly active: boolean
}

/** M09-T02: lifecycle state → 用户可读状态标签 */
function toStatusLabel(state: string, busy: boolean): string {
  if (state === "ready" || state === "busy") {
    return busy ? "Busy" : "Ready"
  }
  switch (state) {
    case "initializing":
      return "Starting"
    case "error":
      return "Error"
    case "disposed":
      return "Not Installed"
    default:
      return "Starting"
  }
}

/**
 * M04-T05/T06: minimal panel facade.
 * Registers OpenCode + Pi + Echo runtimes; switching the active runtime
 * is an in-memory switch (no desktop restart needed).
 */
export class AgentDeskPanel {
  readonly platform: AgentDeskPlatform
  readonly lifecycle: RuntimeLifecycleManager

  private active: RuntimeId
  private readonly busySessions = new Set<SessionId>()
  private readonly storage?: AgentDeskDatabase
  private readonly workspaceStore?: WorkspaceStore
  private readonly recovery?: CrashRecovery
  private readonly artifactStore?: ArtifactStore
  private readonly workspacePath?: string
  private readonly toolRegistry: ToolRegistry
  private readonly skillRegistry = new SkillRegistry()
  private readonly agentRegistry = new AgentDefinitionRegistry()
  private readonly broker: AgentBroker
  private readonly modeSwitch = new ModeSwitch()
  private readonly taskClassifier = new TaskClassifier()
  private readonly taskRouter = new TaskRouter()

  constructor(options: AgentDeskPanelOptions = {}) {
    const echo = new EchoRuntime({ latencyMs: 15 })
    const opencode = new OpenCodeRuntime({
      baseUrl: options.opencodeBaseUrl ?? "http://127.0.0.1:4096",
      ...(options.opencodeDirectory ? { directory: options.opencodeDirectory } : {}),
    })
    const pi = new PiWebRuntime({
      baseUrl: options.piBaseUrl ?? "http://127.0.0.1:30141",
      cwd: options.opencodeDirectory ?? "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace",
    })
    const runtimes: AgentRuntime[] = [opencode, pi, echo, ...(options.extraRuntimes ?? [])]
    this.platform = new AgentDeskPlatform({ runtimes })
    // M10: 本地 SQLite（崩溃恢复）
    if (options.storageFile) {
      this.storage = new AgentDeskDatabase(options.storageFile)
      this.workspaceStore = new WorkspaceStore(this.storage)
      this.recovery = new CrashRecovery(this.storage)
      this.artifactStore = new ArtifactStore(this.storage)
      this.workspacePath = options.workspacePath
    }
    // M13: 平台工具注册（filesystem + python）
    this.toolRegistry = new ToolRegistry()
    this.toolRegistry.register(fileReadTool)
    this.toolRegistry.register(fileWriteTool)
    this.toolRegistry.register(fileListTool)
    this.toolRegistry.register(fileStatTool)
    this.toolRegistry.register(pythonTool)
    this.toolRegistry.register(documentCreateTool)
    this.toolRegistry.register(documentReadTool)
    this.toolRegistry.register(documentRenderTool)
    this.toolRegistry.register(documentEditTool)
    this.toolRegistry.register(pdfReadTool)
    this.toolRegistry.register(pdfMetaTool)
    this.toolRegistry.register(spreadsheetCreateTool)
    this.toolRegistry.register(spreadsheetReadTool)
    this.toolRegistry.register(spreadsheetSetCellsTool)
    this.toolRegistry.register(spreadsheetFormulaTool)
    this.toolRegistry.register(spreadsheetFormatTool)
    this.toolRegistry.register(spreadsheetChartTool)
    this.toolRegistry.register(spreadsheetAnalyzeTool)
    this.toolRegistry.register(slidesCreateTool)
    this.toolRegistry.register(slidesAddSlideTool)
    this.toolRegistry.register(slidesUpdateSlideTool)
    this.toolRegistry.register(slidesDeleteSlideTool)
    this.toolRegistry.register(slidesRenderTool)
    // M17: 平台 Skill 加载（.agentdesk/skills/）
    const skillDir = join(this.workspacePath ?? "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace", ".agentdesk", "skills")
    for (const skill of loadSkillsFromDir(skillDir)) {
      this.skillRegistry.register(skill)
    }
    // M09-T02: 事件驱动 Busy 状态（工具/消息进行中 → busy；session.idle → 回 ready）
    this.platform.eventBus.subscribe((event) => {
      if (!("sessionId" in event) || !event.sessionId) return
      if (event.type === "tool.started" || event.type === "message.started") {
        this.busySessions.add(event.sessionId)
      } else if (event.type === "session.idle") {
        this.busySessions.delete(event.sessionId)
      }
    })
    const map = new Map(runtimes.map((r) => [r.id, r]))
    this.lifecycle = new RuntimeLifecycleManager(map)
    this.broker = new AgentBroker(runtimeExecutor(map))
    this.active = echo.id
  }

  async start(): Promise<void> {
    const map = this.runtimeMap()
    await this.lifecycle.startAll(map)
    await this.platform.start()
    this.restoreWorkspace()
  }

  async stop(): Promise<void> {
    await this.lifecycle.stopAll(this.runtimeMap())
    await this.platform.stop()
    this.storage?.close()
  }

  switchRuntime(id: RuntimeId): RuntimeId {
    if (!this.platform.runtimeRegistry.has(id)) {
      throw new Error(`Unknown runtime: ${id}`)
    }
    this.active = id
    return this.active
  }

  activeRuntime(): RuntimeId {
    return this.active
  }

  /** M04-T04 style health snapshot for the selector UI */
  list(): RuntimeView[] {
    const snapshot = new Map(
      this.lifecycle.healthSnapshot(this.runtimeMap()).map((s) => [s.runtimeId, s]),
    )
    return this.platform.runtimeRegistry.list().map((runtime) => {
      const info = snapshot.get(runtime.id)
      const busy = this.busySessions.size > 0
      return {
        id: runtime.id,
        displayName: runtime.manifest.displayName,
        version: runtime.manifest.version,
        description: runtime.manifest.description,
        state: info?.state ?? "uninitialized",
        statusLabel: toStatusLabel(info?.state ?? "uninitialized", busy),
        ok: info?.ok ?? false,
        detail: info?.detail,
        active: runtime.id === this.active,
      }
    })
  }

  async refreshHealth(): Promise<void> {
    for (const runtime of this.platform.runtimeRegistry.list()) {
      const health = await runtime.health()
      if (health.ok) {
        this.lifecycle.setState(runtime.id, "ready", health.detail)
      } else {
        this.lifecycle.setState(runtime.id, "error", health.detail ?? "not available")
      }
    }
  }

  async send(message: string, runtimeId?: RuntimeId, directory?: string, sessionId?: string): Promise<string> {
    const target = runtimeId ?? this.active
    const runtime = this.platform.runtimeRegistry.get(target)
    if (!runtime) throw new Error(`Unknown runtime: ${target}`)
    if (sessionId) {
      const ref = await this.platform.send(target, { sessionId, message })
      if (ref.nativeSessionId) this.bindSession(ref.sessionId, ref.nativeSessionId, target)
      return ref.sessionId
    }
    const ref = await this.platform.createSession(target, {
      initialMessage: message,
      ...(directory ? { directory } : {}),
    })
    if (ref.nativeSessionId) this.bindSession(ref.sessionId, ref.nativeSessionId, target)
    return ref.sessionId
  }

  async resume(sessionId: string, runtimeId?: RuntimeId): Promise<string> {
    const target = runtimeId ?? this.active
    const runtime = this.platform.runtimeRegistry.get(target)
    if (!runtime) throw new Error(`Unknown runtime: ${target}`)
    const ref = await runtime.resumeSession(sessionId)
    this.platform.sessionRegistry.upsert(ref)
    return ref.sessionId
  }

  /** 终止指定 runtime 的会话生成（M06-T07 Pi Cancel） */
  async cancel(sessionId: string, runtimeId?: RuntimeId): Promise<void> {
    const target = runtimeId ?? this.active
    const runtime = this.platform.runtimeRegistry.get(target)
    if (!runtime) throw new Error(`Unknown runtime: ${target}`)
    await runtime.cancel(sessionId)
  }

  /** M08: 响应原生 UI 请求（Pi Extension confirm/select/input 等） */
  async respondUi(
    sessionId: string,
    requestId: string,
    body: { value?: string; confirmed?: boolean; cancelled?: boolean },
    runtimeId?: RuntimeId,
  ): Promise<boolean> {
    const target = runtimeId ?? this.active
    const runtime = this.platform.runtimeRegistry.get(target)
    if (!runtime) throw new Error(`Unknown runtime: ${target}`)
    if (!runtime.respondUi) return false
    return runtime.respondUi({ sessionId, requestId, ...body })
  }

  /** M09-T03: 读取指定 Runtime 的 Native Settings（OpenCode/Pi 各自原生配置，不统一） */
  async nativeSettings(runtimeId?: RuntimeId): Promise<unknown> {
    const target = runtimeId ?? this.active
    const runtime = this.platform.runtimeRegistry.get(target)
    if (!runtime) throw new Error(`Unknown runtime: ${target}`)
    if (!runtime.nativeConfig) return { unsupported: true }
    return runtime.nativeConfig()
  }

  /** M09-T04: Runtime 安装指南（未安装时展示） */
  installationGuide(runtimeId: RuntimeId): { installed: boolean; guide?: string } {
    const snapshot = new Map(
      this.lifecycle.healthSnapshot(this.runtimeMap()).map((s) => [s.runtimeId, s]),
    )
    const info = snapshot.get(runtimeId)
    const installed = info?.ok === true
    const guides: Record<RuntimeId, string> = {
      opencode: "安装：cd vendor/opencode && bun install && bun run src/index.ts serve --port 4096",
      pi: "安装：cd vendor/pi-web && npm install && npm run dev（端口 30141）",
      echo: "内置 Echo Runtime，无需安装",
    }
    return { installed, guide: guides[runtimeId] ?? `Runtime ${runtimeId} 未安装` }
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    return this.platform.eventBus.subscribe(listener)
  }

  private runtimeMap(): Map<RuntimeId, AgentRuntime> {
    return new Map(this.platform.runtimeRegistry.list().map((r) => [r.id, r]))
  }

  /** M10-T05/Gate G10: 崩溃后从 SQLite 恢复 Workspace + Session 映射 */
  restoreWorkspace(): RecoveryView {
    const empty: RecoveryView = { workspaces: [], bindings: [], recovered: false }
    if (!this.workspaceStore || !this.recovery) return empty
    const snapshot = this.recovery.snapshot()
    let workspaces = snapshot.workspaces
    if (workspaces.length === 0 && this.workspacePath) {
      const ws = this.workspaceStore.createWorkspace(
        this.workspacePath.split(/[\\/]/).pop() ?? "workspace",
        this.workspacePath,
      )
      workspaces = [ws]
    }
    return { workspaces, bindings: snapshot.bindings, recovered: true }
  }

  /** M10-T03: 记录 session 映射（runtime 创建会话时调用） */
  bindSession(sessionId: SessionId, nativeSessionId: string, runtimeId: string): void {
    if (!this.workspaceStore) return
    const ws = this.workspaceStore.listWorkspaces()[0]
    if (!ws) return
    this.workspaceStore.bindSession({
      agentdeskSessionId: sessionId,
      runtimeId,
      nativeSessionId,
      workspaceId: ws.id,
    })
  }

  recoverySnapshot(): RecoveryView {
    return this.restoreWorkspace()
  }

  /** M11: 创建 Artifact（平台级，供任意 Runtime 通过协议产出） */
  createArtifact(input: CreateArtifactInput): Artifact | undefined {
    return this.artifactStore?.create(input)
  }

  listArtifacts(): Artifact[] {
    return this.artifactStore?.list() ?? []
  }

  /** M12: 按 id 取单个 Artifact（最新版本） */
  getArtifact(id: string): Artifact | undefined {
    return this.artifactStore?.getLatest(id)
  }

  /** M13: 列出平台工具 */
  listTools(): { id: string; description: string }[] {
    return this.toolRegistry.list().map((t) => ({ id: t.id, description: t.description }))
  }

  /** M17: 合并 Platform + Native Skills（UI 可区分 source/runtimeId） */
  async listSkills(): Promise<SkillDescriptor[]> {
    const native: Array<Omit<SkillDescriptor, "source">> = []
    for (const runtime of this.platform.runtimeRegistry.list()) {
      if (runtime.nativeSkills) {
        const skills = await runtime.nativeSkills()
        for (const s of skills as Array<{ name?: string; path?: string; [k: string]: unknown }>) {
          native.push({
            id: `${runtime.id}-${String(s.name ?? s.path ?? "skill")}`,
            name: String(s.name ?? s.path ?? "skill"),
            description: String(s.description ?? `Native skill from ${runtime.id}`),
            runtimeId: runtime.id,
            version: String(s.version ?? "native"),
          })
        }
      }
    }
    return this.skillRegistry.describeAll(native)
  }

  /** M18: 列出 Agent 定义（Runtime 与 Agent 分离） */
  listAgents(): AgentDefinition[] {
    return this.agentRegistry.list()
  }

  /** M19: Broker 调用入口 */
  brokerInvoke(agentId: string, message: string, parentSession?: string, parentAgent?: string) {
    return this.broker.invoke(agentId, {
      message,
      ...(parentSession ? { parentSession } : {}),
      ...(parentAgent ? { parentAgent } : {}),
    })
  }

  brokerStatus(invocationId: string) {
    return this.broker.getStatus(invocationId)
  }

  /** M20: Hybrid Mode + Task Routing */
  switchMode(mode: HybridMode): HybridMode {
    return this.modeSwitch.switch(mode)
  }

  currentMode(): HybridMode {
    return this.modeSwitch.current()
  }

  routeTask(text: string) {
    const taskType = this.taskClassifier.classify(text)
    const agent = this.taskRouter.route(taskType, this.agentRegistry.list())
    const workflow = this.modeSwitch.isHybrid ? buildHybridWorkflow(taskType) : undefined
    return { taskType, agentId: agent?.id, workflow }
  }

  /** M13: 执行平台工具（过 Permission Core） */
  async executeTool(id: string, input: Record<string, unknown>): Promise<{ ok: boolean; output?: unknown; error?: string; denied?: boolean }> {
    const result = await this.toolRegistry.execute(id, {
      workspacePath: this.workspacePath ?? "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace",
      allowWrite: true,
    }, input)
    // M14-T09 / M15: document/spreadsheet/chart 工具产物自动进入 Artifact
    const artifactProducing = new Set([
      "platform.document.create",
      "platform.document.edit",
      "platform.spreadsheet.create",
      "platform.spreadsheet.chart",
      "platform.slides.render",
    ])
    if (result.ok && this.artifactStore && artifactProducing.has(id)) {
      const out = result.output as { path?: string; mime?: string; sizeBytes?: number } | undefined
      if (out?.path) {
        const type = out.mime?.includes("spreadsheet") ? "spreadsheet"
          : out.mime?.includes("presentation") ? "slides"
          : out.mime?.includes("svg") ? "chart"
          : "document"
        this.artifactStore.create({
          type,
          title: out.path.split(/[\\/]/).pop() ?? "document",
          uri: pathToFileUrl(out.path),
          ownerRuntimeId: "platform",
          ownerAgentId: "document-tool",
          metadata: { toolId: id, sizeBytes: out.sizeBytes },
        })
      }
    }
    return result
  }
}

export interface RecoveryView {
  readonly workspaces: readonly { id: string; name: string; path: string; createdAt: string; lastOpenedAt: string }[]
  readonly bindings: readonly SessionBinding[]
  readonly recovered: boolean
}

function pathToFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/")
  return `file:///${normalized}`
}
