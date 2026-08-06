/**
 * MCP 调用输出整理（README 8.3.4）：text 截断（保留头尾 + 提示）、
 * image/audio/video 落盘为附件并降级为文本占位、resource 摘要为文本 + uri 引用。
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { McpCallContent, McpCallResult } from './mcp-types';

export const MAX_TEXT_CHARS = 100_000;
export const KEEP_HEAD_TAIL_CHARS = 40_000;

export interface PrepareOutputOptions {
  attachmentsDir: string;
}

export interface PreparedMcpOutput {
  content: McpCallContent[];
  truncated: boolean;
  attachments: string[];
}

function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  const head = text.slice(0, KEEP_HEAD_TAIL_CHARS);
  const tail = text.slice(-KEEP_HEAD_TAIL_CHARS);
  return {
    text: `${head}\n\n…[输出过长已截断：共 ${text.length} 字符，完整结果见调用日志]…\n\n${tail}`,
    truncated: true,
  };
}

function extensionFor(mimeType: string | undefined): string {
  if (mimeType) {
    const ext = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'video/mp4': 'mp4',
    }[mimeType.toLowerCase()];
    if (ext) return ext;
  }
  return 'bin';
}

/** 将 MCP CallToolResult 整理成 pi 可用的 content 列表（README 8.3.4 降级与截断）。 */
export function prepareCallResult(
  result: McpCallResult,
  options: PrepareOutputOptions,
): PreparedMcpOutput {
  const content: McpCallContent[] = [];
  const attachments: string[] = [];
  let truncated = false;
  mkdirSync(options.attachmentsDir, { recursive: true });
  for (const item of result.content) {
    if (item.type === 'text') {
      const prepared = truncateText(item.text);
      truncated = truncated || prepared.truncated;
      content.push({ type: 'text', text: prepared.text });
      continue;
    }
    if (item.type === 'image' || item.type === 'audio' || item.type === 'video') {
      const ext = extensionFor(item.mimeType);
      const file = path.join(options.attachmentsDir, `${randomUUID()}.${ext}`);
      writeFileSync(file, Buffer.from(item.data, 'base64'));
      attachments.push(file);
      content.push({
        type: 'text',
        text: `[MCP ${item.type} 附件已保存：${file}（${item.mimeType ?? '未知类型'}）]`,
      });
      continue;
    }
    if (item.type === 'resource') {
      const summary = item.text ? truncateText(item.text) : null;
      if (summary?.truncated) truncated = true;
      content.push({
        type: 'text',
        text: `[MCP resource: ${item.uri}${summary ? `]\n${summary.text}` : ']'}`,
      });
      continue;
    }
    content.push({ type: 'text', text: '[MCP 返回了无法直接展示的内容，详见调用日志]' });
  }
  return { content, truncated, attachments };
}
