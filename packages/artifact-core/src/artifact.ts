import type { ArtifactRef } from "@agentdesk/runtime-protocol"

/** M11-T02: ArtifactType 枚举（至少 10 种） */
export const ARTIFACT_TYPES = [
  "code",
  "text",
  "document",
  "spreadsheet",
  "slides",
  "pdf",
  "image",
  "chart",
  "dataset",
  "html",
] as const

export type ArtifactType = (typeof ARTIFACT_TYPES)[number] | (string & {})

/**
 * M11-T01: Artifact 定义（手册第 16 节 / 实施文档 M11）。
 * 平台只保存元数据与引用，内容由 Runtime / 文件系统拥有。
 */
export interface Artifact {
  readonly id: string
  readonly type: ArtifactType
  readonly title: string
  readonly uri: string
  readonly ownerRuntimeId?: string
  readonly ownerAgentId?: string
  readonly version: number
  readonly createdAt: string
  readonly metadata: Readonly<Record<string, unknown>>
  /** M11-T07: 血缘 —— 本 Artifact 的父 Artifact id */
  readonly parentIds: readonly string[]
}

/** 创建 Artifact 的输入 */
export interface CreateArtifactInput {
  readonly type: ArtifactType
  readonly title: string
  readonly uri: string
  readonly ownerRuntimeId?: string
  readonly ownerAgentId?: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly parentIds?: readonly string[]
}

/** 创建后的事件载荷（M11-T05） */
export interface ArtifactCreatedEvent {
  readonly type: "artifact.created"
  readonly artifact: Artifact
  readonly at: string
}

/** 版本更新事件（M11-T05） */
export interface ArtifactUpdatedEvent {
  readonly type: "artifact.updated"
  readonly artifact: Artifact
  readonly previousVersion: number
  readonly at: string
}

export function toArtifactRef(artifact: Artifact): ArtifactRef {
  return {
    id: artifact.id,
    kind: artifact.type,
    name: artifact.title,
    mime: mimeForType(artifact.type),
    uri: artifact.uri,
    createdAt: artifact.createdAt,
    createdBy: artifact.ownerRuntimeId ?? "unknown",
    parentIds: artifact.parentIds,
    meta: artifact.metadata,
  }
}

export function mimeForType(type: ArtifactType): string {
  switch (type) {
    case "code":
      return "text/plain"
    case "text":
      return "text/plain"
    case "document":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case "spreadsheet":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case "slides":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    case "pdf":
      return "application/pdf"
    case "image":
      return "image/png"
    case "chart":
      return "image/svg+xml"
    case "dataset":
      return "application/json"
    case "html":
      return "text/html"
    default:
      return "application/octet-stream"
  }
}
