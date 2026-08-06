import { randomUUID } from 'node:crypto';
import type { ApprovalAuditEntry, ApprovalRule, ApprovalRuleInput } from '@agentdesk/ipc';
import type { AppDatabase } from '../storage/db';
import { type ApprovalRuleRow, toMatcherInternal } from './rules';

/** approval_rules / approval_audit 存取（README 8.8.2 表）。 */
export class ApprovalStore {
  private readonly sqlite: AppDatabase['sqlite'];

  constructor(db: AppDatabase) {
    this.sqlite = db.sqlite;
  }

  listRules(opts: { sessionId?: string } = {}): ApprovalRuleRow[] {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM approval_rules
         ORDER BY createdAt ASC`,
      )
      .all() as Array<Record<string, unknown>>;
    return rows
      .map((r) => toRuleRow(r))
      .filter((r) => {
        if (!opts.sessionId) return true;
        if (r.scope === 'session' && r.matcher.sessionId !== opts.sessionId) return false;
        return true;
      });
  }

  saveRule(input: ApprovalRuleInput): { id: string } {
    const id = randomUUID();
    const matcher = toMatcherInternal(input);
    this.sqlite
      .prepare(
        `INSERT INTO approval_rules (id, scope, workspaceId, matcherJson, decision, createdAt, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.scope,
        input.workspaceId ?? null,
        JSON.stringify(matcher),
        input.decision,
        Date.now(),
        input.expiresAt ?? null,
      );
    return { id };
  }

  deleteRule(id: string): boolean {
    const res = this.sqlite.prepare(`DELETE FROM approval_rules WHERE id = ?`).run(id);
    return res.changes > 0;
  }

  insertAudit(entry: {
    sessionId: string;
    tool: string;
    argsHash: string;
    argsSummary: string;
    risk: string;
    decision: string;
    ruleId?: string | null;
  }): void {
    this.sqlite
      .prepare(
        `INSERT INTO approval_audit (sessionId, tool, argsHash, argsSummary, risk, decision, ruleId, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.sessionId,
        entry.tool,
        entry.argsHash,
        entry.argsSummary,
        entry.risk,
        entry.decision,
        entry.ruleId ?? null,
        Date.now(),
      );
  }

  listAudit(opts: { sessionId?: string; limit?: number } = {}): ApprovalAuditEntry[] {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM approval_audit
         WHERE (? IS NULL OR sessionId = ?)
         ORDER BY at DESC
         LIMIT ?`,
      )
      .all(opts.sessionId ?? null, opts.sessionId ?? null, opts.limit ?? 200) as Array<
      Record<string, unknown>
    >;
    return rows.map(toAuditEntry);
  }

  clearAudit(sessionId?: string): number {
    const res = sessionId
      ? this.sqlite.prepare(`DELETE FROM approval_audit WHERE sessionId = ?`).run(sessionId)
      : this.sqlite.prepare(`DELETE FROM approval_audit`).run();
    return res.changes;
  }

  exportAudit(format: 'md' | 'json'): string {
    const entries = this.listAudit({ limit: 500 });
    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }
    const lines = entries.map((e) => {
      const t = new Date(e.at).toISOString();
      return `- \`${t}\` **${e.tool}** risk=${e.risk ?? '-'} decision=\`${e.decision}\` ${e.argsSummary ?? ''}${e.ruleId ? ` rule=${e.ruleId}` : ''}`;
    });
    return ['# AgentDesk 审批审计', '', ...lines].join('\n');
  }

  toApiRule(row: ApprovalRuleRow): ApprovalRule {
    return {
      id: row.id,
      scope: row.scope,
      ...(row.workspaceId !== null ? { workspaceId: row.workspaceId } : {}),
      ...(row.matcher.sessionId ? { sessionId: row.matcher.sessionId } : {}),
      matcher: {
        ...(row.matcher.tool ? { tool: row.matcher.tool } : {}),
        ...(row.matcher.bashPrefix ? { bashPrefix: row.matcher.bashPrefix } : {}),
        ...(row.matcher.pathPrefix ? { pathPrefix: row.matcher.pathPrefix } : {}),
      },
      decision: row.decision,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }
}

function toRuleRow(raw: Record<string, unknown>): ApprovalRuleRow {
  let matcher: ApprovalRuleRow['matcher'] = {};
  try {
    matcher = JSON.parse(String(raw.matcherJson ?? '{}')) as ApprovalRuleRow['matcher'];
  } catch {
    matcher = {};
  }
  return {
    id: String(raw.id),
    scope: raw.scope as ApprovalRuleRow['scope'],
    workspaceId:
      raw.workspaceId === null || raw.workspaceId === undefined ? null : String(raw.workspaceId),
    matcher,
    decision: raw.decision as 'allow' | 'deny',
    createdAt: Number(raw.createdAt),
    expiresAt: raw.expiresAt === null || raw.expiresAt === undefined ? null : Number(raw.expiresAt),
  };
}

function toAuditEntry(raw: Record<string, unknown>): ApprovalAuditEntry {
  return {
    id: Number(raw.id),
    sessionId: raw.sessionId === null || raw.sessionId === undefined ? null : String(raw.sessionId),
    tool: String(raw.tool),
    argsSummary:
      raw.argsSummary === null || raw.argsSummary === undefined ? null : String(raw.argsSummary),
    risk: raw.risk === null || raw.risk === undefined ? null : String(raw.risk),
    decision: String(raw.decision),
    ruleId: raw.ruleId === null || raw.ruleId === undefined ? null : String(raw.ruleId),
    at: Number(raw.at),
  };
}
