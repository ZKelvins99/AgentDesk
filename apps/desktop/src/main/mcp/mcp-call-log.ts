import type { McpCallContent, McpCallResult } from './mcp-types';

/**
 * MCP 调用日志（README 8.3.6）：最近 20 次调用的参数/结果/耗时，
 * 敏感字段脱敏 + 长内容截断，避免把 secret 与超长输出带进 UI。
 */
export interface McpCallLogEntry {
  id: number;
  at: number;
  server: string;
  tool: string;
  args: Record<string, unknown>;
  isError: boolean;
  error: string | null;
  durationMs: number;
  result: unknown;
}

const SENSITIVE_KEY_RE =
  /(api[-_]?key|token|secret|password|authorization|auth|cookie|credential)/i;
const MAX_ARGS_CHARS = 2_000;
const MAX_TEXT_CHARS = 300;
const MAX_RESULT_CHARS = 800;
const MAX_CONTENT_ITEMS = 8;

export function maskSensitiveValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY_RE.test(key)) return '***';
  if (Array.isArray(value)) return value.map((v) => maskSensitiveValue(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = maskSensitiveValue(v, k);
    return out;
  }
  return value;
}

function summarizeContent(content: McpCallContent): string {
  if (content.type === 'text') {
    const text = content.text ?? '';
    return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}…` : text;
  }
  if (content.type === 'image' || content.type === 'audio' || content.type === 'video') {
    return `<${content.type} data=${content.data.length}B${
      content.mimeType ? ` ${content.mimeType}` : ''
    }>`;
  }
  if (content.type === 'resource') return `resource:${content.uri}`;
  return '<other>';
}

export function summarizeResult(result: McpCallResult): string {
  const parts = result.content.slice(0, MAX_CONTENT_ITEMS).map(summarizeContent);
  const joined = parts.join(' | ');
  return joined.length > MAX_RESULT_CHARS ? `${joined.slice(0, MAX_RESULT_CHARS)}…` : joined;
}

export function maskArgs(args: Record<string, unknown>): Record<string, unknown> {
  const masked = maskSensitiveValue(args) as Record<string, unknown>;
  const text = JSON.stringify(masked);
  if (text.length <= MAX_ARGS_CHARS) return masked;
  return { __truncated__: true, preview: `${text.slice(0, MAX_ARGS_CHARS)}…` };
}
