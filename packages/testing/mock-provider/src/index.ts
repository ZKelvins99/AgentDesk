import { createServer } from 'node:http';
import type { Socket } from 'node:net';

/**
 * Mock Provider（README 14.2）：
 * 本地 HTTP 服务，实现 openai-completions 子集，按脚本回放。
 * 能构造：纯文本、thinking 块、连续多个 tool_call、长输出（测虚拟列表）。
 * 通过 models.json 注入为 `mock` provider，E2E 不花真钱、不联网、结果确定。
 */

/** SSE delta 的原始负载（choices[0].delta 内容）。 */
export type MockDelta = Record<string, unknown>;

export type MockScenario =
  | { type: 'script'; deltas: MockDelta[]; delayMs?: number }
  | { type: 'text'; chunks: string[]; delayMs?: number }
  | { type: 'long-text'; chunkCount: number; chunkSize?: number; delayMs?: number }
  | {
      type: 'thinking-text';
      thinkingChunks: string[];
      textChunks: string[];
      delayMs?: number;
    }
  | {
      type: 'tool-calls';
      toolCalls: Array<{ id: string; name: string; args: unknown }>;
      delayMs?: number;
    };

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  stream: boolean;
  raw: Record<string, unknown>;
}

export interface MockProvider {
  port: number;
  baseUrl: string;
  calls: ChatCompletionRequest[];
  close: () => Promise<void>;
}

export interface StartMockProviderOptions {
  /** 单场景或按请求顺序的场景序列（最后一组重复使用）；README 14.2 集成测试用 */
  scenario?: MockScenario | MockScenario[];
  /** 0 = 随机端口 */
  port?: number;
  model?: string;
  host?: string;
}

export function textScenario(chunks: string[], delayMs = 10): MockScenario {
  return { type: 'script', deltas: chunks.map((c) => ({ content: c })), delayMs };
}

export function longTextScenario(chunkCount: number, chunkSize = 200, delayMs = 0): MockScenario {
  const chunks: string[] = [];
  for (let i = 0; i < chunkCount; i += 1) {
    chunks.push(`chunk-${i}:`.padEnd(chunkSize, 'x'));
  }
  return { type: 'script', deltas: chunks.map((c) => ({ content: c })), delayMs };
}

export function thinkingTextScenario(
  thinkingChunks: string[],
  textChunks: string[],
  delayMs = 10,
): MockScenario {
  return {
    type: 'script',
    deltas: [
      ...thinkingChunks.map((c) => ({ reasoning_content: c })),
      ...textChunks.map((c) => ({ content: c })),
    ],
    delayMs,
  };
}

export function toolCallsScenario(
  toolCalls: Array<{ id: string; name: string; args: unknown }>,
  delayMs = 10,
): MockScenario {
  return {
    type: 'script',
    deltas: [
      {
        tool_calls: toolCalls.map((t, index) => ({
          index,
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.args) },
        })),
      },
    ],
    delayMs,
  };
}

function normalizeScenario(scenario: MockScenario | undefined): {
  deltas: MockDelta[];
  delayMs: number;
} {
  if (!scenario) {
    return { deltas: [{ content: 'Mock provider response' }], delayMs: 10 };
  }
  switch (scenario.type) {
    case 'script':
      return { deltas: scenario.deltas, delayMs: scenario.delayMs ?? 10 };
    case 'text':
      return {
        deltas: scenario.chunks.map((c) => ({ content: c })),
        delayMs: scenario.delayMs ?? 10,
      };
    case 'long-text':
      return {
        deltas: Array.from({ length: scenario.chunkCount }, (_, i) => ({
          content: `chunk-${i}:`.padEnd(scenario.chunkSize ?? 200, 'x'),
        })),
        delayMs: scenario.delayMs ?? 0,
      };
    case 'thinking-text':
      return {
        deltas: [
          ...scenario.thinkingChunks.map((c) => ({ reasoning_content: c })),
          ...scenario.textChunks.map((c) => ({ content: c })),
        ],
        delayMs: scenario.delayMs ?? 10,
      };
    case 'tool-calls':
      return {
        deltas: [
          {
            tool_calls: scenario.toolCalls.map((t, index) => ({
              index,
              id: t.id,
              type: 'function',
              function: { name: t.name, arguments: JSON.stringify(t.args) },
            })),
          },
        ],
        delayMs: scenario.delayMs ?? 10,
      };
  }
}

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** 生成 pi models.json 中 mock provider 的配置（README 14.2 注入方式）。 */
export function mockModelsJson(baseUrl: string, model = 'mock-model'): string {
  return JSON.stringify(
    {
      providers: {
        mock: {
          baseUrl,
          api: 'openai-completions',
          apiKey: 'mock-key',
          compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
          models: [
            {
              id: model,
              name: 'Mock Model',
              reasoning: false,
              input: ['text'],
              contextWindow: 8192,
              maxTokens: 1024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    },
    null,
    2,
  );
}

/** 按请求顺序消费的场景序列；单个场景时重复使用，序列时最后一组重复使用。 */
function normalizeScenarioList(
  scenario: MockScenario | MockScenario[] | undefined,
): Array<{ deltas: MockDelta[]; delayMs: number }> {
  const list = Array.isArray(scenario) ? scenario : scenario ? [scenario] : [];
  if (list.length === 0) {
    return [normalizeScenario(undefined)];
  }
  return list.map(normalizeScenario);
}

export function startMockProvider(options: StartMockProviderOptions = {}): Promise<MockProvider> {
  const model = options.model ?? 'mock-model';
  const scripts = normalizeScenarioList(options.scenario);
  const calls: ChatCompletionRequest[] = [];
  const sockets = new Set<Socket>();

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: model, object: 'model' }] }));
        return;
      }
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404);
        res.end();
        return;
      }

      let body = '';
      req.on('data', (c: Buffer) => {
        body += c.toString('utf8');
      });
      req.on('end', () => {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          res.writeHead(400);
          res.end('bad json');
          return;
        }
        const stream = (parsed.stream as boolean | undefined) ?? true;
        calls.push({
          model: (parsed.model as string) ?? model,
          messages: (parsed.messages as ChatCompletionRequest['messages']) ?? [],
          stream,
          raw: parsed,
        });
        const script = scripts[Math.min(calls.length - 1, scripts.length - 1)] ?? {
          deltas: [],
          delayMs: 0,
        };

        if (!stream) {
          const content = script.deltas
            .map((d) => (typeof d.content === 'string' ? d.content : ''))
            .join('');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 'chatcmpl-mock',
              object: 'chat.completion',
              model,
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content },
                  finish_reason: script.deltas.some((d) => d.tool_calls) ? 'tool_calls' : 'stop',
                },
              ],
              usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
            }),
          );
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        let i = 0;
        const timer = setInterval(
          () => {
            if (i < script.deltas.length) {
              res.write(
                sse({
                  id: 'chatcmpl-mock',
                  object: 'chat.completion.chunk',
                  model,
                  choices: [{ index: 0, delta: script.deltas[i], finish_reason: null }],
                }),
              );
              i += 1;
            } else {
              clearInterval(timer);
              res.write(
                sse({
                  id: 'chatcmpl-mock',
                  object: 'chat.completion.chunk',
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: script.deltas.some((d) => d.tool_calls)
                        ? 'tool_calls'
                        : 'stop',
                    },
                  ],
                }),
              );
              res.write('data: [DONE]\n\n');
              res.end();
            }
          },
          Math.max(script.delayMs, 0),
        );
      });
    });

    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    server.on('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({
          port: addr.port,
          baseUrl: `http://${options.host ?? '127.0.0.1'}:${addr.port}/v1`,
          calls,
          close: () =>
            new Promise<void>((r) => {
              for (const socket of sockets) socket.destroy();
              server.close(() => r());
            }),
        });
      } else {
        reject(new Error('无法获取 mock 端口'));
      }
    });
  });
}
