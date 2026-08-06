import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  longTextScenario,
  type MockProvider,
  mockModelsJson,
  startMockProvider,
  textScenario,
  thinkingTextScenario,
  toolCallsScenario,
} from './index';

describe('mock-provider（README 14.2）', () => {
  let mock: MockProvider;

  beforeAll(async () => {
    mock = await startMockProvider({
      scenario: textScenario(['Mock ', 'provider ', 'response'], 5),
    });
  });

  afterAll(async () => {
    await mock.close();
  });

  it('流式文本：按脚本回放 SSE delta 并以 [DONE] 收尾', async () => {
    const res = await fetch(`${mock.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('data: {"id":"chatcmpl-mock","object":"chat.completion.chunk"');
    expect(text).toContain('"content":"Mock "');
    expect(text).toContain('data: [DONE]');
    expect(mock.calls.length).toBe(1);
    expect(mock.calls[0]?.messages[0]).toEqual({ role: 'user', content: 'hi' });
  });

  it('非流式：返回完整 completion 文本', async () => {
    const res = await fetch(`${mock.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
      }),
    });
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
    };
    expect(data.choices[0]?.message.content).toBe('Mock provider response');
    expect(data.choices[0]?.finish_reason).toBe('stop');
  });

  it('thinking-text：thinking 块走 reasoning_content，正文走 content', async () => {
    const m = await startMockProvider({
      scenario: thinkingTextScenario(['思考1', '思考2'], ['正文1', '正文2'], 2),
    });
    try {
      const res = await fetch(`${m.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'mock-model', messages: [], stream: true }),
      });
      const text = await res.text();
      expect(text).toContain('"reasoning_content":"思考1"');
      expect(text).toContain('"content":"正文2"');
    } finally {
      await m.close();
    }
  });

  it('tool-calls：能构造连续多个 tool_call delta', async () => {
    const m = await startMockProvider({
      scenario: toolCallsScenario([
        { id: 'call_1', name: 'read', args: { path: 'a.ts' } },
        { id: 'call_2', name: 'bash', args: { command: 'ls' } },
      ]),
    });
    try {
      const res = await fetch(`${m.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'mock-model', messages: [], stream: true }),
      });
      const text = await res.text();
      expect(text).toContain('"tool_calls"');
      expect(text).toContain('call_1');
      expect(text).toContain('call_2');
      expect(text).toContain('"finish_reason":"tool_calls"');
    } finally {
      await m.close();
    }
  });

  it('scenario 数组：按请求顺序消费，最后一组重复', async () => {
    const m = await startMockProvider({
      scenario: [
        toolCallsScenario([{ id: 'seq_1', name: 'read', args: { path: 'a.ts' } }]),
        textScenario(['第二轮文本']),
      ],
    });
    try {
      const call = async () => {
        const res = await fetch(`${m.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'mock-model', messages: [], stream: true }),
        });
        return res.text();
      };
      const t1 = await call();
      expect(t1).toContain('"tool_calls"');
      expect(t1).toContain('seq_1');
      expect(t1).toContain('"finish_reason":"tool_calls"');
      const t2 = await call();
      expect(t2).toContain('第二轮文本');
      expect(t2).not.toContain('"tool_calls"');
      expect(t2).toContain('"finish_reason":"stop"');
      // 第三请求重复最后一组
      const t3 = await call();
      expect(t3).toContain('第二轮文本');
    } finally {
      await m.close();
    }
  });

  it('long-text：构造长输出供虚拟列表性能测试', async () => {
    const m = await startMockProvider({ scenario: longTextScenario(50, 100, 0) });
    try {
      const res = await fetch(`${m.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'mock-model', messages: [], stream: true }),
      });
      const text = await res.text();
      expect((text.match(/"content":"/g) ?? []).length).toBe(50);
    } finally {
      await m.close();
    }
  });

  it('mockModelsJson：生成 pi models.json 可用的 mock provider 配置', () => {
    const json = JSON.parse(mockModelsJson('http://127.0.0.1:1/v1')) as {
      providers: { mock: { api: string; models: Array<{ id: string }> } };
    };
    expect(json.providers.mock.api).toBe('openai-completions');
    expect(json.providers.mock.models[0]?.id).toBe('mock-model');
  });
});
