import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ApprovalRequestView } from '@agentdesk/ipc';
import type { ApprovalMode } from '@agentdesk/shared';
import type { ApprovalStore } from './approval-store';
import { classifyRisk, isPathInside } from './risk';
import { matchRule } from './rules';
import type { ApprovalInput, ApprovalOutcome, RiskLevel } from './types';

export interface AskResponse {
  decision: 'allow-once' | 'always' | 'deny' | 'deny-with-reason';
  reason?: string;
}

export interface ApprovalEngineOptions {
  store: ApprovalStore;
  getApprovalMode: (sessionId: string) => ApprovalMode;
  getWorkspacePath: (sessionId: string) => string | null;
  ask: (req: ApprovalRequestView) => Promise<AskResponse | 'timeout'>;
  timeoutMs?: number;
}

/**
 * ApprovalEngine（README 8.7.3）：
 * 规则（会话 → 全局）→ 会话审批模式默认值 → 风险分级 → 弹窗询问。
 * 超时/通道失败一律按拒绝处理（G5）。
 */
export class ApprovalEngine {
  private readonly timeoutMs: number;

  constructor(private readonly options: ApprovalEngineOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  get store(): ApprovalStore {
    return this.options.store;
  }

  setAskHandler(ask: (req: ApprovalRequestView) => Promise<AskResponse | 'timeout'>): void {
    this.options.ask = ask;
  }

  async decide(input: ApprovalInput): Promise<ApprovalOutcome> {
    const risk = classifyRisk(
      input.tool,
      input.input,
      input.cwd,
      this.options.getWorkspacePath(input.sessionId),
    );
    const summary = summarize(input.tool, input.input);
    const hash = argsHash(input.tool, input.input);

    // 1) 规则（会话 always 记录 / workspace / 全局）
    const rules = this.options.store.listRules({ sessionId: input.sessionId });
    for (const rule of rules) {
      if (matchRule(rule, input.sessionId, input.tool, input.input, input.cwd)) {
        this.audit(input, summary, hash, risk, rule.decision, rule.id);
        return { decision: rule.decision, ruleId: rule.id, risk };
      }
    }

    // 2) 模式默认值
    const mode = this.options.getApprovalMode(input.sessionId);
    const auto = this.modeDefault(mode, input, risk);
    if (auto === 'allow') {
      this.audit(input, summary, hash, risk, 'auto-allow');
      return { decision: 'allow', risk };
    }
    if (auto === 'deny') {
      const reason =
        mode === 'plan'
          ? '当前审批模式为 plan：写/编辑与命令执行已被拦截（AgentDesk 审批）'
          : '当前审批模式拒绝此操作（AgentDesk 审批）';
      this.audit(input, summary, hash, risk, 'mode-deny');
      return { decision: 'deny', reason, risk };
    }

    // 3) 询问用户（超时默认拒绝）
    const view: ApprovalRequestView = {
      id: randomUUID(),
      sessionId: input.sessionId,
      tool: input.tool,
      argsSummary: summary,
      risk,
      cwd: input.cwd,
    };
    const res = await this.askWithTimeout(view);
    if (res === 'timeout') {
      this.audit(input, summary, hash, risk, 'timeout-deny');
      return { decision: 'deny', reason: '审批超时，默认拒绝（AgentDesk 审批）', risk };
    }
    switch (res.decision) {
      case 'allow-once':
        this.audit(input, summary, hash, risk, 'allow-once');
        return { decision: 'allow', risk };
      case 'always': {
        const { id } = this.options.store.saveRule({
          scope: 'session',
          sessionId: input.sessionId,
          matcher: { tool: input.tool },
          decision: 'allow',
        });
        this.audit(input, summary, hash, risk, 'always-allow', id);
        return { decision: 'allow', ruleId: id, risk };
      }
      case 'deny':
        this.audit(input, summary, hash, risk, 'deny');
        return { decision: 'deny', reason: '用户拒绝了此操作（AgentDesk 审批）', risk };
      case 'deny-with-reason':
        this.audit(input, summary, hash, risk, 'deny-reason');
        return {
          decision: 'deny',
          reason: res.reason?.trim() || '用户拒绝了此操作（AgentDesk 审批）',
          risk,
        };
    }
  }

  private modeDefault(
    mode: ApprovalMode,
    input: ApprovalInput,
    risk: RiskLevel,
  ): 'allow' | 'deny' | 'ask' {
    // 高危：任何模式下都询问（README 8.7.2，full-access 亦如此）
    if (risk === 'high') return 'ask';
    switch (mode) {
      case 'plan':
        return input.tool === 'read' ? 'allow' : 'deny';
      case 'read-only':
        return input.tool === 'read' ? 'allow' : 'ask';
      case 'auto-edit': {
        if (input.tool === 'read') return 'allow';
        if (input.tool === 'write' || input.tool === 'edit') {
          const ws = this.options.getWorkspacePath(input.sessionId);
          if (
            ws &&
            isPathInside(
              ws,
              path.resolve(
                input.cwd,
                String(((input.input ?? {}) as Record<string, unknown>).path ?? ''),
              ),
            )
          ) {
            return 'allow';
          }
        }
        return 'ask';
      }
      case 'full-access':
        return 'allow';
    }
  }

  private async askWithTimeout(view: ApprovalRequestView): Promise<AskResponse | 'timeout'> {
    try {
      return await Promise.race([
        this.options.ask(view),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), this.timeoutMs)),
      ]);
    } catch {
      return 'timeout';
    }
  }

  private audit(
    input: ApprovalInput,
    summary: string,
    hash: string,
    risk: RiskLevel,
    decision: string,
    ruleId?: string | null,
  ): void {
    try {
      this.options.store.insertAudit({
        sessionId: input.sessionId,
        tool: input.tool,
        argsHash: hash,
        argsSummary: summary,
        risk,
        decision,
        ...(ruleId ? { ruleId } : {}),
      });
    } catch {
      // 审计失败不阻断审批主流程
    }
  }
}

function argsHash(tool: string, input: unknown): string {
  return createHash('sha256').update(JSON.stringify({ tool, input })).digest('hex').slice(0, 16);
}

function summarize(tool: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  try {
    if (tool === 'bash' && typeof i.command === 'string') return i.command.slice(0, 160);
    if ((tool === 'write' || tool === 'edit' || tool === 'read') && typeof i.path === 'string') {
      const extra =
        tool === 'write' && typeof i.content === 'string' ? `（${i.content.length} 字节）` : '';
      return `${i.path}${extra}`;
    }
    return JSON.stringify(input).slice(0, 160);
  } catch {
    return String(input).slice(0, 160);
  }
}
