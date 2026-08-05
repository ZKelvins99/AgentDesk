import type { AgentDefinition } from "@agentdesk/agent-core"
import type { TaskType } from "./classifier.ts"

/** M20-T03: Capability Matching —— task type → requiredCapability → 兼容 Agent */
export const TASK_REQUIRED_CAPABILITY: Record<TaskType, string> = {
  coding: "session.create",
  document: "artifact.emit",
  spreadsheet: "artifact.emit",
  slides: "artifact.emit",
  research: "session.create",
  data: "artifact.emit",
  general: "session.create",
}

export class TaskRouter {
  /** 从 AgentDefinition 中选兼容 agent：name 含 task 对应词 优先，否则 requiredCapabilities 匹配 */
  route(taskType: TaskType, agents: readonly AgentDefinition[]): AgentDefinition | undefined {
    const required = TASK_REQUIRED_CAPABILITY[taskType]
    const preferredName: Partial<Record<TaskType, string>> = {
      coding: "code",
      document: "work",
      spreadsheet: "work",
      slides: "work",
      research: "research",
      data: "data",
    }
    const preferred = preferredName[taskType]
    if (preferred) {
      const byName = agents.find((a) => a.id === preferred)
      if (byName) return byName
    }
    return agents.find((a) => (a.requiredCapabilities ?? []).includes(required))
  }
}
