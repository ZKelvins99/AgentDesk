/** 审批领域类型（README 8.7）。 */

export type RiskLevel = 'high' | 'medium' | 'low';

export interface ApprovalInput {
  sessionId: string;
  tool: string;
  input: unknown;
  cwd: string;
}

export interface ApprovalOutcome {
  decision: 'allow' | 'deny';
  reason?: string;
  ruleId?: string | null;
  risk: RiskLevel;
}
