import { describe, expect, it } from 'vitest';
import { PI_TOOL_NAME_MAX, sanitizeMcpSegment, shortHash4, toPiToolName } from './tool-naming';

describe('sanitizeMcpSegment（README 8.3.3）', () => {
  it('非法字符（非 [a-zA-Z0-9_]）替换为下划线', () => {
    expect(sanitizeMcpSegment('my-server')).toBe('my_server');
    expect(sanitizeMcpSegment('github.com/api')).toBe('github_com_api');
    expect(sanitizeMcpSegment('read file!')).toBe('read_file_');
  });

  it('中文等非 ASCII 字符逐个替换为下划线', () => {
    expect(sanitizeMcpSegment('中文工具')).toBe('____');
  });

  it('合法字符原样保留', () => {
    expect(sanitizeMcpSegment('read_file_123')).toBe('read_file_123');
  });
});

describe('toPiToolName（README 8.3.3 双下划线命名）', () => {
  it('常规命名：mcp__<serverId>__<toolName>', () => {
    expect(toPiToolName('filesystem', 'read_file')).toBe('mcp__filesystem__read_file');
    expect(toPiToolName('github', 'create_issue')).toBe('mcp__github__create_issue');
  });

  it('serverId / 工具名的非法字符被清理', () => {
    expect(toPiToolName('my-server', 'a b')).toBe('mcp__my_server__a_b');
  });

  it('超长名截断并追加 4 位哈希，总长不超过 64', () => {
    const tool = 'x'.repeat(100);
    const name = toPiToolName('s', tool);
    expect(name.length).toBeLessThanOrEqual(PI_TOOL_NAME_MAX);
    expect(name.startsWith('mcp__s__')).toBe(true);
    expect(name).toMatch(/_[0-9a-f]{4}$/);
  });

  it('同输入结果确定（哈希稳定）', () => {
    const tool = 'very_long_tool_name_'.repeat(5);
    expect(toPiToolName('server', tool)).toBe(toPiToolName('server', tool));
  });
});

describe('shortHash4', () => {
  it('输出 4 位十六进制', () => {
    expect(shortHash4('read_file')).toMatch(/^[0-9a-f]{4}$/);
    expect(shortHash4('')).toMatch(/^[0-9a-f]{4}$/);
  });
});
