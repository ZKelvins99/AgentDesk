import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AgentDeskEvent } from '@agentdesk/ipc';
import type Database from 'better-sqlite3';
import type { AppDatabase } from './db';

/**
 * 会话索引 + 渲染缓存存储（README 8.8.1/8.8.2）：
 * pi 持有完整内容，这里存索引（sessions）与可重建事件缓存（session_events）。
 */

export type WorkspaceTrust = 'unknown' | 'once' | 'always' | 'alwaysParent' | 'never';
export type TrustDecision = 'once' | 'always' | 'alwaysParent' | 'never';
export type SessionStatus = 'idle' | 'streaming' | 'degraded' | 'error';

export interface WorkspaceRecord {
  id: string;
  path: string;
  name: string;
  icon: string | null;
  trust: WorkspaceTrust;
  lastOpenedAt: number | null;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  workspaceId: string | null;
  workspacePath: string | null;
  piSessionId: string | null;
  sessionFile: string | null;
  title: string;
  provider: string | null;
  model: string | null;
  status: SessionStatus;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  approvalMode: string | null;
  costUsd: number;
  seq: number;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface SessionListQuery {
  search?: string | undefined;
  archived?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface CreateSessionRecord {
  id: string;
  workspaceId?: string;
  title?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  approvalMode?: string;
  parentSessionId?: string;
}

export interface SessionPatch {
  piSessionId?: string;
  sessionFile?: string;
  title?: string;
  status?: SessionStatus;
  messageCount?: number;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  approvalMode?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  archivedAt?: number;
}

export interface StoredEvent {
  seq: number;
  ev: AgentDeskEvent;
  createdAt: number;
}

export function normalizeWorkspacePath(p: string): string {
  const resolved = path.resolve(p);
  return resolved.replace(/[\\/]+$/, '');
}

export function workspaceNameOf(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

interface WorkspaceRow {
  id: string;
  path: string;
  name: string;
  icon: string | null;
  trust: string;
  lastOpenedAt: number | null;
  createdAt: number;
}

interface SessionRow {
  id: string;
  workspaceId: string | null;
  workspacePath: string | null;
  piSessionId: string | null;
  sessionFile: string | null;
  title: string;
  provider: string | null;
  model: string | null;
  approvalMode: string | null;
  status: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

function toWorkspace(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    icon: row.icon,
    trust: row.trust as WorkspaceTrust,
    lastOpenedAt: row.lastOpenedAt,
    createdAt: row.createdAt,
  };
}

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workspacePath: row.workspacePath,
    piSessionId: row.piSessionId,
    sessionFile: row.sessionFile,
    title: row.title,
    provider: row.provider,
    model: row.model,
    approvalMode: row.approvalMode,
    status: (row.status as SessionStatus) ?? 'idle',
    messageCount: row.messageCount,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    costUsd: row.costUsd,
    seq: 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export class SessionStore {
  private readonly sqlite: Database.Database;
  private closed = false;
  private readonly exportsDir: string;

  constructor(database: AppDatabase, exportsDir: string) {
    this.sqlite = database.sqlite;
    this.exportsDir = exportsDir;
    mkdirSync(this.exportsDir, { recursive: true });
  }

  /** 启动时把「本次信任」重置回未知，强制下次打开重新询问（README 8.9）。 */
  resetOnceTrust(): void {
    this.sqlite.prepare(`UPDATE workspaces SET trust = 'unknown' WHERE trust = 'once'`).run();
  }

  // ---- workspaces ----

  upsertWorkspace(rawPath: string): { workspace: WorkspaceRecord; needsTrust: boolean } {
    const p = normalizeWorkspacePath(rawPath);
    const name = workspaceNameOf(p);
    const existing = this.sqlite.prepare(`SELECT * FROM workspaces WHERE path = ?`).get(p) as
      | WorkspaceRow
      | undefined;
    const now = Date.now();
    if (existing) {
      this.sqlite
        .prepare(`UPDATE workspaces SET lastOpenedAt = ?, name = ? WHERE id = ?`)
        .run(now, name, existing.id);
      const row = this.sqlite
        .prepare(`SELECT * FROM workspaces WHERE id = ?`)
        .get(existing.id) as WorkspaceRow;
      const ws = toWorkspace(row);
      return { workspace: ws, needsTrust: ws.trust === 'unknown' };
    }
    const id = randomUUID();
    this.sqlite
      .prepare(
        `INSERT INTO workspaces (id, path, name, trust, lastOpenedAt, createdAt)
         VALUES (?, ?, ?, 'unknown', ?, ?)`,
      )
      .run(id, p, name, now, now);
    const row = this.sqlite
      .prepare(`SELECT * FROM workspaces WHERE id = ?`)
      .get(id) as WorkspaceRow;
    return { workspace: toWorkspace(row), needsTrust: true };
  }

  listWorkspaces(): WorkspaceRecord[] {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM workspaces
         ORDER BY (lastOpenedAt IS NULL) ASC, lastOpenedAt DESC, name COLLATE NOCASE ASC`,
      )
      .all() as WorkspaceRow[];
    return rows.map(toWorkspace);
  }

  getWorkspace(id: string): WorkspaceRecord | null {
    const row = this.sqlite.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id) as
      | WorkspaceRow
      | undefined;
    return row ? toWorkspace(row) : null;
  }

  getWorkspaceByPath(rawPath: string): WorkspaceRecord | null {
    const row = this.sqlite
      .prepare(`SELECT * FROM workspaces WHERE path = ?`)
      .get(normalizeWorkspacePath(rawPath)) as WorkspaceRow | undefined;
    return row ? toWorkspace(row) : null;
  }

  setWorkspaceTrust(id: string, trust: WorkspaceTrust): void {
    this.sqlite.prepare(`UPDATE workspaces SET trust = ? WHERE id = ?`).run(trust, id);
  }

  touchWorkspace(id: string): void {
    this.sqlite.prepare(`UPDATE workspaces SET lastOpenedAt = ? WHERE id = ?`).run(Date.now(), id);
  }

  removeWorkspace(id: string): void {
    this.sqlite.prepare(`UPDATE sessions SET workspaceId = NULL WHERE workspaceId = ?`).run(id);
    this.sqlite.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id);
  }

  // ---- sessions ----

  createSession(record: CreateSessionRecord): void {
    const now = Date.now();
    this.sqlite
      .prepare(
        `INSERT INTO sessions
           (id, workspaceId, title, provider, model, thinkingLevel, approvalMode,
            status, messageCount, createdAt, updatedAt, parentSessionId)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'idle', 0, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.workspaceId ?? null,
        record.title ?? '新对话',
        record.provider ?? null,
        record.model ?? null,
        record.thinkingLevel ?? null,
        record.approvalMode ?? null,
        now,
        now,
        record.parentSessionId ?? null,
      );
  }

  updateSession(id: string, patch: SessionPatch): void {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as Array<
      [keyof SessionPatch, string | number]
    >;
    if (entries.length === 0) return;
    const sets = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    this.sqlite
      .prepare(`UPDATE sessions SET ${sets}, updatedAt = ? WHERE id = ?`)
      .run(...values, Date.now(), id);
  }

  getSession(id: string): SessionRecord | null {
    const row = this.sqlite
      .prepare(
        `SELECT s.*, w.path AS workspacePath
         FROM sessions s LEFT JOIN workspaces w ON w.id = s.workspaceId
         WHERE s.id = ?`,
      )
      .get(id) as SessionRow | undefined;
    return row ? toSession(row) : null;
  }

  listSessions(query: SessionListQuery = {}): SessionRecord[] {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (query.search) {
      clauses.push(`(s.title LIKE ? OR w.name LIKE ?)`);
      const like = `%${query.search}%`;
      values.push(like, like);
    }
    if (query.archived === true) {
      clauses.push(`s.archivedAt IS NOT NULL`);
    } else {
      clauses.push(`s.archivedAt IS NULL`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const rows = this.sqlite
      .prepare(
        `SELECT s.*, w.path AS workspacePath
         FROM sessions s LEFT JOIN workspaces w ON w.id = s.workspaceId
         ${where}
         ORDER BY s.updatedAt DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset) as SessionRow[];
    const out = rows.map(toSession);
    for (const r of out) {
      r.seq = this.latestSeq(r.id);
    }
    return out;
  }

  renameSession(id: string, title: string): void {
    this.updateSession(id, { title });
  }

  archiveSession(id: string): void {
    this.updateSession(id, { archivedAt: Date.now() });
  }

  deleteSession(id: string): void {
    this.sqlite.prepare(`DELETE FROM session_events WHERE sessionId = ?`).run(id);
    this.sqlite.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  }

  // ---- 事件渲染缓存（session_events） ----

  appendEvents(
    sessionId: string,
    events: Array<{ seq: number; ev: AgentDeskEvent }>,
    patch: { messageCount?: number; status?: SessionStatus; updatedAt?: number },
  ): void {
    if (events.length === 0) return;
    const now = patch.updatedAt ?? Date.now();
    const insert = this.sqlite.prepare(
      `INSERT OR IGNORE INTO session_events (sessionId, seq, kind, payloadJson, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
    );
    this.sqlite.transaction(() => {
      for (const { seq, ev } of events) {
        insert.run(sessionId, seq, ev.k, JSON.stringify(ev), now);
      }
      const sets: string[] = ['updatedAt = ?'];
      const values: Array<string | number> = [now];
      if (patch.messageCount !== undefined) {
        sets.push('messageCount = ?');
        values.push(patch.messageCount);
      }
      if (patch.status !== undefined) {
        sets.push('status = ?');
        values.push(patch.status);
      }
      values.push(sessionId);
      this.sqlite.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    })();
  }

  getEventsSince(sessionId: string, sinceSeq = 0): StoredEvent[] {
    const rows = this.sqlite
      .prepare(
        `SELECT seq, payloadJson, createdAt FROM session_events
         WHERE sessionId = ? AND seq > ?
         ORDER BY seq ASC`,
      )
      .all(sessionId, sinceSeq) as Array<{ seq: number; payloadJson: string; createdAt: number }>;
    return rows.map((r) => ({
      seq: r.seq,
      ev: JSON.parse(r.payloadJson) as AgentDeskEvent,
      createdAt: r.createdAt,
    }));
  }

  latestSeq(sessionId: string): number {
    const row = this.sqlite
      .prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM session_events WHERE sessionId = ?`)
      .get(sessionId) as { seq: number };
    return row.seq;
  }

  // ---- 导出（README 10.2 session:export） ----

  exportSession(id: string, format: 'md' | 'json'): string {
    const session = this.getSession(id);
    if (!session) throw new Error(`session not found: ${id}`);
    const events = this.getEventsSince(id, 0);
    mkdirSync(this.exportsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(
      this.exportsDir,
      `session-${stamp}-${id.slice(0, 8)}.${format === 'json' ? 'json' : 'md'}`,
    );
    const content =
      format === 'json'
        ? renderSessionJson(session, events)
        : renderSessionMarkdown(session, events);
    writeFileSync(file, content, 'utf8');
    return file;
  }

  isOpen(): boolean {
    return !this.closed;
  }

  close(): void {
    this.closed = true;
    this.sqlite.close();
  }
}

function renderSessionJson(session: SessionRecord, events: StoredEvent[]): string {
  return JSON.stringify(
    {
      session: {
        id: session.id,
        title: session.title,
        workspacePath: session.workspacePath,
        model: session.model,
        messageCount: session.messageCount,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      events: events.map(({ seq, ev }) => ({ seq, ev })),
    },
    null,
    2,
  );
}

function renderSessionMarkdown(session: SessionRecord, events: StoredEvent[]): string {
  const out: string[] = [`# ${session.title}`, ''];
  out.push(`- 会话：\`${session.id}\``);
  if (session.workspacePath) out.push(`- 工作区：\`${session.workspacePath}\``);
  if (session.model) out.push(`- 模型：${session.model}`);
  out.push('');

  interface MsgAcc {
    msgId: string;
    text: string;
    thinking: string;
  }
  const msgs = new Map<string, MsgAcc>();
  const order: string[] = [];
  interface ToolAcc {
    callId: string;
    name: string;
    args: unknown;
    ok: boolean | null;
    result: unknown;
    ms: number | null;
  }
  const tools = new Map<string, ToolAcc>();
  const errors: string[] = [];

  for (const { ev } of events) {
    switch (ev.k) {
      case 'msg.start': {
        msgs.set(ev.msgId, { msgId: ev.msgId, text: '', thinking: '' });
        order.push(ev.msgId);
        break;
      }
      case 'msg.delta': {
        const m = msgs.get(ev.msgId);
        if (!m) break;
        if (ev.part.t === 'text') m.text += ev.part.v;
        else m.thinking += ev.part.v;
        break;
      }
      case 'tool.start': {
        tools.set(ev.callId, {
          callId: ev.callId,
          name: ev.name,
          args: ev.args,
          ok: null,
          result: null,
          ms: null,
        });
        break;
      }
      case 'tool.end': {
        const t = tools.get(ev.callId);
        if (t) {
          t.ok = ev.ok;
          t.result = ev.result;
          t.ms = ev.ms;
        }
        break;
      }
      case 'error': {
        errors.push(`> ⚠ **${ev.scope}**：${ev.message}`);
        break;
      }
      default:
        break;
    }
  }

  for (const msgId of order) {
    const m = msgs.get(msgId);
    if (!m) continue;
    if (m.thinking) {
      out.push('<details>');
      out.push('<summary>🧠 思考过程</summary>');
      out.push('');
      out.push('```text');
      out.push(m.thinking);
      out.push('```');
      out.push('</details>');
      out.push('');
    }
    out.push(`**助手**：${m.text || '（空）'}`);
    out.push('');
  }

  for (const t of tools.values()) {
    out.push('---');
    out.push(`### 🔧 ${t.name}`);
    out.push('');
    out.push('```json');
    out.push(JSON.stringify(t.args, null, 2));
    out.push('```');
    if (t.result !== null && t.result !== undefined) {
      out.push('```json');
      out.push(JSON.stringify(t.result, null, 2));
      out.push('```');
    }
    out.push('');
  }

  for (const e of errors) {
    out.push(e);
    out.push('');
  }

  return `${out.join('\n')}\n`;
}
