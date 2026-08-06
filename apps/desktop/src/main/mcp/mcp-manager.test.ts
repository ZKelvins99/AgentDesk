import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { McpServerConfig } from '@agentdesk/ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpConfigStore } from './mcp-config';
import { McpConnectionManager } from './mcp-manager';
import type { McpCallResult, McpClientLike, McpServerInfo, McpToolInfo } from './mcp-types';
import { McpCallError, McpServerConnectError } from './mcp-types';

interface FakeBehavior {
  failConnect?: string;
  tools?: McpToolInfo[];
  timeoutTool?: string;
  serverInfo?: McpServerInfo | null;
}

class FakeMcpClient implements McpClientLike {
  static all: FakeMcpClient[] = [];
  connectCalls = 0;
  closed = false;
  private toolsChanged: (() => void) | null = null;
  private disconnectHandler: (() => void) | null = null;

  constructor(
    readonly config: McpServerConfig,
    readonly behavior: FakeBehavior,
  ) {
    FakeMcpClient.all.push(this);
  }

  setToolsChangedHandler(handler: (() => void) | null): void {
    this.toolsChanged = handler;
  }

  setDisconnectHandler(handler: (() => void) | null): void {
    this.disconnectHandler = handler;
  }

  getServerInfo(): McpServerInfo | null {
    return this.behavior.serverInfo ?? { name: 'fake', version: '1.0.0' };
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.behavior.failConnect) throw new Error(this.behavior.failConnect);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async listTools(): Promise<{ tools: McpToolInfo[] }> {
    return {
      tools: this.behavior.tools ?? [{ name: 'read_file', inputSchema: { type: 'object' } }],
    };
  }

  async callTool(
    tool: string,
    _args: Record<string, unknown>,
    _options: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<McpCallResult> {
    if (this.behavior.timeoutTool === tool) throw new McpCallError('timeout', 'timeout');
    return { isError: false, content: [{ type: 'text', text: `ok:${tool}` }], raw: {} };
  }

  triggerToolsChanged(): void {
    this.toolsChanged?.();
  }

  triggerDisconnect(): void {
    this.disconnectHandler?.();
  }
}

function tool(name: string): McpToolInfo {
  return { name, inputSchema: { type: 'object', properties: {} } };
}

function stdioConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return { transport: 'stdio', command: 'fs', ...overrides };
}

describe('McpConnectionManager（README 8.3.2 连接管理）', () => {
  let root: string;
  let store: McpConfigStore;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeMcpClient.all = [];
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-mcp-mgr-'));
    store = new McpConfigStore({ configDir: path.join(root, '.agentdesk') });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  });

  function makeManager(behaviorByCommand: Record<string, FakeBehavior>): McpConnectionManager {
    return new McpConnectionManager({
      store,
      clientFactory: (config) =>
        new FakeMcpClient(config, behaviorByCommand[config.command ?? ''] ?? {}),
    });
  }

  it('懒连接：ensureReady → ready，工具发现并命名（mcp__server__tool）', async () => {
    store.save({
      name: 'fs',
      scope: 'global',
      config: stdioConfig({ args: [`\${workspace}`] }),
    });
    const manager = makeManager({ fs: { tools: [tool('read_file'), tool('write_file')] } });
    const snapshot = await manager.ensureReady('fs');
    expect(snapshot.status).toBe('ready');
    expect(snapshot.tools.map((t) => t.piName)).toEqual([
      'mcp__fs__read_file',
      'mcp__fs__write_file',
    ]);
    expect(snapshot.serverInfo?.name).toBe('fake');
    const client = FakeMcpClient.all[0];
    expect(client?.connectCalls).toBe(1);
    await manager.ensureReady('fs');
    expect(client?.connectCalls).toBe(1);
    await manager.disposeAll();
  });

  it('并发 ensureReady 只连接一次', async () => {
    store.save({ name: 'fs', scope: 'global', config: stdioConfig() });
    const manager = makeManager({ fs: {} });
    const [a, b] = await Promise.all([manager.ensureReady('fs'), manager.ensureReady('fs')]);
    expect(a.status).toBe('ready');
    expect(b.status).toBe('ready');
    expect(FakeMcpClient.all[0]?.connectCalls).toBe(1);
    await manager.disposeAll();
  });

  it('未知 server / enabled:false → McpServerConnectError', async () => {
    store.save({ name: 'fs', scope: 'global', config: stdioConfig({ enabled: false }) });
    const manager = makeManager({});
    await expect(manager.ensureReady('nope')).rejects.toThrow(McpServerConnectError);
    await expect(manager.ensureReady('fs')).rejects.toThrow(/已禁用/);
    await manager.disposeAll();
  });

  it('连接失败：抛错且重试耗尽后 failed', async () => {
    store.save({
      name: 'fs',
      scope: 'global',
      config: stdioConfig({ reconnect: { maxRetries: 1, baseDelayMs: 100 } }),
    });
    const manager = makeManager({ fs: { failConnect: 'boom' } });
    await expect(manager.ensureReady('fs')).rejects.toThrow(McpServerConnectError);
    expect(manager.getSnapshot('fs')?.status).toBe('failed');
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.getSnapshot('fs')?.status).toBe('failed');
    expect(manager.getSnapshot('fs')?.lastError).toContain('上限');
    await manager.disposeAll();
  });

  it('意外断开：degraded → 退避重连（一次失败）→ ready', async () => {
    store.save({
      name: 'fs',
      scope: 'global',
      config: stdioConfig({ reconnect: { maxRetries: 3, baseDelayMs: 100 } }),
    });
    let connectNumber = 0;
    const manager = new McpConnectionManager({
      store,
      clientFactory: (config) => {
        connectNumber += 1;
        return new FakeMcpClient(config, connectNumber === 2 ? { failConnect: 'down' } : {});
      },
    });
    await manager.ensureReady('fs');
    expect(manager.getSnapshot('fs')?.status).toBe('ready');

    const statuses: string[] = [];
    manager.on('status', ({ snapshot }) => statuses.push(snapshot.status));

    FakeMcpClient.all[0]?.triggerDisconnect();
    expect(manager.getSnapshot('fs')?.status).toBe('degraded');
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.getSnapshot('fs')?.status).toBe('failed');
    await vi.advanceTimersByTimeAsync(200);
    expect(manager.getSnapshot('fs')?.status).toBe('ready');
    expect(FakeMcpClient.all.length).toBe(3);
    expect(statuses).toEqual([
      'degraded',
      'degraded',
      'connecting',
      'failed',
      'failed',
      'connecting',
      'ready',
    ]);
    await manager.disposeAll();
  });

  it('重连次数耗尽 → failed', async () => {
    store.save({
      name: 'fs',
      scope: 'global',
      config: stdioConfig({ reconnect: { maxRetries: 1, baseDelayMs: 100 } }),
    });
    let connectNumber = 0;
    const manager = new McpConnectionManager({
      store,
      clientFactory: (config) => {
        connectNumber += 1;
        return new FakeMcpClient(config, connectNumber >= 2 ? { failConnect: 'down' } : {});
      },
    });
    await manager.ensureReady('fs');
    FakeMcpClient.all[0]?.triggerDisconnect();
    expect(manager.getSnapshot('fs')?.status).toBe('degraded');
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.getSnapshot('fs')?.status).toBe('failed');
    expect(manager.getSnapshot('fs')?.lastError).toContain('上限');
    await manager.disposeAll();
  });

  it('toolFilter deny / autoApprove 生效', async () => {
    store.save({
      name: 'fs',
      scope: 'global',
      config: stdioConfig({
        toolFilter: { deny: ['write_*'] },
        autoApprove: ['read_*'],
      }),
    });
    const manager = makeManager({
      fs: { tools: [tool('read_file'), tool('write_file'), tool('list')] },
    });
    const snapshot = await manager.ensureReady('fs');
    const byName = new Map(snapshot.tools.map((t) => [t.name, t]));
    expect(byName.get('read_file')?.enabled).toBe(true);
    expect(byName.get('read_file')?.autoApprove).toBe(true);
    expect(byName.get('write_file')?.enabled).toBe(false);
    expect(byName.get('list')?.enabled).toBe(true);
    expect(byName.get('list')?.autoApprove).toBe(false);
    await manager.disposeAll();
  });

  it('callTool：懒连接调用 / 禁用工具拒绝', async () => {
    store.save({
      name: 'fs',
      scope: 'global',
      config: stdioConfig({ toolFilter: { deny: ['write_*'] } }),
    });
    const manager = makeManager({ fs: { tools: [tool('read_file'), tool('write_file')] } });
    const result = await manager.callTool({ server: 'fs', tool: 'read_file', args: {} });
    expect(result.content[0]?.type).toBe('text');
    expect(FakeMcpClient.all[0]?.connectCalls).toBe(1);
    await expect(manager.callTool({ server: 'fs', tool: 'write_file', args: {} })).rejects.toThrow(
      /已被禁用/,
    );
    await manager.disposeAll();
  });

  it('callTool 超时 → McpCallError timeout', async () => {
    store.save({
      name: 'slow',
      scope: 'global',
      config: stdioConfig({ command: 'slow' }),
    });
    const manager = makeManager({ slow: { tools: [tool('ping')], timeoutTool: 'ping' } });
    await expect(
      manager.callTool({ server: 'slow', tool: 'ping', args: {} }, { timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: 'timeout' });
    await manager.disposeAll();
  });

  it('testConnection：成功返回 serverInfo 与工具数；失败返回错误', async () => {
    store.save({ name: 'fs', scope: 'global', config: stdioConfig() });
    const manager = makeManager({
      fs: { tools: [tool('a'), tool('b')] },
      bad: { failConnect: 'cannot spawn' },
    });
    const ok = await manager.testConnection('fs');
    expect(ok.ok).toBe(true);
    expect(ok.toolCount).toBe(2);
    expect(ok.serverInfo?.name).toBe('fake');
    expect(ok.error).toBeNull();

    store.save({ name: 'bad', scope: 'global', config: stdioConfig({ command: 'bad' }) });
    const bad = await manager.testConnection('bad');
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('cannot spawn');
    await manager.disposeAll();
  });

  it('tools/list_changed → 重新发现并广播 tools 事件', async () => {
    store.save({ name: 'fs', scope: 'global', config: stdioConfig() });
    const current: McpToolInfo[] = [tool('a')];
    const manager = new McpConnectionManager({
      store,
      clientFactory: () => new FakeMcpClient(stdioConfig(), { tools: current }),
    });
    const listener = vi.fn();
    manager.on('tools', listener);
    await manager.ensureReady('fs');
    expect(manager.getSnapshot('fs')?.tools.map((t) => t.name)).toEqual(['a']);
    listener.mockClear();
    current.push(tool('b'));
    FakeMcpClient.all[0]?.triggerToolsChanged();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(manager.getSnapshot('fs')?.tools.map((t) => t.name)).toEqual(['a', 'b']);
    expect(listener).toHaveBeenCalledTimes(1);
    await manager.disposeAll();
  });

  it('disconnect 后状态 disconnected 且客户端已关闭', async () => {
    store.save({
      name: 'fs',
      scope: 'global',
      config: stdioConfig({ reconnect: { maxRetries: 5, baseDelayMs: 100 } }),
    });
    const manager = makeManager({ fs: {} });
    await manager.ensureReady('fs');
    await manager.disconnect('fs');
    expect(manager.getSnapshot('fs')?.status).toBe('disconnected');
    expect(FakeMcpClient.all[0]?.closed).toBe(true);
    await manager.disposeAll();
  });

  it('listSnapshots 覆盖全部已配置 server', async () => {
    store.save({ name: 'fs', scope: 'global', config: stdioConfig() });
    store.save({
      name: 'github',
      scope: 'global',
      config: { transport: 'http', url: 'https://example.com/mcp' },
    });
    const manager = makeManager({});
    const snapshots = manager.listSnapshots();
    expect(snapshots.map((s) => s.name).sort()).toEqual(['fs', 'github']);
    expect(snapshots.every((s) => s.status === 'disconnected')).toBe(true);
    await manager.disposeAll();
  });

  it('callTool 记录调用日志（参数脱敏/时长/结果摘要）', async () => {
    store.save({ name: 'fs', scope: 'global', config: stdioConfig() });
    const manager = makeManager({ fs: {} });
    await manager.ensureReady('fs');
    await manager.callTool({
      server: 'fs',
      tool: 'read_file',
      args: { path: '/tmp/a', token: 'secret-1' },
    });
    const logs = manager.callLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.server).toBe('fs');
    expect(logs[0]?.tool).toBe('read_file');
    expect(logs[0]?.isError).toBe(false);
    expect(logs[0]?.args).toEqual({ path: '/tmp/a', token: '***' });
    expect(logs[0]?.result).toContain('ok:read_file');
    expect(typeof logs[0]?.durationMs).toBe('number');
    await manager.disposeAll();
  });

  it('callTool 失败同样入日志（isError + error）', async () => {
    store.save({
      name: 'fs',
      scope: 'global',
      config: stdioConfig({ toolFilter: { deny: ['read_file'] } }),
    });
    const manager = makeManager({ fs: {} });
    await expect(manager.callTool({ server: 'fs', tool: 'read_file', args: {} })).rejects.toThrow(
      McpCallError,
    );
    const entry = manager.callLogs().pop();
    expect(entry?.isError).toBe(true);
    expect(entry?.error).toContain('被禁用');
    await manager.disposeAll();
  });

  it('invalidate 后按新配置重建连接（工具开关生效）', async () => {
    store.save({ name: 'fs', scope: 'global', config: stdioConfig() });
    const manager = makeManager({ fs: {} });
    await manager.ensureReady('fs');
    expect(FakeMcpClient.all).toHaveLength(1);
    store.save({
      name: 'fs',
      scope: 'global',
      config: stdioConfig({ toolFilter: { deny: ['read_file'] } }),
    });
    await manager.invalidate('fs');
    expect(FakeMcpClient.all[0]?.closed).toBe(true);
    const snapshot = await manager.ensureReady('fs');
    expect(snapshot.status).toBe('ready');
    expect(snapshot.tools[0]?.enabled).toBe(false);
    expect(FakeMcpClient.all).toHaveLength(2);
    await manager.disposeAll();
  });

  it('markToolConflict 将工具标红并发出 status 事件', async () => {
    store.save({ name: 'fs', scope: 'global', config: stdioConfig() });
    const manager = makeManager({ fs: {} });
    const listener = vi.fn();
    manager.on('status', listener);
    await manager.ensureReady('fs');
    listener.mockClear();
    manager.markToolConflict('fs', 'read_file', true);
    expect(manager.getSnapshot('fs')?.tools[0]?.conflict).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    manager.markToolConflict('fs', 'read_file', false);
    expect(manager.getSnapshot('fs')?.tools[0]?.conflict).toBeUndefined();
    await manager.disposeAll();
  });
});
