/**
 * AgentDesk Bridge Extension（README 8.2）：注入 pi 进程的"代理人"。
 * M5 落地权限拦截：tool_call → uplink → 主进程 ApprovalEngine → block/reason。
 * 模块：uplink（HTTP loopback 控制通道）/ approval（权限拦截）/ mcp-tools（M6）。
 */

import { decideApproval } from './approval';
import { createUplink, type Uplink } from './uplink';

interface ToolCallEvent {
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
}

interface ToolCallContext {
  cwd?: string;
}

export default async function agentdeskBridge(pi: {
  on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => void;
}): Promise<void> {
  const uplink: Uplink | null = createUplink(
    process.env.AGENTDESK_UPLINK,
    process.env.AGENTDESK_TOKEN,
  );
  const sessionId = process.env.AGENTDESK_SESSION_ID ?? 'unknown';

  pi.on('tool_call', async (event: ToolCallEvent, ctx: ToolCallContext): Promise<unknown> => {
    if (!event.toolName) return undefined;
    return decideApproval(
      {
        toolName: event.toolName,
        toolCallId: event.toolCallId ?? '',
        input: event.input,
      },
      ctx?.cwd ?? process.cwd(),
      sessionId,
      uplink,
    );
  });

  pi.on('session_shutdown', () => {
    uplink?.close();
  });
}
