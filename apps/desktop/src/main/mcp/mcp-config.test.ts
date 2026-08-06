import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { McpServerConfig } from '@agentdesk/ipc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  globalMcpFilePath,
  interpolateConfig,
  McpConfigStore,
  workspaceMcpFilePath,
} from './mcp-config';

describe('McpConfigStore（README 8.3.1）', () => {
  let root: string;
  let store: McpConfigStore;
  let ws: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-mcp-'));
    ws = path.join(root, 'ws');
    mkdirSync(ws, { recursive: true });
    store = new McpConfigStore({ configDir: path.join(root, '.agentdesk') });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('全局 CRUD：save / list / remove', () => {
    const cfg: McpServerConfig = {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', `\${workspace}`],
      enabled: true,
    };
    const view = store.save({ name: 'filesystem', scope: 'global', config: cfg });
    expect(view).toEqual({ name: 'filesystem', scope: 'global', config: cfg });

    const listed = store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe('filesystem');
    expect(listed[0]?.config.command).toBe('npx');

    expect(store.remove('filesystem', 'global')).toBe(true);
    expect(store.remove('filesystem', 'global')).toBe(false);
    expect(store.list()).toHaveLength(0);
  });

  it('工作区同名覆盖全局，且各自文件独立', () => {
    store.save({
      name: 'fs',
      scope: 'global',
      config: { transport: 'stdio', command: 'a' },
    });
    store.save({
      name: 'fs',
      scope: 'workspace',
      workspacePath: ws,
      config: { transport: 'http', url: 'https://ws.example.com/mcp' },
    });
    store.save({
      name: 'only-ws',
      scope: 'workspace',
      workspacePath: ws,
      config: { transport: 'sse', url: 'https://sse.example.com/sse' },
    });

    const merged = store.list(ws);
    expect(merged).toHaveLength(2);
    const fsView = merged.find((v) => v.name === 'fs');
    expect(fsView?.scope).toBe('workspace');
    expect(fsView?.config.transport).toBe('http');

    // 全局文件不含 workspace 项
    const globalFile = JSON.parse(
      readFileSync(globalMcpFilePath(path.join(root, '.agentdesk')), 'utf8'),
    ) as { servers: Record<string, unknown> };
    expect(Object.keys(globalFile.servers)).toEqual(['fs']);
    expect(readFileSync(workspaceMcpFilePath(ws), 'utf8').length).toBeGreaterThan(0);
  });

  it('JSONC 容错：行末注释不破坏读取', () => {
    const file = globalMcpFilePath(path.join(root, '.agentdesk'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      '{\n  // 注释\n  "servers": { "a": { "transport": "stdio", "command": "x" } }\n}\n',
      'utf8',
    );
    const listed = store.list();
    expect(listed[0]?.name).toBe('a');
  });

  it('名称校验：非法字符与超长拒绝', () => {
    expect(() =>
      store.save({
        name: 'bad name!',
        scope: 'global',
        config: { transport: 'stdio', command: 'x' },
      }),
    ).toThrow();
    expect(() =>
      store.save({
        name: 'x'.repeat(65),
        scope: 'global',
        config: { transport: 'stdio', command: 'x' },
      }),
    ).toThrow();
  });

  it('导入 Claude Desktop mcpServers：stdio + http 合法，无效项 skipped', () => {
    const res = store.importClaude(
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', `\${workspace}`],
            env: { FOO: 'bar' },
          },
          github: {
            type: 'http',
            url: 'https://api.example.com/mcp',
            headers: { Authorization: `Bearer \${secret:github-mcp}` },
          },
          'bad name!': { command: 'x' },
        },
      }),
      'global',
    );
    expect(res.imported.map((v) => v.name).sort()).toEqual(['filesystem', 'github']);
    expect(res.skipped.map((s) => s.name)).toEqual(['bad name!']);
    const fsView = res.imported.find((v) => v.name === 'filesystem');
    expect(fsView?.config.transport).toBe('stdio');
    expect(fsView?.config.env).toEqual({ FOO: 'bar' });
    const ghView = res.imported.find((v) => v.name === 'github');
    expect(ghView?.config.transport).toBe('http');
    expect(ghView?.config.headers?.Authorization).toContain(`\${secret:github-mcp}`);
  });

  it('导入非 Claude 格式报错', () => {
    expect(() => store.importClaude('{"nope": 1}', 'global')).toThrow();
    expect(() => store.importClaude('not json', 'global')).toThrow();
  });

  it('变量插值：workspace / home / env / secret，未知变量保留占位', () => {
    const cfg: McpServerConfig = {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'pkg', `\${workspace}`],
      env: {
        HOME_DIR: `\${home}`,
        TOKEN: `\${env:MCP_TEST_TOKEN}`,
        SECRET: `\${secret:github-mcp}`,
      },
    };
    const out = interpolateConfig(cfg, {
      workspace: ws,
      home: '/home/tester',
      env: { MCP_TEST_TOKEN: 'tok123' },
      resolveSecret: (id) => (id === 'github-mcp' ? 'gh-secret' : null),
    });
    expect(out.args).toEqual(['-y', 'pkg', ws]);
    expect(out.env?.HOME_DIR).toBe('/home/tester');
    expect(out.env?.TOKEN).toBe('tok123');
    expect(out.env?.SECRET).toBe('gh-secret');
    const unknown = interpolateConfig(cfg, { workspace: ws });
    expect(unknown.env?.SECRET).toBe(`\${secret:github-mcp}`);
  });

  it('保存后重读保留未知字段（passthrough）', () => {
    const cfg = {
      transport: 'stdio',
      command: 'x',
      customField: { nested: 1 },
    } as McpServerConfig;
    store.save({ name: 'srv', scope: 'global', config: cfg });
    const listed = store.list();
    expect(listed[0]?.config.customField).toEqual({ nested: 1 });
  });

  it('exportJson 输出 AgentDesk mcp.json 格式（合并全局+工作区）', () => {
    store.save({
      name: 'global-srv',
      scope: 'global',
      config: { transport: 'stdio', command: 'a' },
    });
    store.save({
      name: 'ws-srv',
      scope: 'workspace',
      workspacePath: ws,
      config: { transport: 'http', url: 'https://example.com/mcp' },
    });
    const parsed = JSON.parse(store.exportJson(ws)) as {
      version: number;
      servers: Record<string, McpServerConfig>;
    };
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.servers).sort()).toEqual(['global-srv', 'ws-srv']);
    expect(parsed.servers['ws-srv']?.transport).toBe('http');
  });
});
