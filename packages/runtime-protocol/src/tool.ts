import type { RuntimeId } from "./types.ts"

/** 平台 Tool 描述（文档第 17 节） */
export interface ToolDescriptor {
  readonly id: string
  readonly name: string
  readonly description: string
  /** JSON Schema 风格入参定义 */
  readonly inputSchema?: unknown
  /** 归属 Runtime（平台 Tool 可无） */
  readonly runtimeId?: RuntimeId
  readonly native: boolean
}

/** Skill 描述（文档第 18 节）：Native 与 Platform 双层共存 */
export interface SkillDescriptor {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly source: "native" | "platform"
  readonly runtimeId?: RuntimeId
  readonly version?: string
}