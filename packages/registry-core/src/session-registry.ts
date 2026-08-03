import type {
  RuntimeSessionRef,
  SessionId,
  Unsubscribe,
} from "@agentdesk/runtime-protocol"

/** Session 注册表（文档第 9/10 节）：平台侧 Session 引用索引 */
export class SessionRegistry {
  private readonly sessions = new Map<SessionId, RuntimeSessionRef>()
  private readonly listeners = new Set<() => void>()

  upsert(ref: RuntimeSessionRef): void {
    const previous = this.sessions.get(ref.sessionId)
    this.sessions.set(ref.sessionId, {
      ...previous,
      ...ref,
      updatedAt: ref.updatedAt,
    })
    this.emit()
  }

  get(sessionId: SessionId): RuntimeSessionRef | undefined {
    return this.sessions.get(sessionId)
  }

  list(): RuntimeSessionRef[] {
    return [...this.sessions.values()]
  }

  listByRuntime(runtimeId: string): RuntimeSessionRef[] {
    return this.list().filter((s) => s.runtimeId === runtimeId)
  }

  remove(sessionId: SessionId): void {
    this.sessions.delete(sessionId)
    this.emit()
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}