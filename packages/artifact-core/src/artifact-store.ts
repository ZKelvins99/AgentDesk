import { randomUUID } from "node:crypto"
import type { AgentDeskDatabase } from "@agentdesk/storage-core"
import type { Artifact, ArtifactCreatedEvent, ArtifactUpdatedEvent, CreateArtifactInput } from "./artifact.ts"

export interface ArtifactStoreOptions {
  /** 最大保留版本数（M11-T08）；默认 10 */
  readonly maxVersions?: number
}

type ArtifactListener = (event: ArtifactCreatedEvent | ArtifactUpdatedEvent) => void

/**
 * M11-T03/T04: Artifact Store —— 统一保存 Artifact 元数据，支持多版本与血缘。
 * 内容本身不复制（uri 指向 Runtime/文件系统），仅存必要索引（实施文档 23.1 原则）。
 */
export class ArtifactStore {
  private readonly db: AgentDeskDatabase
  private readonly maxVersions: number
  private readonly listeners = new Set<ArtifactListener>()

  constructor(db: AgentDeskDatabase, options: ArtifactStoreOptions = {}) {
    this.db = db
    this.maxVersions = options.maxVersions ?? 10
  }

  subscribe(listener: ArtifactListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** M11-T03: 创建 Artifact（v1） */
  create(input: CreateArtifactInput): Artifact {
    const now = new Date().toISOString()
    const artifact: Artifact = {
      id: `art_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      type: input.type,
      title: input.title,
      uri: input.uri,
      ownerRuntimeId: input.ownerRuntimeId,
      ownerAgentId: input.ownerAgentId,
      version: 1,
      createdAt: now,
      metadata: input.metadata ?? {},
      parentIds: input.parentIds ?? [],
    }
    this.insert(artifact)
    this.emit({ type: "artifact.created", artifact, at: now })
    return artifact
  }

  /** M11-T04: 更新（生成新版本 v+1），同时保留历史版本 */
  update(id: string, patch: Partial<Omit<CreateArtifactInput, "type">>): Artifact | undefined {
    const latest = this.getLatest(id)
    if (!latest) return undefined
    const previousVersion = latest.version
    const now = new Date().toISOString()
    const next: Artifact = {
      ...latest,
      version: latest.version + 1,
      createdAt: now,
      title: patch.title ?? latest.title,
      uri: patch.uri ?? latest.uri,
      ownerRuntimeId: patch.ownerRuntimeId ?? latest.ownerRuntimeId,
      ownerAgentId: patch.ownerAgentId ?? latest.ownerAgentId,
      metadata: patch.metadata ?? latest.metadata,
      parentIds: patch.parentIds ?? latest.parentIds,
    }
    this.insert(next)
    this.prune(id)
    this.emit({ type: "artifact.updated", artifact: next, previousVersion, at: now })
    return next
  }

  get(id: string, version?: number): Artifact | undefined {
    if (version !== undefined) {
      const row = this.db.get<Row>(
        "SELECT * FROM artifacts WHERE id = ? AND version = ?",
        id,
        version,
      )
      return row ? toArtifact(row) : undefined
    }
    return this.getLatest(id)
  }

  getLatest(id: string): Artifact | undefined {
    const row = this.db.get<Row>(
      "SELECT * FROM artifacts WHERE id = ? ORDER BY version DESC LIMIT 1",
      id,
    )
    return row ? toArtifact(row) : undefined
  }

  list(): Artifact[] {
    // 每个 id 只返回最新版本
    const rows = this.db.all<Row>(
      "SELECT a.* FROM artifacts a WHERE a.version = (SELECT MAX(version) FROM artifacts b WHERE b.id = a.id) ORDER BY a.created_at DESC",
    )
    return rows.map(toArtifact)
  }

  listByOwner(ownerRuntimeId: string): Artifact[] {
    return this.list().filter((a) => a.ownerRuntimeId === ownerRuntimeId)
  }

  versions(id: string): Artifact[] {
    return this.db
      .all<Row>("SELECT * FROM artifacts WHERE id = ? ORDER BY version ASC", id)
      .map(toArtifact)
  }

  /** M11-T07: 血缘 —— 展开父 Artifact 链 */
  lineage(id: string): Artifact[] {
    const seen = new Set<string>()
    const out: Artifact[] = []
    const visit = (artifact: Artifact | undefined): void => {
      if (!artifact || seen.has(artifact.id)) return
      seen.add(artifact.id)
      out.push(artifact)
      for (const parentId of artifact.parentIds) {
        visit(this.getLatest(parentId))
      }
    }
    visit(this.getLatest(id))
    return out
  }

  /** M11-T08: 删除（全部版本） */
  delete(id: string): boolean {
    const before = this.db.get<Row>("SELECT id FROM artifacts WHERE id = ? LIMIT 1", id)
    if (!before) return false
    this.db.run("DELETE FROM artifacts WHERE id = ?", id)
    return true
  }

  private insert(artifact: Artifact): void {
    this.db.run(
      "INSERT INTO artifacts (id, version, type, title, uri, owner_runtime_id, owner_agent_id, parent_ids_json, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      artifact.id,
      artifact.version,
      artifact.type,
      artifact.title,
      artifact.uri,
      artifact.ownerRuntimeId ?? null,
      artifact.ownerAgentId ?? null,
      JSON.stringify(artifact.parentIds),
      JSON.stringify(artifact.metadata),
      artifact.createdAt,
    )
  }

  /** M11-T08: 超出 maxVersions 的旧版本裁剪 */
  private prune(id: string): void {
    const rows = this.db.all<Row>(
      "SELECT version FROM artifacts WHERE id = ? ORDER BY version DESC",
      id,
    )
    if (rows.length <= this.maxVersions) return
    for (const row of rows.slice(this.maxVersions)) {
      this.db.run("DELETE FROM artifacts WHERE id = ? AND version = ?", id, row.version)
    }
  }

  private emit(event: ArtifactCreatedEvent | ArtifactUpdatedEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

interface Row {
  id: string
  version: number
  type: string
  title: string
  uri: string
  owner_runtime_id: string | null
  owner_agent_id: string | null
  parent_ids_json: string
  metadata_json: string
  created_at: string
}

function toArtifact(row: Row): Artifact {
  return {
    id: row.id,
    version: row.version,
    type: row.type,
    title: row.title,
    uri: row.uri,
    ownerRuntimeId: row.owner_runtime_id ?? undefined,
    ownerAgentId: row.owner_agent_id ?? undefined,
    parentIds: JSON.parse(row.parent_ids_json) as string[],
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    createdAt: row.created_at,
  }
}
