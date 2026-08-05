import type { AgentDeskTool } from "./protocol.ts"
import { PermissionCore, type PermissionRequest } from "./permission.ts"

/** M13-T02: Tool Registry —— register / unregister / list / get + 权限门控执行 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentDeskTool>()
  private readonly permission: PermissionCore

  constructor(permission?: PermissionCore) {
    this.permission = permission ?? new PermissionCore()
  }

  register(tool: AgentDeskTool): void {
    this.tools.set(tool.id, tool)
  }

  unregister(id: string): boolean {
    return this.tools.delete(id)
  }

  list(): AgentDeskTool[] {
    return [...this.tools.values()]
  }

  get(id: string): AgentDeskTool | undefined {
    return this.tools.get(id)
  }

  async execute(id: string, context: Parameters<AgentDeskTool["execute"]>[0], input: Record<string, unknown>): Promise<
    { ok: boolean; output?: unknown; error?: string; denied?: boolean }
  > {
    const tool = this.tools.get(id)
    if (!tool) return { ok: false, error: `unknown tool: ${id}` }
    const decision = this.permission.check({ toolId: id, action: id, input } satisfies PermissionRequest)
    if (decision === "deny") return { ok: false, denied: true, error: `permission denied: ${id}` }
    return tool.execute(context, input)
  }

  get permissionCore(): PermissionCore {
    return this.permission
  }
}
