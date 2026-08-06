import { describe, expect, it } from 'vitest';
import { maskArgs, maskSensitiveValue, summarizeResult } from './mcp-call-log';

describe('mcp-call-log（README 8.3.6 调用日志脱敏/摘要）', () => {
  it('maskSensitiveValue 脱敏敏感键并保留结构', () => {
    const masked = maskSensitiveValue({
      path: '/tmp/a',
      headers: { Authorization: 'Bearer x' },
      nested: { apiKey: 'k', normal: 1 },
      list: [{ token: 't' }],
    });
    expect(masked).toEqual({
      path: '/tmp/a',
      headers: { Authorization: '***' },
      nested: { apiKey: '***', normal: 1 },
      list: [{ token: '***' }],
    });
  });

  it('maskArgs 超长时降级为截断预览', () => {
    const masked = maskArgs({ big: 'x'.repeat(3_000) });
    expect((masked as { __truncated__?: boolean }).__truncated__).toBe(true);
    expect(String((masked as { preview?: string }).preview ?? '').length).toBeLessThan(2_100);
  });

  it('summarizeResult 汇总 text / image / resource', () => {
    const summary = summarizeResult({
      isError: false,
      content: [
        { type: 'text', text: 'hello '.repeat(100) },
        { type: 'image', data: 'abc', mimeType: 'image/png' },
        { type: 'resource', uri: 'file:///x', text: 't' },
      ],
      raw: {},
    });
    expect(summary).toContain('image/png');
    expect(summary).toContain('resource:file:///x');
    expect(summary.length).toBeLessThan(800);
  });
});
