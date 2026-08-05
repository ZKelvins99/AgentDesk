import { randomUUID } from "node:crypto"
import type { AgentDeskDatabase } from "./database.ts"

export interface Workspace {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly createdAt: string
  readonly lastOpenedAt: string
}

export interface SessionBinding {
  readonly agentdeskSessionId: string
  readonly runtimeId: string
  readonly nativeSessionId: string
  readonly workspaceId: string
  readonly createdAt: string
}

/**
 * M10-T02/03: Workspace + Session 映射存储。
 * 只存必要映射，Native Session 数据不重复保存（实施文档 23.1）。
 */
export class WorkspaceStore {
  private readonly db: AgentDeskDatabase

  constructor(db: AgentDeskDatabase) {
    this.db = db
  }

  createWorkspace(name: string, path: string): Workspace {
    const now = new Date().toISOString()
    const workspace: Workspace = {
      id: `ws_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      name,
      path,
      createdAt: now,
      lastOpenedAt: now,
    }
    this.db.run(
      "INSERT INTO workspaces (id, name, path, created_at, last_opened_at) VALUES (?, ?, ?, ?, ?)",
      workspace.id,
      workspace.name,
      workspace.path,
      workspace.createdAt,
      workspace.lastOpenedAt,
    )
    return workspace
  }

  listWorkspaces(): Workspace[] {
    return this.db.all<Workspace>(
      "SELECT id, name, path, created_at AS createdAt, last_opened_at AS lastOpenedAt FROM workspaces ORDER BY last_opened_at DESC",
    )
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.db.get<Workspace>(
      "SELECT id, name, path, created_at AS createdAt, last_opened_at AS lastOpenedAt FROM workspaces WHERE id = ?",
      id,
    )
  }

  findWorkspaceByPath(path: string): Workspace | undefined {
    return this.db.get<Workspace>(
      "SELECT id, name, path, created_at AS createdAt, last_opened_at AS lastOpenedAt FROM workspaces WHERE path = ?",
      path,
    )
  }

  /** M10-T02: 打开工作区时刷新 last_opened_at */
  touchWorkspace(id: string): void {
    this.db.run("UPDATE workspaces SET last_opened_at = ? WHERE id = ?", new Date().toISOString(), id)
  }

  bindSession(input: {
    agentdeskSessionId: string
    runtimeId: string
    nativeSessionId: string
    workspaceId: string
  }): SessionBinding {
    const binding: SessionBinding = {
      ...input,
      createdAt: new Date().toISOString(),
    }
    this.db.run(
      "INSERT OR REPLACE INTO session_bindings (agentdesk_session_id, runtime_id, native_session_id, workspace_id, created_at) VALUES (?, ?, ?, ?, ?)",
      binding.agentdeskSessionId,
      binding.runtimeId,
      binding.nativeSessionId,
      binding.workspaceId,
      binding.createdAt,
    )
    return binding
  }

  /** M10-T03: 按 AgentDesk session id 查询映射 */
  getBinding(agentdeskSessionId: string): SessionBinding | undefined {
    return this.db.get<SessionBinding>(
      "SELECT agentdesk_session_id AS agentdeskSessionId, runtime_id AS runtimeId, native_session_id AS nativeSessionId, workspace_id AS workspaceId, created_at AS createdAt FROM session_bindings WHERE agentdesk_session_id = ?",
      agentdeskSessionId,
    )
  }

  /** M10-T03: 按原生 session id 查询（崩溃恢复时反查） */
  getBindingByNative(runtimeId: string, nativeSessionId: string): SessionBinding | undefined {
    return this.db.get<SessionBinding>(
      "SELECT agentdesk_session_id AS agentdeskSessionId, runtime_id AS runtimeId, native_session_id AS nativeSessionId, workspace_id AS workspaceId, created_at AS createdAt FROM session_bindings WHERE runtime_id = ? AND native_session_id = ?",
      runtimeId,
      nativeSessionId,
    )
  }

  listBindingsByWorkspace(workspaceId: string): SessionBinding[] {
    return this.db.all<SessionBinding>(
      "SELECT agentdesk_session_id AS agentdeskSessionId, runtime_id AS runtimeId, native_session_id AS nativeSessionId, workspace_id AS workspaceId, created_at AS createdAt FROM session_bindings WHERE workspace_id = ?",
      workspaceId,
    )
  }
}
