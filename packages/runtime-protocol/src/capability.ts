import type { RuntimeId } from "./types.ts"

/** 平台统一 Capability 目录（与文档第 7 节一致） */
export const CAPABILITIES = {
  SESSION_CREATE: "session.create",
  SESSION_RESUME: "session.resume",
  SESSION_STREAM: "session.stream",
  SESSION_CANCEL: "session.cancel",
  TOOLS_NATIVE: "tools.native",
  PERMISSION_EVENTS: "permission.events",
  SKILLS_NATIVE: "skills.native",
  EXTENSIONS_NATIVE: "extensions.native",
  ARTIFACT_EMIT: "artifact.emit",
  CONFIG_NATIVE: "config.native",
} as const

export type CapabilityId =
  | (typeof CAPABILITIES)[keyof typeof CAPABILITIES]
  | (string & {})

/** 一个 Runtime 或 Agent 的能力集合 */
export interface AgentCapabilities {
  readonly ids: readonly CapabilityId[]
  /** 原生能力明细（例如 native tool 列表），只读透传，平台不解析 */
  readonly native?: Readonly<Record<string, unknown>>
}

export function hasCapability(caps: AgentCapabilities, id: CapabilityId): boolean {
  return caps.ids.includes(id)
}

export function runtimeHasCapability(
  runtimeId: RuntimeId,
  caps: AgentCapabilities,
  id: CapabilityId,
): boolean {
  return caps.ids.includes(id)
}