import { randomUUID } from 'node:crypto';
import type { AgentDeskEvent, SessionState } from '@agentdesk/ipc';
import type { PiSessionState } from '@agentdesk/pi-protocol';
import { AgentDeskError } from '@agentdesk/shared';
import type { PiBridge, PiSidecar, PiSidecarOptions } from '../pi';

/**
 * 会话运行时（README 5.3）：
 * sidecar 事件 → 归一化 AgentDeskEvent → 写历史 + 16ms 批量合流 → onEvent 广播。
 * M3 起由 SQLite SessionStore 替换内存历史（README 8.8 / IPC 10.1 原则 4）。
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
  title: string;
  status: 'idle' | 'streaming' | 'degraded' | 'error';
  messageCount: number;
  updatedAt: number;
}

export interface SessionManagerOptions {
  bridge: PiBridge;
  workspacePath: string;
  sessionDir: string;
  defaultProvider?: string | undefined;
  defaultModel?: string | undefined;
  defaultThinkingLevel?: string | undefined;
  trust: 'allow' | 'deny';
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

class SessionRuntime {
  readonly sessionId: string;
  sidecar: PiSidecar;
  private readonly manager: SessionManager;
  private readonly history: AgentDeskEvent[] = [];
  private boundTo: PiSidecar | null = null;
  private seq = 0;
  private state: SessionState | null = null;
  private pending: PendingEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(manager: SessionManager, sessionId: string, sidecar: PiSidecar) {
    this.manager = manager;
    this.sessionId = sessionId;
    this.sidecar = sidecar;
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

  /** 创建会话并拉起 sidecar；waitReady 失败不抛错，会话标记 degraded。 */
  async create(opts: CreateSessionOptions = {}): Promise<string> {
    const sessionId = randomUUID();
    const sidecarOpts: Omit<PiSidecarOptions, 'binary' | 'sessionId' | 'onExit'> = {
      cwd: opts.workspacePath ?? this.options.workspacePath,
      sessionDir: this.options.sessionDir,
      trust: this.options.trust,
    };
    if (this.options.offline) sidecarOpts.offline = true;
    const provider = opts.provider ?? this.options.defaultProvider;
    if (provider) sidecarOpts.provider = provider;
    const model = opts.model ?? this.options.defaultModel;
    if (model) sidecarOpts.model = model;
    const thinking = opts.thinkingLevel ?? this.options.defaultThinkingLevel;
    if (thinking) sidecarOpts.thinkingLevel = thinking;
    if (this.options.agentDir) sidecarOpts.agentDir = this.options.agentDir;

    let sidecar: PiSidecar;
    try {
      sidecar = this.options.bridge.createSessionSidecar(sessionId, sidecarOpts);
    } catch (err) {
      throw new AgentDeskError({
        code: 'SESSION_CREATE_FAILED',
        scope: 'session',
        userMessage: '无法创建会话（sidecar 池已满或参数非法）',
        cause: err,
      });
    }
    const rt = new SessionRuntime(this, sessionId, sidecar);
    this.runtimes.set(sessionId, rt);
    sidecar.start();

    try {
      const state = await sidecar.waitReady(15_000);
      rt.setState(toSessionState(state));
    } catch (err) {
      rt.markError(`内核就绪失败：${(err as Error).message}`);
    }
    return sessionId;
  }

  attach(sessionId: string): SessionSnapshot {
    return this.get(sessionId).snapshot();
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
    await rt.sidecar.command('set_model', { model }, { timeoutMs: 10_000 });
  }

  list(): SessionSummary[] {
    return [...this.runtimes.values()]
      .map((rt) => ({
        id: rt.sessionId,
        title: rt.stateSnapshot.sessionName ?? '新对话',
        status: rt.stateSnapshot.isStreaming ? ('streaming' as const) : ('idle' as const),
        messageCount: rt.messageCount,
        updatedAt: Date.now(),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
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
        code: 'SESSION_NOT_FOUND',
        scope: 'session',
        userMessage: `会话不存在：${sessionId}`,
      });
    }
    return rt;
  }
}
