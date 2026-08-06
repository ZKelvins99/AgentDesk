import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ApprovalRuleRow, matchRule, toMatcherInternal } from './rules';

const WS = path.resolve('/ws');

function rule(partial: Partial<ApprovalRuleRow> = {}): ApprovalRuleRow {
  return {
    id: 'r1',
    scope: 'global',
    workspaceId: null,
    matcher: {},
    decision: 'allow',
    createdAt: 0,
    expiresAt: null,
    ...partial,
  };
}

describe('approval.rules（README 8.7.3）', () => {
  it('工具粒度匹配', () => {
    expect(matchRule(rule({ matcher: { tool: 'bash' } }), 's1', 'bash', {}, WS)).toBe(true);
    expect(matchRule(rule({ matcher: { tool: 'bash' } }), 's1', 'read', {}, WS)).toBe(false);
  });

  it('bash 前缀匹配（非 bash 工具不匹配）', () => {
    const r = rule({ matcher: { tool: 'bash', bashPrefix: 'npm run' } });
    expect(matchRule(r, 's1', 'bash', { command: 'npm run build' }, WS)).toBe(true);
    expect(matchRule(r, 's1', 'bash', { command: 'npm install' }, WS)).toBe(false);
    expect(matchRule(r, 's1', 'write', { path: 'x' }, WS)).toBe(false);
  });

  it('路径前缀匹配', () => {
    const r = rule({ matcher: { pathPrefix: path.join(WS, 'src') } });
    expect(matchRule(r, 's1', 'write', { path: path.join(WS, 'src', 'a.ts') }, WS)).toBe(true);
    expect(matchRule(r, 's1', 'write', { path: path.join(WS, 'out', 'a.ts') }, WS)).toBe(false);
  });

  it('sessionId 过滤与过期规则', () => {
    const r = rule({ scope: 'session', matcher: { sessionId: 's1', tool: 'bash' } });
    expect(matchRule(r, 's1', 'bash', {}, WS)).toBe(true);
    expect(matchRule(r, 's2', 'bash', {}, WS)).toBe(false);
    const expired = rule({ matcher: { tool: 'bash' }, expiresAt: Date.now() - 1000 });
    expect(matchRule(expired, 's1', 'bash', {}, WS)).toBe(false);
  });

  it('toMatcherInternal：空字段不写入', () => {
    expect(toMatcherInternal({ scope: 'global', matcher: {}, decision: 'allow' })).toEqual({});
    expect(
      toMatcherInternal({
        scope: 'session',
        sessionId: 's1',
        matcher: { tool: 'bash', bashPrefix: 'npm ', pathPrefix: '/x' },
        decision: 'deny',
      }),
    ).toEqual({ sessionId: 's1', tool: 'bash', bashPrefix: 'npm ', pathPrefix: '/x' });
  });
});
