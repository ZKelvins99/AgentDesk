import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

/**
 * M10-T01: AgentDesk 本地 SQLite 数据库（node:sqlite，零依赖）。
 * 只保存 AgentDesk 必要映射与索引；Native Session 数据不重复持久化。
 */
export class AgentDeskDatabase {
  private readonly db: DatabaseSync
  readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
    if (this.filePath !== ":memory:") {
      mkdirSync(dirname(this.filePath), { recursive: true })
    }
    this.db = new DatabaseSync(this.filePath)
    this.db.exec("PRAGMA journal_mode = WAL")
    this.migrate()
  }

  private migrate(): void {
    // M10-T02: workspaces
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      )
    `)
    // M10-T03: session mapping
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_bindings (
        agentdesk_session_id TEXT PRIMARY KEY,
        runtime_id TEXT NOT NULL,
        native_session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (runtime_id, native_session_id)
      )
    `)
    // M10-T04: per-runtime AgentDesk-level config (Native Config 仍归各 Runtime)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runtime_configs (
        runtime_id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    // M11: artifacts（metadata + 版本 + 血缘）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        uri TEXT NOT NULL,
        owner_runtime_id TEXT,
        owner_agent_id TEXT,
        parent_ids_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        PRIMARY KEY (id, version)
      )
    `)
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  run(sql: string, ...params: Array<string | number | null>): void {
    this.db.prepare(sql).run(...params)
  }

  get<T>(sql: string, ...params: Array<string | number | null>): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined
  }

  all<T>(sql: string, ...params: Array<string | number | null>): T[] {
    return this.db.prepare(sql).all(...params) as T[]
  }

  close(): void {
    this.db.close()
  }
}
