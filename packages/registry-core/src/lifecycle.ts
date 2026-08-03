import type { AgentRuntime, RuntimeId } from "@agentdesk/runtime-protocol"

/** Runtime 生命周期管理：批量启动/停止 */
export class RuntimeLifecycleManager {
  private readonly runtimes = new Map<RuntimeId, AgentRuntime>()

  add(runtime: AgentRuntime): void {
    this.runtimes.set(runtime.id, runtime)
  }

  async startAll(): Promise<void> {
    for (const runtime of this.runtimes.values()) await runtime.init()
  }

  async stopAll(): Promise<void> {
    const errors: unknown[] = []
    for (const runtime of this.runtimes.values()) {
      try {
        await runtime.dispose()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "stopAll failed")
  }
}