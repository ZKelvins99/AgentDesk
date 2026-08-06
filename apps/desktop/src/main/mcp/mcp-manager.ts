/**
 * MCP 连接管理器（README 8.3.2）：懒连接 + 健康状态机 + 指数退避重连 + 工具发现缓存。
 * 状态机：disconnected → connecting → ready；断开后 degraded → 退避重连；
 * 重试耗尽或首次连接失败 → failed。工具热更新（tools/list_changed）→ 重新发现并广播。
 */
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import type { McpServerConfig, McpServerView } from '@agentdesk/ipc';
import { type McpCallLogEntry, maskArgs, summarizeResult } from './mcp-call-log';
import { interpolateConfig, type McpConfigStore } from './mcp-config';
import { SdkMcpClient } from './mcp-sdk';
import type {
  McpCallOptions,
  McpCallRequest,
  McpCallResult,
  McpClientFactory,
  McpClientLike,
  McpServerDiscovery,
  McpServerInfo,
  McpServerSnapshot,
  McpToolView,
} from './mcp-types';
import { McpCallError, McpServerConnectError } from './mcp-types';
import { toPiToolName } from './tool-naming';

export interface McpManagerOptions {
  store: McpConfigStore;
  /** 测试注入 fake client；默认使用 SdkMcpClient。 */
  clientFactory?: McpClientFactory;
  /** ${secret:<id>} 插值（safeStorage，绝不写明文）。 */
  resolveSecret?: (id: string) => string | null;
  defaultWorkspacePath?: string;
}

interface ResolvedServer {
  view: McpServerView;
  config: McpServerConfig;
  workspacePath?: string;
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1_000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 通配符匹配：`*` 匹配任意序列（README 8.3.1 toolFilter.allow/deny）。 */
export function wildcardMatch(name: string, pattern: string): boolean {
  const re = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`);
  return re.test(name);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class McpConnectionManager extends EventEmitter {
  private readonly options: McpManagerOptions;
  private readonly resolved = new Map<string, ResolvedServer>();
  private readonly clients = new Map<string, McpClientLike>();
  private readonly snapshots = new Map<string, McpServerSnapshot>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly settles = new Map<string, { promise: Promise<void>; resolve: () => void }>();
  private readonly disconnecting = new Set<string>();
  private readonly logBuffer: McpCallLogEntry[] = [];
  private logSeq = 0;
  private closed = false;

  constructor(options: McpManagerOptions) {
    super();
    this.options = options;
  }

  /** 当前所有已配置 server 的快照（未连接的初始化为 disconnected）。 */
  listSnapshots(workspacePath?: string): McpServerSnapshot[] {
    const views = this.options.store.list(workspacePath);
    return views.map((view) => {
      let snapshot = this.snapshots.get(view.name);
      if (!snapshot) {
        snapshot = this.newSnapshot(view.name);
        this.snapshots.set(view.name, snapshot);
      }
      return snapshot;
    });
  }

  getSnapshot(name: string): McpServerSnapshot | undefined {
    return this.snapshots.get(name);
  }

  /** 懒连接：确保 server ready 后返回快照（README 8.3.2）。 */
  async ensureReady(name: string, workspacePath?: string): Promise<McpServerSnapshot> {
    const resolved = this.resolveServer(name, workspacePath);
    for (let i = 0; i < 10; i += 1) {
      const snapshot = this.snapshots.get(name);
      const wasReady = snapshot?.status === 'ready' || snapshot?.status === 'degraded';
      if (snapshot?.status === 'ready') return snapshot;
      const pending = this.inFlight.get(name);
      if (pending) {
        await pending;
        continue;
      }
      if (snapshot?.status === 'connecting') {
        await this.waitForSettle(name);
        continue;
      }
      // 用户主动触发连接时，接管尚未执行的重连定时器
      const timer = this.reconnectTimers.get(name);
      if (timer) {
        clearTimeout(timer);
        this.reconnectTimers.delete(name);
      }
      const promise = this.connectServer(name, resolved, wasReady);
      this.inFlight.set(name, promise);
      try {
        await promise;
      } finally {
        this.inFlight.delete(name);
      }
      return this.requireSnapshot(name);
    }
    return this.requireSnapshot(name);
  }

  /** 强制断开（UI 停止 / 清理）。 */
  async disconnect(name: string): Promise<void> {
    const timer = this.reconnectTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(name);
    }
    const client = this.clients.get(name);
    if (client) {
      this.disconnecting.add(name);
      try {
        await client.close();
      } catch {
        // 忽略关闭错误
      } finally {
        this.disconnecting.delete(name);
        this.clients.delete(name);
      }
    }
    this.setStatus(name, {
      status: 'disconnected',
      lastError: null,
      serverInfo: null,
      connectedAt: null,
      reconnectAttempts: 0,
    });
  }

  /** 断开所有连接（应用退出）。 */
  async disposeAll(): Promise<void> {
    this.closed = true;
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.reconnectTimers.clear();
    await Promise.all(
      [...this.clients.keys()].map((name) => this.disconnect(name).catch(() => {})),
    );
    this.clients.clear();
  }

  /** 配置变更后使缓存的连接/快照失效，下一次使用按新配置重建（README 8.3.6 按工具开关与免审批）。 */
  async invalidate(name?: string): Promise<void> {
    const names = new Set<string>([
      ...this.clients.keys(),
      ...this.resolved.keys(),
      ...this.snapshots.keys(),
    ]);
    if (name) {
      if (!names.has(name)) return;
      names.clear();
      names.add(name);
    }
    const closing: Array<Promise<void>> = [];
    for (const n of names) {
      const timer = this.reconnectTimers.get(n);
      if (timer) {
        clearTimeout(timer);
        this.reconnectTimers.delete(n);
      }
      this.resolved.delete(n);
      this.snapshots.delete(n);
      const client = this.clients.get(n);
      if (client) {
        this.disconnecting.add(n);
        closing.push(
          client
            .close()
            .catch(() => {})
            .finally(() => {
              this.disconnecting.delete(n);
              if (this.clients.get(n) === client) this.clients.delete(n);
            }),
        );
      }
    }
    await Promise.all(closing);
  }

  /** 测试连接：强制重连一次并返回握手结果（README 8.3.6）。 */
  async testConnection(
    name: string,
    workspacePath?: string,
  ): Promise<{
    ok: boolean;
    serverInfo: McpServerInfo | null;
    toolCount: number;
    latencyMs: number;
    error: string | null;
  }> {
    const start = Date.now();
    await this.disconnect(name);
    try {
      const snapshot = await this.ensureReady(name, workspacePath);
      return {
        ok: true,
        serverInfo: snapshot.serverInfo,
        toolCount: snapshot.tools.length,
        latencyMs: Date.now() - start,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        serverInfo: null,
        toolCount: 0,
        latencyMs: Date.now() - start,
        error: errorMessage(error),
      };
    }
  }

  /** 最近 N 次调用日志（默认 20，上限 100，README 8.3.6）。 */
  callLogs(limit = 20): McpCallLogEntry[] {
    const count = Math.max(1, Math.min(limit, 100));
    return this.logBuffer.slice(-count);
  }

  /** 命名冲突让位：pi 侧上报重名后把该工具标红（README 8.3.3）。 */
  markToolConflict(server: string, toolName: string, conflict: boolean): void {
    const snapshot = this.snapshots.get(server);
    const view = snapshot?.tools.find((t) => t.name === toolName);
    if (!snapshot || !view) return;
    if (conflict) view.conflict = true;
    else delete view.conflict;
    this.emit('status', { name: server, snapshot });
  }

  /** 工具清单（uplink GET /mcp/tools 数据源）。 */
  async listTools(name: string, workspacePath?: string): Promise<McpToolView[]> {
    const snapshot = await this.ensureReady(name, workspacePath);
    return snapshot.tools;
  }

  /** 聚合发现：并行连接各 server 并返回工具清单（uplink GET /mcp/tools 数据源）。 */
  async discoverTools(workspacePath?: string): Promise<McpServerDiscovery[]> {
    const views = this.options.store.list(workspacePath);
    const results = await Promise.all(
      views.map(async (view): Promise<McpServerDiscovery> => {
        const entry: McpServerDiscovery = {
          name: view.name,
          status: 'disconnected',
          error: null,
          tools: [],
        };
        if (view.config.enabled === false) {
          entry.error = 'server 已禁用';
          return entry;
        }
        let resolved: ResolvedServer;
        try {
          resolved = this.resolveServer(view.name, workspacePath);
        } catch (error) {
          entry.status = 'failed';
          entry.error = errorMessage(error);
          return entry;
        }
        const startupTimeoutMs = resolved.config.startupTimeoutMs ?? 15_000;
        try {
          const snapshot = await withTimeout(
            this.ensureReady(view.name, workspacePath),
            startupTimeoutMs,
            `MCP server ${view.name} 连接超时（${startupTimeoutMs}ms）`,
          );
          entry.status = snapshot.status;
          entry.tools = snapshot.tools;
          entry.error = snapshot.lastError;
        } catch (error) {
          entry.status = 'failed';
          entry.error = errorMessage(error);
        }
        return entry;
      }),
    );
    return results;
  }

  /** 重新发现工具（tools/list_changed 热更新，README 8.3.2）。 */
  async refreshTools(name: string): Promise<McpToolView[]> {
    const client = this.clients.get(name);
    const resolved = this.resolved.get(name);
    if (!client || !resolved) return [];
    const { tools } = await client.listTools();
    const views = tools.map((tool) => this.toToolView(resolved, tool));
    const snapshot = this.snapshots.get(name);
    if (snapshot) snapshot.tools = views;
    this.emit('tools', { name, tools: views });
    return views;
  }

  /** 调用链路入口（README 8.3.4）：ensureReady → 工具开关校验 → callTool。 */
  async callTool(request: McpCallRequest, options: McpCallOptions = {}): Promise<McpCallResult> {
    const startedAt = Date.now();
    let isError = false;
    let errorText: string | null = null;
    let resultSummary: unknown = null;
    try {
      const workspacePath = options.workspacePath ?? this.options.defaultWorkspacePath;
      const snapshot = await this.ensureReady(request.server, workspacePath);
      const view = snapshot.tools.find(
        (tool) => tool.name === request.tool || tool.piName === request.tool,
      );
      if (!view) {
        throw new McpCallError(
          'unavailable',
          `MCP 工具 ${request.tool} 不存在于 server ${request.server}`,
        );
      }
      if (!view.enabled) {
        throw new McpCallError('unavailable', `MCP 工具 ${request.tool} 已被禁用`);
      }
      const client = this.clients.get(request.server);
      if (!client) {
        throw new McpCallError('unavailable', `MCP server ${request.server} 未连接`);
      }
      const resolved = this.resolved.get(request.server);
      const timeoutMs = options.timeoutMs ?? resolved?.config.timeoutMs ?? 30_000;
      const result = await client.callTool(view.name, request.args, {
        timeoutMs,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });
      resultSummary = summarizeResult(result);
      return result;
    } catch (error) {
      isError = true;
      errorText = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.pushCallLog({
        server: request.server,
        tool: request.tool,
        args: maskArgs(request.args),
        isError,
        error: errorText,
        durationMs: Date.now() - startedAt,
        result: resultSummary,
      });
    }
  }

  private pushCallLog(entry: Omit<McpCallLogEntry, 'id' | 'at'>): void {
    this.logSeq += 1;
    this.logBuffer.push({ ...entry, id: this.logSeq, at: Date.now() });
    if (this.logBuffer.length > 100) this.logBuffer.shift();
  }

  private resolveServer(name: string, workspacePath?: string): ResolvedServer {
    const cached = this.resolved.get(name);
    if (cached && cached.workspacePath === workspacePath) return cached;
    const view = this.options.store.list(workspacePath).find((item) => item.name === name);
    if (!view) {
      throw new McpServerConnectError(name, `MCP server ${name} 不存在`);
    }
    if (view.config.enabled === false) {
      throw new McpServerConnectError(name, `MCP server ${name} 已禁用`);
    }
    const resolved: ResolvedServer = {
      view,
      config: interpolateConfig(view.config, {
        workspace: workspacePath ?? this.options.defaultWorkspacePath ?? process.cwd(),
        home: homedir(),
        env: process.env,
        ...(this.options.resolveSecret !== undefined
          ? { resolveSecret: this.options.resolveSecret }
          : {}),
      }),
      ...(workspacePath !== undefined ? { workspacePath } : {}),
    };
    this.resolved.set(name, resolved);
    return resolved;
  }

  private async connectServer(
    name: string,
    resolved: ResolvedServer,
    wasReady: boolean,
  ): Promise<void> {
    let resolveSettle: () => void = () => {};
    const settlePromise = new Promise<void>((resolve) => {
      resolveSettle = resolve;
    });
    this.settles.set(name, { promise: settlePromise, resolve: resolveSettle });

    this.setStatus(name, {
      status: 'connecting',
      lastError: wasReady ? '连接中断，准备重连' : null,
      serverInfo: null,
    });
    let client: McpClientLike;
    try {
      client = this.options.clientFactory
        ? this.options.clientFactory(resolved.config)
        : new SdkMcpClient({ config: resolved.config });
      client.setDisconnectHandler(() => this.handleUnexpectedClose(name));
      client.setToolsChangedHandler(() => {
        void this.refreshTools(name).catch(() => {});
      });
      this.clients.set(name, client);
      await client.connect();
      const tools = await this.refreshTools(name);
      const snapshot = this.snapshots.get(name);
      const serverInfo = client.getServerInfo();
      this.setStatus(name, {
        status: 'ready',
        lastError: null,
        serverInfo,
        connectedAt: Date.now(),
        reconnectAttempts: 0,
        tools,
      });
      if (snapshot?.status === 'failed') {
        this.emit('reconnected', { name });
      }
    } catch (error) {
      const existing = this.clients.get(name);
      if (existing) {
        this.disconnecting.add(name);
        this.clients.delete(name);
        try {
          await existing.close();
        } catch {
          // 忽略
        } finally {
          this.disconnecting.delete(name);
        }
      }
      const message = errorMessage(error);
      this.setStatus(name, {
        status: 'failed',
        lastError: message,
        serverInfo: null,
      });
      this.scheduleReconnect(name, wasReady);
      this.settles.get(name)?.resolve();
      this.settles.delete(name);
      throw new McpServerConnectError(name, message);
    }
    this.settles.get(name)?.resolve();
    this.settles.delete(name);
  }

  private scheduleReconnect(name: string, wasReady: boolean): void {
    if (this.closed) return;
    const resolved = this.resolved.get(name);
    if (!resolved) return;
    if (this.reconnectTimers.has(name)) return;
    const snapshot = this.snapshots.get(name);
    const attempts = (snapshot?.reconnectAttempts ?? 0) + 1;
    const maxRetries = resolved.config.reconnect?.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (attempts > maxRetries) {
      this.setStatus(name, {
        status: 'failed',
        lastError: wasReady ? '连接中断，重试次数已达上限' : '连接失败，重试次数已达上限',
      });
      return;
    }
    const baseDelayMs = resolved.config.reconnect?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    const delay = Math.min(baseDelayMs * 2 ** (attempts - 1), MAX_RECONNECT_DELAY_MS);
    // 退避等待期保持 degraded/failed，实际重试开始时（retryConnect → connectServer）才转 connecting
    this.setStatus(name, {
      lastError: wasReady
        ? `连接中断，${delay}ms 后重连（第 ${attempts} 次）`
        : `连接失败，${delay}ms 后重试（第 ${attempts} 次）`,
      reconnectAttempts: attempts,
    });
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(name);
      void this.retryConnect(name);
    }, delay);
    timer.unref?.();
    this.reconnectTimers.set(name, timer);
  }

  private async retryConnect(name: string): Promise<void> {
    if (this.closed) return;
    const resolved = this.resolved.get(name);
    if (!resolved) return;
    const existing = this.clients.get(name);
    if (existing) {
      this.disconnecting.add(name);
      try {
        await existing.close();
      } catch {
        // 忽略
      } finally {
        this.disconnecting.delete(name);
        this.clients.delete(name);
      }
    }
    const snapshot = this.snapshots.get(name);
    const wasReady = snapshot?.status === 'ready' || snapshot?.status === 'degraded';
    const promise = this.connectServer(name, resolved, wasReady);
    this.inFlight.set(name, promise);
    try {
      await promise;
    } catch {
      // connectServer 已调度下一次重试或置 failed
    } finally {
      this.inFlight.delete(name);
    }
  }

  private handleUnexpectedClose(name: string): void {
    if (this.closed) return;
    if (this.disconnecting.has(name)) return;
    const snapshot = this.snapshots.get(name);
    if (snapshot?.status !== 'ready') return;
    this.setStatus(name, {
      status: 'degraded',
      lastError: '连接中断，准备重连',
      serverInfo: snapshot.serverInfo,
    });
    this.scheduleReconnect(name, true);
  }

  private toToolView(
    resolved: ResolvedServer,
    tool: { name: string; description?: string; inputSchema: Record<string, unknown> },
  ): McpToolView {
    const filter = resolved.config.toolFilter;
    const allow =
      filter?.allow && filter.allow.length > 0
        ? filter.allow.some((pattern) => wildcardMatch(tool.name, pattern))
        : true;
    const deny =
      filter?.deny && filter.deny.length > 0
        ? filter.deny.some((pattern) => wildcardMatch(tool.name, pattern))
        : false;
    const enabled = allow && !deny;
    const autoApprove = Array.isArray(resolved.config.autoApprove)
      ? resolved.config.autoApprove.some((pattern) => wildcardMatch(tool.name, pattern))
      : false;
    const view: McpToolView = {
      name: tool.name,
      piName: toPiToolName(resolved.view.name, tool.name),
      inputSchema: tool.inputSchema,
      enabled,
      autoApprove,
    };
    if (tool.description !== undefined) view.description = tool.description;
    return view;
  }

  private newSnapshot(name: string): McpServerSnapshot {
    return {
      name,
      status: 'disconnected',
      tools: [],
      lastError: null,
      serverInfo: null,
      connectedAt: null,
      reconnectAttempts: 0,
    };
  }

  private requireSnapshot(name: string): McpServerSnapshot {
    const snapshot = this.snapshots.get(name);
    if (!snapshot) throw new McpServerConnectError(name, `MCP server ${name} 未初始化`);
    return snapshot;
  }

  private setStatus(
    name: string,
    patch: Partial<Omit<McpServerSnapshot, 'name'>>,
  ): McpServerSnapshot {
    let snapshot = this.snapshots.get(name);
    if (!snapshot) {
      snapshot = this.newSnapshot(name);
      this.snapshots.set(name, snapshot);
    }
    Object.assign(snapshot, patch);
    this.emit('status', { name, snapshot });
    return snapshot;
  }

  private async waitForSettle(name: string): Promise<void> {
    const entry = this.settles.get(name);
    if (entry) await entry.promise;
  }
}
