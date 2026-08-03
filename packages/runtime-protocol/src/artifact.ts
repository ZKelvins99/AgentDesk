import type { ArtifactId, RuntimeId, Timestamp } from "./types.ts"

export const ARTIFACT_KINDS = {
  DOCX: "docx",
  XLSX: "xlsx",
  PPTX: "pptx",
  PDF: "pdf",
  MARKDOWN: "markdown",
  TEXT: "text",
  DATAFRAME: "dataframe",
  IMAGE: "image",
  FILE: "file",
  OTHER: "other",
} as const

export type ArtifactKind = (typeof ARTIFACT_KINDS)[keyof typeof ARTIFACT_KINDS] | (string & {})

/**
 * Artifact 引用：跨 Agent 交接的最小稳定协议（文档第 16 节）。
 * 平台只持有引用与元数据，内容由运行时/存储拥有。
 */
export interface ArtifactRef {
  readonly id: ArtifactId
  readonly kind: ArtifactKind
  readonly name: string
  readonly mime: string
  /** file:// / agentdesk:// / http(s):// 等可解析 URI */
  readonly uri: string
  readonly sizeBytes?: number
  readonly sha256?: string
  readonly createdAt: Timestamp
  /** 产出该 Artifact 的 Runtime */
  readonly createdBy: RuntimeId
  /** 父 Artifact（Lineage），用于追踪数据来源 */
  readonly parentIds: readonly ArtifactId[]
  readonly meta?: Readonly<Record<string, unknown>>
}

/** 完整 Artifact：引用 + 血缘快照 */
export interface Artifact extends ArtifactRef {
  readonly lineage?: ReadonlyArray<ArtifactRef>
}