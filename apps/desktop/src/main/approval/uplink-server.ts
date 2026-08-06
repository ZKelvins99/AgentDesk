import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { prepareCallResult } from '../mcp/mcp-output';
import type {
  McpCallOptions,
  McpCallRequest,
  McpCallResult,
  McpServerDiscovery,
} from '../mcp/mcp-types';
import { McpCallError, McpServerConnectError } from '../mcp/mcp-types';
import type { ApprovalEngine } from './approval-engine';

export interface UplinkMcpHost {
  discoverTools(workspacePath?: string): Promise<McpServerDiscovery[]>;
  callTool(request: McpCallRequest, options: McpCallOptions): Promise<McpCallResult>;
}

export interface UplinkServerOptions {
  engine: ApprovalEngine;
  onLog?: (entry: { sessionId?: string; level?: string; message?: string }) => void;
  /** M6：MCP Host 能力（README 8.2.2 /mcp/tools、/mcp/call、/mcp/cancel）。 */
  mcp?: UplinkMcpHost;
  /** sessionId → workspacePath（用于 MCP 工具清单与调用的工作区上下文）。 */
  resolveWorkspacePath?: (sessionId: string) => string | undefined;
  /** sessionId → 附件目录（image/audio/video 降级落盘）。 */
  attachmentsDir?: (sessionId: string) => string;
}

interface McpCallBody {
  sessionId?: string;
  server?: string;
  tool?: string;
  args?: Record<string, unknown>;
  callId?: string;
  timeoutMs?: number;
}

function errorCodeOf(error: unknown): string {
  if (error instanceof McpCallError) return error.code;
  if (error instanceof McpServerConnectError) return 'unavailable';
  return 'error';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Uplink 控制通道（README 8.2.2）：
 * 127.0.0.1 随机端口 + 每进程一次性 Bearer token + sessionId 核对。
 * POST /approval —— 审批裁决（引擎负责规则/模式/风险/弹窗）
 * POST /log      —— 扩展日志转发
 * GET  /mcp/tools —— 该会话应注册的 MCP 工具清单（JSON Schema）
 * POST /mcp/call —— 转发一次 MCP 工具调用（结果已截断/降级）
 * POST /mcp/cancel —— 按 callId 中止进行中的 MCP 调用
 * GET  /events   —— SSE 推送（mcp:changed 等热更新）
 */
export class UplinkServer {
  readonly token = randomBytes(32).toString('hex');
  private server: Server | null = null;
  private sseClients = new Set<ServerResponse>();
  private readonly activeCalls = new Map<string, AbortController>();
  private _port = 0;

  constructor(private readonly options: UplinkServerOptions) {}

  get port(): number {
    return this._port;
  }

  get url(): string {
    return `http://127.0.0.1:${this._port}`;
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req, res).catch(() => {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'uplink internal error' }));
          } else {
            res.end();
          }
        });
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') this._port = addr.port;
        this.server = server;
        resolve();
      });
    });
  }

  close(): Promise<void> {
    for (const controller of this.activeCalls.values()) controller.abort();
    this.activeCalls.clear();
    for (const client of this.sseClients) client.end();
    this.sseClients.clear();
    return new Promise((resolve) => {
      const server = this.server;
      this.server = null;
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  }

  /** SSE 推送（M6：mcp:changed 等）。 */
  broadcast(event: { type: string; data?: unknown }): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.authorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/approval') {
      await this.handleApproval(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/log') {
      await this.handleLog(req, res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/mcp/tools') {
      await this.handleMcpTools(url, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/mcp/call') {
      await this.handleMcpCall(req, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/mcp/cancel') {
      await this.handleMcpCancel(req, res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      this.handleEvents(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  }

  private authorized(req: IncomingMessage): boolean {
    const host = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return false;
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || token.length !== this.token.length) return false;
    return timingSafeEqual(Buffer.from(token), Buffer.from(this.token));
  }

  private async handleApproval(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = (await readJsonBody(req, 1_000_000)) ?? {};
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const tool = typeof body.tool === 'string' ? body.tool : '';
    if (!sessionId || !tool) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'sessionId and tool required' }));
      return;
    }
    const outcome = await this.options.engine.decide({
      sessionId,
      tool,
      input: body.input ?? {},
      cwd: typeof body.cwd === 'string' ? body.cwd : process.cwd(),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ decision: outcome.decision, reason: outcome.reason ?? null }));
  }

  private async handleLog(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = (await readJsonBody(req, 1_000_000)) ?? {};
    const entry: { sessionId?: string; level?: string; message?: string } = {};
    if (typeof body.sessionId === 'string') entry.sessionId = body.sessionId;
    if (typeof body.level === 'string') entry.level = body.level;
    if (typeof body.message === 'string') entry.message = body.message;
    this.options.onLog?.(entry);
    res.writeHead(204);
    res.end();
  }

  private async handleMcpTools(url: URL, res: ServerResponse): Promise<void> {
    if (!this.options.mcp) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mcp host not configured' }));
      return;
    }
    const sessionId = url.searchParams.get('sessionId') ?? '';
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'sessionId required' }));
      return;
    }
    const workspacePath = this.options.resolveWorkspacePath?.(sessionId);
    const servers = await this.options.mcp.discoverTools(workspacePath);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ servers }));
  }

  private async handleMcpCall(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.options.mcp) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mcp host not configured' }));
      return;
    }
    const body = (await readJsonBody(req, 2_000_000)) as McpCallBody | null;
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    const server = typeof body?.server === 'string' ? body.server : '';
    const tool = typeof body?.tool === 'string' ? body.tool : '';
    const callId = typeof body?.callId === 'string' ? body.callId : '';
    if (!sessionId || !server || !tool) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'sessionId, server and tool required' }));
      return;
    }
    const workspacePath = this.options.resolveWorkspacePath?.(sessionId);
    const controller = new AbortController();
    if (callId) this.activeCalls.set(callId, controller);
    try {
      const timeoutMs = typeof body?.timeoutMs === 'number' ? body.timeoutMs : undefined;
      const result = await this.options.mcp.callTool(
        { server, tool, args: body?.args ?? {} },
        {
          signal: controller.signal,
          ...(workspacePath !== undefined ? { workspacePath } : {}),
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        },
      );
      const prepared = prepareCallResult(result, {
        attachmentsDir: this.options.attachmentsDir?.(sessionId) ?? tmpdir(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          isError: result.isError,
          content: prepared.content,
          truncated: prepared.truncated,
          attachments: prepared.attachments,
        }),
      );
    } catch (error) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          isError: true,
          errorCode: errorCodeOf(error),
          content: [{ type: 'text', text: errorMessage(error) }],
        }),
      );
    } finally {
      if (callId) this.activeCalls.delete(callId);
    }
  }

  private async handleMcpCancel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = (await readJsonBody(req, 100_000)) ?? {};
    const callId = typeof body.callId === 'string' ? body.callId : '';
    if (!callId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'callId required' }));
      return;
    }
    this.activeCalls.get(callId)?.abort();
    res.writeHead(204);
    res.end();
  }

  private handleEvents(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    this.sseClients.add(res);
    res.on('close', () => this.sseClients.delete(res));
  }
}

function readJsonBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}
