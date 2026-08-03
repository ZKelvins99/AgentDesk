import type {
  AgentCapabilities,
  AgentDescriptor,
  AgentId,
  AgentProfile,
  AgentRuntime,
  Unsubscribe,
} from "@agentdesk/runtime-protocol"

/** Agent 注册表（文档第 11 节）：静态注册 + 从 Runtime 原生 Agent 自动发现 */
export class AgentRegistry {
  private readonly descriptors = new Map<AgentId, AgentDescriptor>()
  private readonly profiles = new Map<string, AgentProfile>()
  private readonly listeners = new Set<() => void>()

  registerProfile(profile: AgentProfile): void {
    this.profiles.set(profile.id, profile)
    this.emit()
  }

  registerProfiles(profiles: readonly AgentProfile[]): void {
    for (const profile of profiles) this.registerProfile(profile)
  }

  registerDescriptor(descriptor: AgentDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor)
    this.emit()
  }

  listDescriptors(): AgentDescriptor[] {
    return [...this.descriptors.values()]
  }

  listProfiles(): AgentProfile[] {
    return [...this.profiles.values()]
  }

  getDescriptor(id: AgentId): AgentDescriptor | undefined {
    return this.descriptors.get(id)
  }

  /** 从 Runtime 原生 Agent 元数据自动发现（透传 nativeRef，不解析内部格式） */
  discoverNativeAgents(runtime: AgentRuntime, capabilities: AgentCapabilities): void {
    void runtime.nativeAgents?.().then((nativeAgents) => {
      const items = nativeAgents ?? []
      for (const native of items) {
        if (!isRecord(native) || typeof native.id !== "string") continue
        const id = `${runtime.id}:native:${native.id}`
        this.registerDescriptor({
          id,
          displayName: typeof native.name === "string" ? native.name : native.id,
          description: typeof native.description === "string" ? native.description : undefined,
          runtimeId: runtime.id,
          capabilities,
          profileIds: [],
          nativeRef: String(native.id),
        })
      }
    })
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}