import type { AgentDeskDatabase } from "./database.ts"
import type { SessionBinding, Workspace } from "./workspace-store.ts"

export interface RecoverySnapshot {
  readonly workspaces: Workspace[]
  readonly bindings: SessionBinding[]
  readonly recoveredAt: string
}

/**
 * M10-T05: Crash Recovery —— 应用重启后从 SQLite 恢复 Workspace 与 Session 映射。
 * 不复制 Native Session 文件，仅恢复 AgentDesk 索引（Gate G10）。
 */
export class CrashRecovery {
  private readonly db: AgentDeskDatabase

  constructor(db: AgentDeskDatabase) {
    this.db = db
  }

  snapshot(): RecoverySnapshot {
    const workspaces = this.db.all<Workspace>(
      "SELECT id, name, path, created_at AS createdAt, last_opened_at AS lastOpenedAt FROM workspaces",
    )
    const bindings = this.db.all<SessionBinding>(
      "SELECT agentdesk_session_id AS agentdeskSessionId, runtime_id AS runtimeId, native_session_id AS nativeSessionId, workspace_id AS workspaceId, created_at AS createdAt FROM session_bindings",
    )
    return {
      workspaces,
      bindings,
      recoveredAt: new Date().toISOString(),
    }
  }

  /** 崩溃恢复：把绑定按 workspace 分组，供 UI 重新挂载 Native Session */
  groupBindingsByWorkspace(snapshot: RecoverySnapshot): Map<string, SessionBinding[]> {
    const map = new Map<string, SessionBinding[]>()
    for (const binding of snapshot.bindings) {
      const list = map.get(binding.workspaceId) ?? []
      list.push(binding)
      map.set(binding.workspaceId, list)
    }
    return map
  }
}
