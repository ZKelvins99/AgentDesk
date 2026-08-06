/**
 * pi RPC 通用类型（对齐 upstream packages/coding-agent/docs/rpc.md + README 4.7）。
 * Model / Command / SessionState 等响应类型见 responses.ts。
 */

export type PiStreamingBehavior = 'steer' | 'followUp';
export type PiStopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';

export interface PiCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total?: number;
}

export interface PiUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: PiCost;
}

export type PiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolCall'; id: string; name: string; arguments: unknown };

export interface PiMessage {
  role: 'user' | 'assistant' | 'toolResult' | 'bashExecution' | string;
  content?: string | PiContentBlock[];
  timestamp?: number;
  // assistant
  api?: string;
  provider?: string;
  model?: string;
  usage?: PiUsage;
  stopReason?: PiStopReason;
  // toolResult
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  // bashExecution
  command?: string;
  output?: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
  fullOutputPath?: string | null;
  [key: string]: unknown;
}