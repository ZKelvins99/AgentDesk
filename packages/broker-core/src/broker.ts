import { randomUUID } from "node:crypto"
import type { AgentRuntime, SessionId } from "@agentdesk/runtime-protocol"

/** M19-T02: Invocation Context —— 记录父子关系与产物/权限 */
export interface InvocationContext {
  readonly invocationId: string
  readonly parentSession?: SessionId
  readonly parentAgent?: string
  readonly childAgent: string
  readonly artifacts: readonly string[]
  readonly permissions: readonly string[]
  readonly createdAt: string
}

export interface InvokeRequest {
  readonly message: string
  readonly parentSession?: SessionId
  readonly parentAgent?: string
  readonly artifacts?: readonly string[]
  readonly permissions?: readonly string[]
}

export type InvocationStatus =
  | "pending"
  | "running"
  | "completed"
  | "cancelled"
  | "failed"

export interface InvocationRecord {
  readonly context: InvocationContext
  status: InvocationStatus
  readonly sessionId?: SessionId
  error?: string
  updatedAt: string
}

/**
 * M19-T01: Agent Broker —— 跨 Runtime 的统一调用入口。
 * 禁止 Runtime 间直接 import（T03），一律经 Broker invoke。
 */
export class AgentBroker {
  private readonly invocations = new Map<string, InvocationRecord>()
  private readonly executor: (agentId: string, message: string) => Promise<SessionId>

  constructor(executor: (agentId: string, message: string) => Promise<SessionId>) {
    this.executor = executor
  }

  async invoke(agentId: string, request: InvokeRequest): Promise<InvocationRecord> {
    const invocationId = `inv_${randomUUID().replace(/-/g, "").slice(0, 20)}`
    const record: InvocationRecord = {
      context: {
        invocationId,
        parentSession: request.parentSession,
        parentAgent: request.parentAgent,
        childAgent: agentId,
        artifacts: request.artifacts ?? [],
        permissions: request.permissions ?? [],
        createdAt: new Date().toISOString(),
      },
      status: "pending",
      updatedAt: new Date().toISOString(),
    }
    this.invocations.set(invocationId, record)
    void this.run(record, agentId, request.message)
    return record
  }

  async cancel(invocationId: string): Promise<boolean> {
    const record = this.invocations.get(invocationId)
    if (!record) return false
    if (record.status === "completed" || record.status === "cancelled" || record.status === "failed") return false
    record.status = "cancelled"
    record.updatedAt = new Date().toISOString()
    return true
  }

  getStatus(invocationId: string): InvocationRecord | undefined {
    return this.invocations.get(invocationId)
  }

  list(): InvocationRecord[] {
    return [...this.invocations.values()]
  }

  private async run(record: InvocationRecord, agentId: string, message: string): Promise<void> {
    record.status = "running"
    record.updatedAt = new Date().toISOString()
    try {
      const sessionId = await this.executor(agentId, message)
      ;(record as { sessionId?: SessionId }).sessionId = sessionId
      record.status = "completed"
    } catch (error) {
      record.status = "failed"
      record.error = error instanceof Error ? error.message : String(error)
    }
    record.updatedAt = new Date().toISOString()
  }
}

/** Broker executor 适配：把 agentId 映射到 Runtime 的 send */
export function runtimeExecutor(runtimes: ReadonlyMap<string, AgentRuntime>): (agentId: string, message: string) => Promise<SessionId> {
  return async (agentId, message) => {
    const runtime = runtimes.get(agentId)
    if (!runtime) throw new Error(`broker: unknown runtime ${agentId}`)
    const ref = await runtime.createSession({ initialMessage: message })
    return ref.sessionId
  }
}
