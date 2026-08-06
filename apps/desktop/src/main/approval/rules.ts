import path from 'node:path';
import type { ApprovalRuleInput } from '@agentdesk/ipc';

/**
 * 规则引擎匹配（README 8.7.3）：工具粒度 / bash 前缀 / 路径白名单。
 * session 级 always 记录把 sessionId 放进取 matcherJson（approval_rules 无独立 sessionId 列）。
 */

export interface ApprovalRuleMatcherInternal {
  sessionId?: string;
  tool?: string;
  bashPrefix?: string;
  pathPrefix?: string;
}

export interface ApprovalRuleRow {
  id: string;
  scope: 'session' | 'workspace' | 'global';
  workspaceId: string | null;
  matcher: ApprovalRuleMatcherInternal;
  decision: 'allow' | 'deny';
  createdAt: number;
  expiresAt: number | null;
}

export function toMatcherInternal(input: ApprovalRuleInput): ApprovalRuleMatcherInternal {
  return {
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.matcher.tool ? { tool: input.matcher.tool } : {}),
    ...(input.matcher.bashPrefix ? { bashPrefix: input.matcher.bashPrefix } : {}),
    ...(input.matcher.pathPrefix ? { pathPrefix: input.matcher.pathPrefix } : {}),
  };
}

export function matchRule(
  rule: ApprovalRuleRow,
  sessionId: string,
  tool: string,
  input: unknown,
  cwd: string,
): boolean {
  if (rule.expiresAt !== null && rule.expiresAt !== undefined && rule.expiresAt < Date.now()) {
    return false;
  }
  const m = rule.matcher;
  if (m.sessionId && m.sessionId !== sessionId) return false;
  if (m.tool && m.tool !== tool) return false;
  if (m.bashPrefix) {
    if (tool !== 'bash') return false;
    const i = (input ?? {}) as Record<string, unknown>;
    const cmd = typeof i.command === 'string' ? i.command : '';
    if (!cmd.startsWith(m.bashPrefix)) return false;
  }
  if (m.pathPrefix) {
    const i = (input ?? {}) as Record<string, unknown>;
    const p = typeof i.path === 'string' ? i.path : '';
    const resolved = path.resolve(cwd, p);
    const base = path.resolve(m.pathPrefix);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) return false;
  }
  return true;
}
