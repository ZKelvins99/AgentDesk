/**
 * 权限拦截（README 8.7.3）：tool_call → uplink POST /approval → 主进程 ApprovalEngine 裁决。
 * 返回 { block: true, reason } 或 undefined（放行）。
 */

import type { Uplink } from './uplink';

export interface ApprovalVerdict {
  decision: 'allow' | 'deny';
  reason?: string;
}

export async function decideApproval(
  event: { toolName: string; input: unknown; toolCallId: string },
  cwd: string,
  sessionId: string,
  uplink: Uplink | null,
): Promise<{ block: true; reason: string } | undefined> {
  if (!uplink) {
    // 降级（README 8.2.1）：uplink 未注入时不拦截，pi 主流程继续可用
    return undefined;
  }
  let verdict: ApprovalVerdict;
  try {
    const raw = (await uplink.post(
      '/approval',
      { sessionId, tool: event.toolName, input: event.input, cwd },
      15_000,
    )) as ApprovalVerdict;
    verdict = raw;
  } catch (err) {
    // 超时/通道失败 → 默认拒绝（G5：审批超时默认行为为拒绝）
    return { block: true, reason: `审批通道不可用：${(err as Error).message}` };
  }
  if (verdict?.decision === 'deny') {
    return { block: true, reason: verdict.reason ?? '用户拒绝了此操作（AgentDesk 审批）' };
  }
  return undefined;
}
