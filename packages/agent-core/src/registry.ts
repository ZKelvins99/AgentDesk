import type { AgentDefinition } from "./definition.ts"
import { DEFAULT_AGENTS } from "./default-agents.ts"

/** M18-T02: Agent Registry —— 独立于 Runtime Registry，管理 Agent 定义 */
export class AgentDefinitionRegistry {
  private readonly definitions = new Map<string, AgentDefinition>()

  constructor() {
    // M18-T03: 预置默认 Agent
    for (const agent of DEFAULT_AGENTS) this.register(agent)
  }

  register(agent: AgentDefinition): void {
    this.definitions.set(agent.id, agent)
  }

  unregister(id: string): boolean {
    return this.definitions.delete(id)
  }

  get(id: string): AgentDefinition | undefined {
    return this.definitions.get(id)
  }

  list(): AgentDefinition[] {
    return [...this.definitions.values()]
  }

  /** 按 runtime 过滤 */
  listByRuntime(runtimeId: string): AgentDefinition[] {
    return this.list().filter((a) => a.runtimeId === runtimeId)
  }
}
