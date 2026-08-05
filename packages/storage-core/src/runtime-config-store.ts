import type { AgentDeskDatabase } from "./database.ts"

export interface RuntimeConfigRecord {
  readonly runtimeId: string
  readonly config: unknown
  readonly updatedAt: string
}

/**
 * M10-T04: 每个 Runtime 的 AgentDesk 级配置。
 * Native Config（模型/Agent/Skill 等）仍归各 Runtime 自身，这里只存 AgentDesk 侧偏好。
 */
export class RuntimeConfigStore {
  private readonly db: AgentDeskDatabase

  constructor(db: AgentDeskDatabase) {
    this.db = db
  }

  save(runtimeId: string, config: unknown): void {
    this.db.run(
      "INSERT OR REPLACE INTO runtime_configs (runtime_id, config_json, updated_at) VALUES (?, ?, ?)",
      runtimeId,
      JSON.stringify(config),
      new Date().toISOString(),
    )
  }

  get(runtimeId: string): RuntimeConfigRecord | undefined {
    const row = this.db.get<Record<string, unknown>>(
      "SELECT runtime_id, config_json, updated_at FROM runtime_configs WHERE runtime_id = ?",
      runtimeId,
    )
    if (!row) return undefined
    return {
      runtimeId: String(row.runtime_id),
      config: JSON.parse(String(row.config_json)) as unknown,
      updatedAt: String(row.updated_at),
    }
  }
}
