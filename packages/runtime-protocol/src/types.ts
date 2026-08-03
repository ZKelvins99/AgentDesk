/** 基础标识与通用类型 */

/** Runtime 标识，如 "opencode" | "pi" | "demo" | 第三方 id */
export type RuntimeId = string

/** AgentDesk 平台侧会话标识 */
export type SessionId = string

/** Agent 标识 */
export type AgentId = string

/** Profile 标识 */
export type ProfileId = string

/** Artifact 标识 */
export type ArtifactId = string

/** ISO-8601 时间戳 */
export type Timestamp = string

/** 运行模式 */
export type RuntimeMode = "pure-opencode" | "pure-pi" | "hybrid"

export interface HealthStatus {
  readonly ok: boolean
  readonly runtimeId: RuntimeId
  readonly detail?: string
  readonly checkedAt: Timestamp
}

export type Unsubscribe = () => void