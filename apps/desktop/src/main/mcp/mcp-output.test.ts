import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KEEP_HEAD_TAIL_CHARS, MAX_TEXT_CHARS, prepareCallResult } from './mcp-output';
import type { McpCallResult } from './mcp-types';

describe('prepareCallResult（README 8.3.4 输出整理）', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentdesk-mcp-out-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('短文本原样返回', () => {
    const result: McpCallResult = {
      isError: false,
      content: [{ type: 'text', text: 'hello' }],
      raw: {},
    };
    const out = prepareCallResult(result, { attachmentsDir: dir });
    expect(out.content).toEqual([{ type: 'text', text: 'hello' }]);
    expect(out.truncated).toBe(false);
    expect(out.attachments).toEqual([]);
  });

  it('超长文本保留头尾并标记 truncated', () => {
    const long = 'x'.repeat(MAX_TEXT_CHARS + 100);
    const result: McpCallResult = {
      isError: false,
      content: [{ type: 'text', text: long }],
      raw: {},
    };
    const out = prepareCallResult(result, { attachmentsDir: dir });
    expect(out.truncated).toBe(true);
    expect(out.content[0]?.type).toBe('text');
    const text = (out.content[0] as { text: string }).text;
    expect(text.startsWith('x'.repeat(KEEP_HEAD_TAIL_CHARS))).toBe(true);
    expect(text.endsWith('x'.repeat(KEEP_HEAD_TAIL_CHARS))).toBe(true);
    expect(text).toContain('输出过长已截断');
  });

  it('image 落盘为附件并降级为文本占位', () => {
    const base64 = Buffer.from([1, 2, 3, 4]).toString('base64');
    const result: McpCallResult = {
      isError: false,
      content: [{ type: 'image', data: base64, mimeType: 'image/png' }],
      raw: {},
    };
    const out = prepareCallResult(result, { attachmentsDir: dir });
    expect(out.attachments).toHaveLength(1);
    expect(readFileSync(out.attachments[0] ?? '')).toEqual(Buffer.from([1, 2, 3, 4]));
    const text = out.content[0];
    expect(text?.type).toBe('text');
    expect(text && 'text' in text && text.text).toContain('附件已保存');
  });

  it('resource 摘要为文本 + uri 引用', () => {
    const result: McpCallResult = {
      isError: false,
      content: [{ type: 'resource', uri: 'file:///a.txt', text: '内容摘要' }],
      raw: {},
    };
    const out = prepareCallResult(result, { attachmentsDir: dir });
    const text = out.content[0];
    expect(text && 'text' in text && text.text).toContain('file:///a.txt');
    expect(text && 'text' in text && text.text).toContain('内容摘要');
  });

  it('未知内容类型 → 占位文本', () => {
    const result: McpCallResult = {
      isError: false,
      content: [{ type: 'other', raw: {} }],
      raw: {},
    };
    const out = prepareCallResult(result, { attachmentsDir: dir });
    expect(out.content[0]?.type).toBe('text');
  });
});
