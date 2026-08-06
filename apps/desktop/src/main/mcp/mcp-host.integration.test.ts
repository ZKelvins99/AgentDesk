import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpConfigStore } from './mcp-config';
import { McpConnectionManager } from './mcp-manager';
import { McpCallError } from './mcp-types';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'test-fixtures',
  'echo-mcp-server.mjs',
);

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('MCP Host G6 集成（README 8.3.2/8.3.4 场景 5/6 + 超时）', () => {
  let root: string;
  let store: McpConfigStore;
  let manager: McpConnectionManager | null;
  let pidFile: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentdesk-mcp-g6-'));
    store = new McpConfigStore({ configDir: path.join(root, '.agentdesk') });
    pidFile = path.join(root, 'pid');
    manager = null;
  });

  afterEach(async () => {
    await manager?.disposeAll();
    rmSync(root, { recursive: true, force: true });
  });

  it('场景 5：配置本地 stdio MCP → 测试连接（serverInfo/工具数）→ 模型侧工具调用', async () => {
    store.save({
      name: 'echo',
      scope: 'global',
      config: {
        transport: 'stdio',
        command: process.execPath,
        args: [FIXTURE, pidFile],
        startupTimeoutMs: 5_000,
        timeoutMs: 5_000,
      },
    });
    manager = new McpConnectionManager({ store });
    const test = await manager.testConnection('echo');
    expect(test.ok).toBe(true);
    expect(test.serverInfo?.name).toBe('echo-server');
    expect(test.toolCount).toBe(2);

    const result = await manager.callTool({
      server: 'echo',
      tool: 'echo',
      args: { text: 'hello' },
    });
    expect(result.isError).toBe(false);
    expect(result.content[0]).toEqual({ type: 'text', text: 'echo:hello' });
    const entry = manager.callLogs()[0];
    expect(entry?.isError).toBe(false);
    expect(entry?.result).toContain('echo:hello');
  });

  it('场景 6：杀进程 → 红灯（degraded）→ 自动重连（新进程 ready）', async () => {
    store.save({
      name: 'echo',
      scope: 'global',
      config: {
        transport: 'stdio',
        command: process.execPath,
        args: [FIXTURE, pidFile],
        reconnect: { maxRetries: 10, baseDelayMs: 100 },
        startupTimeoutMs: 5_000,
        timeoutMs: 5_000,
      },
    });
    manager = new McpConnectionManager({ store });
    const statuses: Array<string> = [];
    manager.on('status', ({ snapshot }) => statuses.push(snapshot.status));
    const snapshot = await manager.ensureReady('echo');
    expect(snapshot.status).toBe('ready');
    const firstPid = Number(readFileSync(pidFile, 'utf8'));

    try {
      process.kill(firstPid, 'SIGKILL');
    } catch {
      // 进程可能已退出
    }
    await waitFor(() => statuses.includes('degraded'), 5_000, '杀进程后进入 degraded');
    await waitFor(
      () => manager?.getSnapshot('echo')?.status === 'ready',
      10_000,
      '自动重连回 ready',
    );
    const secondPid = Number(readFileSync(pidFile, 'utf8'));
    expect(secondPid).not.toBe(firstPid);
  });

  it('stdio 进程组清理：disposeAll 后直接子进程与孙进程都退出', async () => {
    store.save({
      name: 'echo',
      scope: 'global',
      config: {
        transport: 'stdio',
        command: process.execPath,
        args: [FIXTURE, pidFile],
        env: { MCP_FIXTURE_SPAWN_CHILD: '1' },
        startupTimeoutMs: 5_000,
        timeoutMs: 5_000,
      },
    });
    manager = new McpConnectionManager({
      store,
      defaultWorkspacePath: process.cwd(),
    });
    // 夹具启动后通过环境变量再派生孙进程
    await manager.ensureReady('echo');
    const pid = Number(readFileSync(pidFile, 'utf8'));
    const grandchild = Number(readFileSync(`${pidFile}.child`, 'utf8'));
    expect(alive(pid)).toBe(true);
    expect(alive(grandchild)).toBe(true);
    await manager.disposeAll();
    manager = null;
    await waitFor(() => !alive(pid), 5_000, '直接子进程退出');
    if (process.platform === 'win32') {
      await waitFor(() => !alive(grandchild), 5_000, '孙进程随进程组退出');
    }
  }, 20_000);

  it('MCP 超时不拖死回合：slow 工具 2s、timeoutMs 200ms 快速失败', async () => {
    store.save({
      name: 'echo',
      scope: 'global',
      config: {
        transport: 'stdio',
        command: process.execPath,
        args: [FIXTURE, pidFile],
        startupTimeoutMs: 5_000,
        timeoutMs: 200,
      },
    });
    manager = new McpConnectionManager({ store });
    await manager.ensureReady('echo');
    const start = Date.now();
    await expect(
      manager.callTool({ server: 'echo', tool: 'slow', args: { text: 'x' } }),
    ).rejects.toBeInstanceOf(McpCallError);
    expect(Date.now() - start).toBeLessThan(1_500);
  });
});
