import type { AgentCapabilities } from "./capability.ts"
import type { AgentId, ProfileId, RuntimeId, RuntimeMode } from "./types.ts"

/** Agent 描述（文档 11.1） */
export interface AgentDescriptor {
  readonly id: AgentId
  readonly displayName: string
  readonly description?: string
  readonly runtimeId: RuntimeId
  readonly capabilities: AgentCapabilities
  readonly profileIds: readonly ProfileId[]
  /** Runtime 原生 agent 引用（例如 opencode agent id） */
  readonly nativeRef?: string
}

/** Profile 描述（文档 11.2） */
export interface AgentProfile {
  readonly id: ProfileId
  readonly displayName: string
  readonly description?: string
  readonly modes: readonly RuntimeMode[]
  readonly preferredRuntimeIds: readonly RuntimeId[]
  readonly requiredCapabilities: readonly string[]
  readonly defaultSystemPrompt?: string
}

/** 预置 Profile（文档 11.3 / 36） */
export const BUILTIN_PROFILES: readonly AgentProfile[] = [
  {
    id: "code",
    displayName: "Code",
    description: "编码任务",
    modes: ["pure-opencode", "pure-pi", "hybrid"],
    preferredRuntimeIds: ["opencode"],
    requiredCapabilities: ["session.create", "session.stream"],
  },
  {
    id: "work",
    displayName: "Work",
    description: "文档/表格/演示等办公任务",
    modes: ["hybrid"],
    preferredRuntimeIds: ["pi", "opencode"],
    requiredCapabilities: ["session.create", "session.stream", "artifact.emit"],
  },
  {
    id: "research",
    displayName: "Research",
    description: "研究任务",
    modes: ["hybrid"],
    preferredRuntimeIds: ["pi", "opencode"],
    requiredCapabilities: ["session.create", "session.stream", "artifact.emit"],
  },
  {
    id: "data",
    displayName: "Data",
    description: "数据分析任务",
    modes: ["hybrid"],
    preferredRuntimeIds: ["pi", "opencode"],
    requiredCapabilities: ["session.create", "session.stream", "artifact.emit"],
  },
] as const