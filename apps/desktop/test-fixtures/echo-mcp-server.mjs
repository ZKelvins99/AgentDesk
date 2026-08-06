/**
 * G6 测试夹具：极简 MCP stdio server（JSON-RPC over stdio，无需外部依赖）。
 * 工具：echo（立即回显）、slow（睡 2s 后回显，用于超时测试）。
 * 可选：argv[2] 为 pid 文件路径；MCP_FIXTURE_SPAWN_CHILD=1 时再派生一个孙进程
 * 并把其 pid 写入 <pidFile>.child，用于验证进程组清理（Windows Job Object 语义）。
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const pidFile = process.argv[2];
if (pidFile) {
  writeFileSync(pidFile, String(process.pid), 'utf8');
  if (process.env.MCP_FIXTURE_SPAWN_CHILD === '1') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    writeFileSync(`${pidFile}.child`, String(child.pid), 'utf8');
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const idx = buffer.indexOf('\n');
    if (idx < 0) break;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      void handle(JSON.parse(line));
    } catch {
      // 忽略无法解析的帧
    }
  }
});

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

async function handle(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.method === 'initialize') {
    send(msg.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'echo-server', version: '1.0.0' },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send(msg.id, {
      tools: [
        {
          name: 'echo',
          description: 'Echo text back',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
        {
          name: 'slow',
          description: 'Sleep then echo',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
      ],
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params ?? {};
    if (name === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      send(msg.id, { content: [{ type: 'text', text: 'slow:done' }] });
      return;
    }
    send(msg.id, { content: [{ type: 'text', text: `echo:${args?.text ?? ''}` }] });
    return;
  }
  send(msg.id, {});
}
