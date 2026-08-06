import { randomUUID } from 'node:crypto';
import type { AgentDeskEvent, SessionState } from '@agentdesk/ipc';
import type { PiSessionState } from '@agentdesk/pi-protocol';
import { AgentDeskError } from '@agentdesk/shared';
import type { PiBridge, PiSidecar, PiSidecarOptions } from '../pi';
import type { SessionRecord, SessionStore } from '../storage';

/**
 * 会话运行时（README 5.3）：
 * sidecar 事件 → 归一化 AgentDeskEvent → 写历史 + 16ms 批量合流 → onEvent 广播。
 * M3：事件同步持久化到 SQLite（session_events 渲染缓存），attach 支持 sinceSeq 断点重传。
 */

export type SendMode = 'normal' | 'steer' | 'followUp';

export interface SendResult {
  accepted: boolean;
  mode: SendMode;
}

export interface SessionSnapshot {
  sessionId: string;
  workspacePath: string;
  history: AgentDeskEvent[];
  state: SessionState;
  seq: number;
}

export interface SessionSummary {
  id: string;
  workspaceId: string | null;
  workspacePath: string | null;
  title: string;
  provider: string | null;
  model: string | null;
  status: 'idle' | 'streaming' | 'degraded' | 'error';
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  seq: number;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface SessionListQuery {
  search?: string | undefined;
  archived?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface SessionManagerOptions {
  bridge: PiBridge;
  workspacePath: string;
  sessionDir: string;
  store: SessionStore;
  defaultProvider?: string | undefined;
  defaultModel?: string | undefined;
  defaultThinkingLevel?: string | undefined;
  trust: 'allow' | 'deny';
  /** TrustGate：按 workspace 决策解析 -a/-na（M3，README R3） */
  resolveTrust?: (workspacePath: string) => 'allow' | 'deny';
  /** 会话 provider 的密钥 env（M4，README 8.6.2 最小暴露） */
  resolveProviderEnv?: (provider: string | null) => Record<string, string>;
  agentDir?: string;
  offline?: boolean;
  onEvent: (sessionId: string, seq: number, ev: AgentDeskEvent) => void;
}

export interface CreateSessionOptions {
  workspacePath?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  thinkingLevel?: string | undefined;
}

const EMPTY_STATE: SessionState = {
  model: null,
  thinkingLevel: null,
  isStreaming: false,
  isCompacting: false,
  steeringMode: 'all',
  followUpMode: 'all',
  autoCompactionEnabled: false,
  messageCount: 0,
  pendingMessageCount: 0,
};

const FLUSH_INTERVAL_MS = 16;

interface PendingEvent {
  seq: number;
  ev: AgentDeskEvent;
}

export function toSessionState(state: PiSessionState): SessionState {
  return {
    model: state.model?.id ?? null,
    thinkingLevel: state.thinkingLevel,
    isStreaming: state.isStreaming,
    isCompacting: state.isCompacting,
    steeringMode: state.steeringMode,
    followUpMode: state.followUpMode,
    autoCompactionEnabled: state.autoCompactionEnabled,
    messageCount: state.messageCount,
    pendingMessageCount: state.pendingMessageCount,
    ...(state.sessionFile !== undefined ? { sessionFile: state.sessionFile } : {}),
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
    ...(state.sessionName !== undefined ? { sessionName: state.sessionName } : {}),
  };
}

/** 由 DB 记录重建的会话状态（重启后、sidecar 未拉起时，README 8.8.1 秒开）。 */
export function stateFromRecord(record: SessionRecord): SessionState {
  return {
    model: record.model,
    thinkingLevel: null,
    isStreaming: false,
    isCompacting: false,
    steeringMode: 'all',
    followUpMode: 'all',
    autoCompactionEnabled: false,
    messageCount: record.messageCount,
    pendingMessageCount: 0,
    ...(record.sessionFile !== null ? { sessionFile: record.sessionFile } : {}),
    ...(record.piSessionId !== null ? { sessionId: record.piSessionId } : {}),
    ...(record.title !== '新对话' ? { sessionName: record.title } : {}),
  };
}

class SessionRuntime {
  readonly sessionId: string;
  /** 会话 provider（set_model 需要 provider + modelId，README 8.6.4）。 */
  readonly provider: string | null;
  sidecar: PiSidecar;
  private readonly manager: SessionManager;
  private readonly history: AgentDeskEvent[] = [];
  private boundTo: PiSidecar | null = null;
  private seq: number;
  private state: SessionState | null = null;
  private pending: PendingEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    manager: SessionManager,
    sessionId: string,
    sidecar: PiSidecar,
    provider: string | null,
    seqOffset = 0,
  ) {
    this.manager = manager;
    this.sessionId = sessionId;
    this.provider = provider;
    this.sidecar = sidecar;
    this.seq = seqOffset;
    this.attach(sidecar);
  }

  /** 绑定 sidecar 事件（幂等：崩溃重启后池会换新实例，重新绑定）。 */
  attach(sidecar: PiSidecar): void {
    if (sidecar === this.boundTo) return;
    this.boundTo = sidecar;
    this.sidecar = sidecar;
    sidecar.on('event', (ev: AgentDeskEvent) => this.handle(ev));
    sidecar.on(
      'exit',
      (info: { expected: boolean; code: number | null; signal: string | null }) => {
        if (!info.expected) {
          this.pushError(
            'sidecar',
            `内核进程退出 code=${info.code ?? '-'} signal=${info.signal ?? '-'}，正在自动重启`,
          );
        }
      },
    );
  }

  setState(state: SessionState): void {
    this.handle({ k: 'session.state', state });
  }

  markError(message: string): void {
    this.pushError('sidecar', message);
  }

  snapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      workspacePath: this.manager.workspacePath,
      history: [...this.history],
      state: this.state ?? EMPTY_STATE,
      seq: this.seq,
    };
  }

  /** 断点重传：返回 seq > sinceSeq 的事件（README 10.2 session:attach）。 */
  eventsSince(sinceSeq: number): { history: AgentDeskEvent[]; seq: number } {
    const offset = this.seq - this.history.length;
    const history = this.history.filter((_, i) => offset + i + 1 > sinceSeq);
    return { history, seq: this.seq };
  }

  get stateSnapshot(): SessionState {
    return this.state ?? EMPTY_STATE;
  }

  get messageCount(): number {
    return this.history.filter((e) => e.k === 'msg.start' || e.k === 'tool.start').length;
  }

  flushNow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  private pushError(scope: 'sidecar' | 'provider', message: string): void {
    this.handle({ k: 'error', scope, message });
  }

  private handle(ev: AgentDeskEvent): void {
    if (ev.k === 'session.state') this.state = ev.state;
    this.history.push(ev);
    this.seq += 1;
    this.pending.push({ seq: this.seq, ev });
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, FLUSH_INTERVAL_MS);
      this.flushTimer.unref();
    }
  }

  private flush(): void {
    const batch = this.pending;
    this.pending = [];
    this.manager.persist(this.sessionId, batch);
    for (const { seq, ev } of batch) {
      this.manager.emit(this.sessionId, seq, ev);
    }
  }
}

export class SessionManager {
  private readonly runtimes = new Map<string, SessionRuntime>();

  constructor(private readonly options: SessionManagerOptions) {
    this.options.bridge.pool.on('sidecar-created', (info: { sessionId: string }) => {
      const rt = this.runtimes.get(info.sessionId);
      const sidecar = this.options.bridge.pool.get(info.sessionId);
      if (rt && sidecar) rt.attach(sidecar);
    });
    this.options.bridge.pool.on('restart-exhausted', (sessionId: string) => {
      const rt = this.runtimes.get(sessionId);
      rt?.markError('内核连续崩溃，已停止自动重启，会话进入 degraded');
    });
  }

  get size(): number {
    return this.runtimes.size;
  }

  get workspacePath(): string {
    return this.options.workspacePath;
  }

  get store(): SessionStore {
    return this.options.store;
  }

  /** 创建会话并拉起 sidecar；waitReady 失败不抛错，会话标记 degraded。 */
  async create(opts: CreateSessionOptions = {}): Promise<string> {
    const sessionId = randomUUID();
    const workspacePath = opts.workspacePath ?? this.options.workspacePath;
    const trust = this.options.resolveTrust?.(workspacePath) ?? this.options.trust;
    const sidecarOpts: Omit<PiSidecarOptions, 'binary' | 'sessionId' | 'onExit'> = {
      cwd: workspacePath,
      sessionDir: this.options.sessionDir,
      trust,
    };
    if (this.options.offline) sidecarOpts.offline = true;
    const provider = opts.provider ?? this.options.defaultProvider;
    if (provider) sidecarOpts.provider = provider;
    const model = opts.model ?? this.options.defaultModel;
    if (model) sidecarOpts.model = model;
    const thinking = opts.thinkingLevel ?? this.options.defaultThinkingLevel;
    if (thinking) sidecarOpts.thinkingLevel = thinking;
    if (this.options.agentDir) sidecarOpts.agentDir = this.options.agentDir;
    const providerEnv = this.options.resolveProviderEnv?.(provider ?? null) ?? {};
    if (Object.keys(providerEnv).length > 0) sidecarOpts.env = providerEnv;

    const workspace = this.options.store.upsertWorkspace(workspacePath).workspace;
    this.options.store.createSession({
      id: sessionId,
      workspaceId: workspace.id,
      ...(provider !== undefined ? { provider } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(thinking !== undefined ? { thinkingLevel: thinking } : {}),
    });

    let sidecar: PiSidecar;
    try {
      sidecar = this.options.bridge.createSessionSidecar(sessionId, sidecarOpts);
    } catch (err) {
      this.options.store.deleteSession(sessionId);
      throw new AgentDeskError({
        code: 'SESSION_CREATE_FAILED',
        scope: 'session',
        userMessage: '无法创建会话（sidecar 池已满或参数非法）',
        cause: err,
      });
    }
    const rt = new SessionRuntime(this, sessionId, sidecar, provider ?? null);
    this.runtimes.set(sessionId, rt);
    sidecar.start();

    try {
      const state = await sidecar.waitReady(15_000);
      rt.setState(toSessionState(state));
      this.syncSessionRow(sessionId, rt);
    } catch (err) {
      rt.markError(`内核就绪失败：${(err as Error).message}`);
    }
    return sessionId;
  }

  /**
   * attach：优先读渲染缓存秒开，后台用 `--session <file>` 拉起 sidecar 校正
   * （README 8.8.1 / M3 断点重传）。
   */
  attach(sessionId: string, sinceSeq = 0): SessionSnapshot {
    const record = this.options.store.getSession(sessionId);
    if (!record) {
      throw new AgentDeskError({
        code: 'SESSION_NOT_FOUND',
        scope: 'session',
        userMessage: `会话不存在：${sessionId}`,
      });
    }
    const rt = this.runtimes.get(sessionId);
    if (rt) {
      const snap = rt.eventsSince(sinceSeq);
      return {
        sessionId,
        workspacePath: record.workspacePath ?? this.options.workspacePath,
        history: snap.history,
        state: rt.stateSnapshot,
        seq: snap.seq,
      };
    }
    const events = this.options.store.getEventsSince(sessionId, sinceSeq);
    const seq = this.options.store.latestSeq(sessionId);
    const state = stateFromRecord(record);
    if (record.sessionFile && record.archivedAt === null) {
      void this.resume(sessionId, record);
    }
    return {
      sessionId,
      workspacePath: record.workspacePath ?? this.options.workspacePath,
      history: events.map((e) => e.ev),
      state,
      seq,
    };
  }

  /** 后台恢复历史会话（sidecar 用 sessionFile 重建，事件继续合流校正）。 */
  private async resume(sessionId: string, record: SessionRecord): Promise<void> {
    if (this.runtimes.has(sessionId)) return;
    const workspacePath = record.workspacePath ?? this.options.workspacePath;
    const trust = this.options.resolveTrust?.(workspacePath) ?? this.options.trust;
    const sidecarOpts: Omit<PiSidecarOptions, 'binary' | 'sessionId' | 'onExit'> = {
      cwd: workspacePath,
      sessionDir: this.options.sessionDir,
      trust,
      ...(record.sessionFile !== null ? { sessionFile: record.sessionFile } : {}),
      ...(record.provider !== null ? { provider: record.provider } : {}),
      ...(record.model !== null ? { model: record.model } : {}),
    };
    if (this.options.offline) sidecarOpts.offline = true;
    if (this.options.agentDir) sidecarOpts.agentDir = this.options.agentDir;
    const providerEnv = this.options.resolveProviderEnv?.(record.provider) ?? {};
    if (Object.keys(providerEnv).length > 0) sidecarOpts.env = providerEnv;
    try {
      const sidecar = this.options.bridge.createSessionSidecar(sessionId, sidecarOpts);
      const seqOffset = this.options.store.latestSeq(sessionId);
      const rt = new SessionRuntime(this, sessionId, sidecar, record.provider, seqOffset);
      this.runtimes.set(sessionId, rt);
      sidecar.start();
      const state = await sidecar.waitReady(15_000);
      rt.setState(toSessionState(state));
      this.syncSessionRow(sessionId, rt);
    } catch (err) {
      const rt = this.runtimes.get(sessionId);
      rt?.markError(`历史会话恢复失败：${(err as Error).message}`);
    }
  }

  async send(sessionId: string, text: string): Promise<SendResult> {
    const rt = this.get(sessionId);
    const state = rt.stateSnapshot;
    let mode: SendMode = 'normal';
    if (state.isStreaming) mode = 'steer';
    else if (state.pendingMessageCount > 0) mode = 'followUp';
    const params = { message: text };
    if (mode === 'steer') {
      await rt.sidecar.command('steer', params, { timeoutMs: 20_000 });
    } else if (mode === 'followUp') {
      await rt.sidecar.command('follow_up', params, { timeoutMs: 20_000 });
    } else {
      await rt.sidecar.command('prompt', params, { timeoutMs: 20_000 });
    }
    return { accepted: true, mode };
  }

  async abort(sessionId: string): Promise<void> {
    const rt = this.get(sessionId);
    await rt.sidecar.command('abort', {}, { timeoutMs: 5_000 });
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    const rt = this.get(sessionId);
    await rt.sidecar.command(
      'set_model',
      { provider: rt.provider ?? '', modelId: model },
      { timeoutMs: 10_000 },
    );
    // v0.83.0 RPC 模式在 set_model 后不保证发状态事件，主动 get_state 校正（README 8.6.4）。
    const state = (await rt.sidecar.command(
      'get_state',
      {},
      { timeoutMs: 5_000 },
    )) as PiSessionState;
    rt.setState(toSessionState(state));
  }

  /** get_available_models → 渲染层模型选择器（README 8.6.4） */
  async getModels(sessionId: string): Promise<
    Array<{
      id: string;
      name: string | null;
      provider: string | null;
      api: string | null;
      reasoning: boolean;
      input: string[];
      contextWindow: number | null;
      maxTokens: number | null;
      cost: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } | null;
    }>
  > {
    const rt = this.get(sessionId);
    const data = (await rt.sidecar.command('get_available_models', {}, { timeoutMs: 10_000 })) as {
      models: Array<{
        id: string;
        name?: string;
        provider?: string;
        api?: string;
        reasoning?: boolean;
        input?: string[];
        contextWindow?: number;
        maxTokens?: number;
        cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
      }>;
    };
    return (data.models ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? null,
      provider: m.provider ?? null,
      api: m.api ?? null,
      reasoning: m.reasoning ?? false,
      input: m.input ?? [],
      contextWindow: m.contextWindow ?? null,
      maxTokens: m.maxTokens ?? null,
      cost: m.cost ?? null,
    }));
  }

  async setThinkingLevel(sessionId: string, level: string): Promise<void> {
    const rt = this.get(sessionId);
    await rt.sidecar.command('set_thinking_level', { level }, { timeoutMs: 10_000 });
    // 同上：主动 get_state 校正思考强度。
    const state = (await rt.sidecar.command(
      'get_state',
      {},
      { timeoutMs: 5_000 },
    )) as PiSessionState;
    rt.setState(toSessionState(state));
  }

  list(query: SessionListQuery = {}): SessionSummary[] {
    const records = this.options.store.listSessions(query);
    return records.map((r) => {
      const rt = this.runtimes.get(r.id);
      return {
        id: r.id,
        workspaceId: r.workspaceId,
        workspacePath: r.workspacePath,
        title: r.title,
        provider: r.provider,
        model: r.model,
        status: rt
          ? rt.stateSnapshot.isStreaming
            ? ('streaming' as const)
            : ('idle' as const)
          : r.status,
        messageCount: rt ? rt.messageCount : r.messageCount,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens,
        cacheWriteTokens: r.cacheWriteTokens,
        costUsd: r.costUsd,
        seq: rt ? rt.snapshot().seq : r.seq,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        archivedAt: r.archivedAt,
      };
    });
  }

  rename(sessionId: string, title: string): void {
    this.options.store.renameSession(sessionId, title);
  }

  archive(sessionId: string): void {
    this.options.store.archiveSession(sessionId);
  }

  async delete(sessionId: string): Promise<void> {
    const rt = this.runtimes.get(sessionId);
    if (rt) {
      this.runtimes.delete(sessionId);
      await rt.sidecar.terminate(3_000);
    }
    this.options.store.deleteSession(sessionId);
  }

  export(sessionId: string, format: 'md' | 'json'): string {
    return this.options.store.exportSession(sessionId, format);
  }

  /** 事件合流后落库（渲染缓存 + 索引更新），再广播。 */
  persist(sessionId: string, batch: PendingEvent[]): void {
    if (batch.length === 0) return;
    if (!this.options.store.isOpen()) return;
    try {
      const rt = this.runtimes.get(sessionId);
      const state = rt?.stateSnapshot;
      this.options.store.appendEvents(sessionId, batch, {
        messageCount: rt?.messageCount ?? 0,
        status: state?.isStreaming ? 'streaming' : 'idle',
        updatedAt: Date.now(),
      });
      if (rt) this.syncSessionRow(sessionId, rt);
    } catch (err) {
      console.warn(`[session] 事件落库失败：${(err as Error)?.message ?? String(err)}`);
    }
  }

  private syncSessionRow(sessionId: string, rt: SessionRuntime): void {
    const state = rt.stateSnapshot;
    const record = this.options.store.getSession(sessionId);
    if (!record) return;
    const patch: { sessionFile?: string; piSessionId?: string; title?: string } = {};
    if (state.sessionFile !== undefined && state.sessionFile !== record.sessionFile) {
      patch.sessionFile = state.sessionFile;
    }
    if (state.sessionId !== undefined && state.sessionId !== record.piSessionId) {
      patch.piSessionId = state.sessionId;
    }
    if (state.sessionName && record.title === '新对话') {
      patch.title = state.sessionName;
    }
    if (Object.keys(patch).length > 0) {
      this.options.store.updateSession(sessionId, patch);
    }
  }

  async shutdownAll(timeoutMs = 8_000): Promise<void> {
    await this.options.bridge.shutdownAll(timeoutMs);
    for (const rt of this.runtimes.values()) rt.flushNow();
    this.runtimes.clear();
  }

  emit(sessionId: string, seq: number, ev: AgentDeskEvent): void {
    this.options.onEvent(sessionId, seq, ev);
  }

  private get(sessionId: string): SessionRuntime {
    const rt = this.runtimes.get(sessionId);
    if (!rt) {
      throw new AgentDeskError({
        code: 'SESSION_NOT_RUNNING',
        scope: 'session',
        userMessage: `会话未在运行：${sessionId}，请先 attach 恢复`,
      });
    }
    return rt;
  }
}
