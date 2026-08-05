import type { AgentDefinition } from "./definition.ts"

/** M18-T03: 默认 Agent 集合（Runtime 无关的 Profile Agent + Native Agent 占位） */
export const DEFAULT_AGENTS: readonly AgentDefinition[] = [
  {
    id: "opencode-native",
    name: "OpenCode Native",
    runtimeId: "opencode",
    description: "OpenCode 原生 Coding Agent",
    requiredCapabilities: ["session.create", "session.stream", "tools.native", "skills.native"],
  },
  {
    id: "pi-native",
    name: "Pi Native",
    runtimeId: "pi",
    description: "Pi 原生 Coding Agent",
    requiredCapabilities: ["session.create", "session.stream", "tools.native", "skills.native"],
  },
  {
    id: "code",
    name: "Code",
    runtimeId: "opencode",
    description: "编码任务（默认 opencode）",
    requiredCapabilities: ["session.create", "session.stream"],
    systemPrompt: "你是 AgentDesk 的编码 Agent，专注高效完成编码任务。",
    skills: ["business-report"],
  },
  {
    id: "work",
    name: "Work",
    runtimeId: "pi",
    description: "文档/表格/演示等办公任务",
    requiredCapabilities: ["session.create", "session.stream", "artifact.emit"],
    systemPrompt: "你是 AgentDesk 的办公 Agent，负责生成文档、表格、演示文稿。",
    skills: ["business-report"],
  },
  {
    id: "research",
    name: "Research",
    runtimeId: "pi",
    description: "研究任务",
    requiredCapabilities: ["session.create", "session.stream", "artifact.emit"],
    systemPrompt: "你是 AgentDesk 的研究 Agent，负责资料搜集与信息整理。",
  },
  {
    id: "data",
    name: "Data",
    runtimeId: "pi",
    description: "数据分析任务",
    requiredCapabilities: ["session.create", "session.stream", "artifact.emit"],
    systemPrompt: "你是 AgentDesk 的数据 Agent，负责数据分析与可视化。",
    skills: ["data-analysis"],
  },
]
