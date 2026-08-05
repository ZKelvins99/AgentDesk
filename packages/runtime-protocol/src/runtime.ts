import type { AgentCapabilities } from "./capability.ts"
import type { AgentEvent } from "./event.ts"
import type { RuntimeSessionRef } from "./session.ts"
import type { AgentId, HealthStatus, ProfileId, RuntimeId, SessionId, Unsubscribe } from "./types.ts"

/** Runtime 元信息（文档 6.2） */
export interface RuntimeManifest {
  readonly id: RuntimeId
  readonly displayName: string
  /** Optional description (M01-T03 RuntimeMetadata.description) */
  readonly description?: string
  /** Optional icon (M01-T03 RuntimeMetadata.icon) */
  readonly icon?: string
  /** AgentDesk adapter 版本 */
  readonly version: string
  /** 上游项目信息，用于 UPSTREAM_SYNC 追踪 */
  readonly upstream: Readonly<{
    name: string
    commit?: string
    npmVersion?: string
    vendoredPath?: string
  }>
  readonly capabilities: AgentCapabilities
  readonly supports: Readonly<{
    resume: boolean
    streaming: boolean
    cancel: boolean
    nativePermissions: boolean
    nativeExtensions: boolean
  }>
}

export interface CreateSessionInput {
  readonly cwd?: string
  readonly title?: string
  readonly agentId?: AgentId
  readonly profileId?: ProfileId
  readonly initialMessage?: string
  readonly directory?: string
  readonly extra?: Readonly<Record<string, unknown>>
}

export interface SendInput {
  readonly sessionId: SessionId
  readonly message: string
  readonly parentId?: string
  readonly extra?: Readonly<Record<string, unknown>>
}

/**
 * AgentRuntime 统一接口（文档 6.1）。
 * 适配器只做边界转换：不重写 Agent Loop、不修改原生 Session 结构。
 */
export interface AgentRuntime {
  readonly id: RuntimeId
  readonly manifest: RuntimeManifest

  /** 初始化（创建客户端、建立连接） */
  init(): Promise<void>
  /** 释放资源 */
  dispose(): Promise<void>
  health(): Promise<HealthStatus>

  createSession(input?: CreateSessionInput): Promise<RuntimeSessionRef>
  resumeSession(sessionId: SessionId): Promise<RuntimeSessionRef>
  send(input: SendInput): Promise<RuntimeSessionRef>
  cancel(sessionId: SessionId): Promise<void>

  /** 订阅统一 AgentEvent 流 */
  subscribe(listener: (event: AgentEvent) => void): Unsubscribe

  capabilities(): AgentCapabilities

  /** M08: 响应原生 UI 请求（confirm/select/input 等）。不支持时返回 false。 */
  respondUi?(input: {
    readonly sessionId: SessionId
    readonly requestId: string
    readonly value?: string
    readonly confirmed?: boolean
    readonly cancelled?: boolean
  }): Promise<boolean>

  // ---- 可选原生元数据读取（透传，平台不解析内部格式） ----
  nativeConfig?(): Promise<unknown>
  nativeAgents?(): Promise<ReadonlyArray<unknown>>
  nativeSkills?(): Promise<ReadonlyArray<unknown>>
  nativeExtensions?(): Promise<ReadonlyArray<unknown>>
}
