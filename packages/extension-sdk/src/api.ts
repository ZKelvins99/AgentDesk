import type { AgentDefinition } from "@agentdesk/agent-core"
import type { AgentDeskTool } from "@agentdesk/tool-core"
import type { PlatformSkill } from "@agentdesk/skill-core"

/** M21-T04: 扩展运行时权限检查 */
export interface ExtensionRuntimePermissions {
  has(permission: "filesystem" | "network" | "shell" | "runtime" | "ui"): boolean
}

/** M21-T01: Extension API —— 第三方扩展唯一入口 */
export interface ExtensionAPI {
  readonly manifest: { readonly id: string; readonly name: string; readonly version: string }
  readonly permissions: ExtensionRuntimePermissions
  registerRuntime(input: { id: string; displayName: string; version: string }): void
  registerAgent(agent: AgentDefinition): void
  registerTool(tool: AgentDeskTool): void
  registerSkill(skill: Omit<PlatformSkill, "source" | "path" | "body"> & { body?: string }): void
  registerArtifactRenderer(input: { type: string; renderer: (artifact: { uri: string }) => Promise<{ html?: string } | string> }): void
  registerCommand(input: { name: string; description?: string; handler: (args: string) => Promise<void> }): void
  registerSidebarPanel(input: { id: string; title: string; render: () => Promise<string> }): void
}

/** 收集注册结果的 ExtensionRegistry（供 Host 查询） */
export class ExtensionRegistry {
  readonly runtimes: Array<{ id: string; displayName: string; version: string }> = []
  readonly agents: AgentDefinition[] = []
  readonly tools: AgentDeskTool[] = []
  readonly skills: Array<Omit<PlatformSkill, "source" | "path" | "body"> & { body?: string }> = []
  readonly artifactRenderers: Array<{ type: string; renderer: (artifact: { uri: string }) => Promise<{ html?: string } | string> }> = []
  readonly commands: Array<{ name: string; description?: string; handler: (args: string) => Promise<void> }> = []
  readonly sidebarPanels: Array<{ id: string; title: string; render: () => Promise<string> }> = []

  createAPI(manifest: { id: string; name: string; version: string }, permissions: readonly string[]): ExtensionAPI {
    const permSet = new Set(permissions)
    return {
      manifest,
      permissions: {
        has: (p) => permSet.has(p),
      },
      registerRuntime: (r) => this.runtimes.push(r),
      registerAgent: (a) => this.agents.push(a),
      registerTool: (t) => this.tools.push(t),
      registerSkill: (s) => this.skills.push(s),
      registerArtifactRenderer: (r) => this.artifactRenderers.push(r),
      registerCommand: (c) => this.commands.push(c),
      registerSidebarPanel: (p) => this.sidebarPanels.push(p),
    }
  }
}
