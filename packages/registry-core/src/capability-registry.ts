import type {
  AgentRuntime,
  CapabilityId,
  RuntimeId,
  Unsubscribe,
} from "@agentdesk/runtime-protocol"

/** Capability 注册表：CapabilityId → RuntimeId 列表（文档第 7 节） */
export class CapabilityRegistry {
  private readonly map = new Map<CapabilityId, Set<RuntimeId>>()
  private readonly listeners = new Set<() => void>()

  indexRuntime(runtime: AgentRuntime): void {
    for (const id of runtime.capabilities().ids) {
      let set = this.map.get(id)
      if (!set) {
        set = new Set()
        this.map.set(id, set)
      }
      set.add(runtime.id)
    }
    this.emit()
  }

  removeRuntime(runtimeId: RuntimeId): void {
    for (const set of this.map.values()) set.delete(runtimeId)
    this.emit()
  }

  listRuntimes(capability: CapabilityId): RuntimeId[] {
    return [...(this.map.get(capability) ?? [])]
  }

  listCapabilities(): CapabilityId[] {
    return [...this.map.keys()]
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}