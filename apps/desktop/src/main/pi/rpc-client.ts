import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';
import {
  type PiEvent,
  type PiResponse,
  parsePiLine,
  piRequestSchema,
} from '@agentdesk/pi-protocol';
import { AgentDeskError } from '@agentdesk/shared';

export interface RpcClientOptions {
  stdin: Writable;
  /** 请求响应默认超时（毫秒）。prompt 不设超时（README 8.1.1）。 */
  defaultTimeoutMs?: number;
}

interface PendingRequest {
  command: string;
  resolve: (data: unknown) => void;
  reject: (err: unknown) => void;
  timer: NodeJS.Timeout | null;
}

export interface RpcCommandOptions {
  timeoutMs?: number;
  id?: string;
}

/**
 * 一个 sidecar 一个 RpcClient。
 * - 严格 JSONL 切帧（由 JsonlFramer 完成，禁用 readline）
 * - id 关联 request/response Promise 表
 * - 写入背压：stdin 不可写时排队等 drain
 */
export class RpcClient extends EventEmitter {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly queue: string[] = [];
  private pumping = false;
  private nextId = 1;
  private readonly defaultTimeoutMs: number;

  constructor(private readonly options: RpcClientOptions) {
    super();
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
  }

  /** 发送命令并等待同 id 响应。 */
  command(
    command: string,
    params: Record<string, unknown> = {},
    opts: RpcCommandOptions = {},
  ): Promise<unknown> {
    const id = opts.id ?? `req-${this.nextId}`;
    this.nextId += 1;

    const request = { id, type: command, ...params };
    const parsed = piRequestSchema.safeParse(request);
    if (!parsed.success) {
      return Promise.reject(
        new AgentDeskError({
          code: 'INVALID_RPC_REQUEST',
          scope: 'pi-bridge',
          userMessage: `RPC ${command} 请求不符合协议`,
          cause: parsed.error,
        }),
      );
    }

    // prompt 的响应只表示"已接受/入队"，后续失败走事件流；不设超时（README 8.1.1）
    const timeoutMs = command === 'prompt' ? 0 : (opts.timeoutMs ?? this.defaultTimeoutMs);

    return new Promise<unknown>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id);
              this.emit('requestTimedOut', id, command);
              reject(
                new AgentDeskError({
                  code: 'RPC_TIMEOUT',
                  scope: 'pi-bridge',
                  userMessage: `RPC ${command} 超时（${timeoutMs}ms）`,
                }),
              );
            }, timeoutMs)
          : null;

      this.pending.set(id, { command, resolve, reject, timer });
      this.enqueue(JSON.stringify(parsed.data));
    });
  }

  /** 由 Sidecar 喂入一行已切好的 JSONL。 */
  handleLine(raw: string): void {
    const parsed = parsePiLine(raw);
    if (parsed.kind === 'response') {
      this.emit('response', parsed.response);
      this.settleResponse(parsed.response);
    } else if (parsed.kind === 'event') {
      this.emit('event', parsed.event);
    } else {
      this.emit('invalid', parsed.raw, parsed.error);
    }
  }

  /** 进程退出/主动关闭时，把未决请求全部拒绝。 */
  terminate(reason: string): void {
    for (const [id, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(
        new AgentDeskError({
          code: 'RPC_TERMINATED',
          scope: 'pi-bridge',
          userMessage: `RPC ${pending.command} 在等待响应时被终止`,
          cause: reason,
        }),
      );
    }
    this.queue.length = 0;
  }

  private settleResponse(response: PiResponse): void {
    const id = response.id;
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.pending.delete(id);
    if (response.success) {
      pending.resolve(response.data);
    } else {
      pending.reject(
        new AgentDeskError({
          code: 'RPC_ERROR',
          scope: 'pi-bridge',
          userMessage: `RPC ${pending.command} 失败`,
          cause: response.error,
        }),
      );
    }
  }

  private enqueue(line: string): void {
    this.queue.push(line);
    void this.pump();
  }

  /** 背压：stdin.write 返回 false 时等待 drain 再继续。 */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const line = this.queue.shift();
        if (line === undefined) break;
        if (!this.options.stdin.write(`${line}\n`)) {
          await new Promise<void>((resolve) => {
            this.options.stdin.once('drain', () => resolve());
          });
        }
      }
    } finally {
      this.pumping = false;
    }
  }
}

export type RpcClientEvents = {
  event: [event: PiEvent];
  response: [response: PiResponse];
  invalid: [raw: string, error: string];
  requestTimedOut: [id: string, command: string];
};
