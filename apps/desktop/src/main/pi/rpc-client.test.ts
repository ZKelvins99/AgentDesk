import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { RpcClient } from './rpc-client';

async function nextLine(stream: PassThrough): Promise<string> {
  return new Promise((resolve) => {
    const onData = (d: Buffer) => {
      stream.off('data', onData);
      resolve(d.toString().trim());
    };
    stream.on('data', onData);
  });
}

describe('RpcClient', () => {
  it('发送命令并通过 id 关联响应', async () => {
    const stdin = new PassThrough();
    const client = new RpcClient({ stdin, defaultTimeoutMs: 5_000 });
    const linePromise = nextLine(stdin);
    const resultPromise = client.command('get_state');
    const line = await linePromise;
    const request = JSON.parse(line) as { id: string; type: string };
    expect(request.type).toBe('get_state');
    client.handleLine(
      JSON.stringify({
        id: request.id,
        type: 'response',
        command: 'get_state',
        success: true,
        data: {
          model: null,
          thinkingLevel: 'off',
          isStreaming: false,
          isCompacting: false,
          steeringMode: 'one-at-a-time',
          followUpMode: 'one-at-a-time',
          sessionId: 's1',
          autoCompactionEnabled: true,
          messageCount: 3,
          pendingMessageCount: 0,
        },
      }),
    );
    await expect(resultPromise).resolves.toMatchObject({ messageCount: 3 });
  });

  it('响应 success:false 时 reject', async () => {
    const stdin = new PassThrough();
    const client = new RpcClient({ stdin, defaultTimeoutMs: 5_000 });
    const linePromise = nextLine(stdin);
    const resultPromise = client.command('set_thinking_level', { level: 'max' });
    const line = await linePromise;
    const request = JSON.parse(line) as { id: string };
    client.handleLine(
      JSON.stringify({
        id: request.id,
        type: 'response',
        command: 'set_thinking_level',
        success: false,
        error: 'bad level',
      }),
    );
    await expect(resultPromise).rejects.toThrow(/set_thinking_level 失败/);
  });

  it('terminate 拒绝未决请求', async () => {
    const stdin = new PassThrough();
    const client = new RpcClient({ stdin, defaultTimeoutMs: 5_000 });
    const resultPromise = client.command('get_commands');
    client.terminate('test shutdown');
    await expect(resultPromise).rejects.toThrow(/get_commands 在等待响应时被终止/);
  });

  it('非法请求直接拒绝（不写入 stdin）', async () => {
    const stdin = new PassThrough();
    const client = new RpcClient({ stdin, defaultTimeoutMs: 5_000 });
    await expect(client.command('not-a-command')).rejects.toThrow(/不符合协议/);
  });
});
