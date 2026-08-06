import { describe, expect, it } from 'vitest';
import {
  type PiToolApi,
  registerMcpTools,
} from '../../../resources/pi-ext/agentdesk-bridge/mcp-tools';
import type { Uplink } from '../../../resources/pi-ext/agentdesk-bridge/uplink';

interface FakePi {
  registered: Array<{ name: string }>;
  existing: string[];
  registerTool(tool: { name: string }): void;
  getAllTools(): Array<{ name: string }>;
}

function makePi(existing: string[]): FakePi {
  return {
    registered: [],
    existing,
    registerTool(tool: { name: string }): void {
      this.registered.push(tool);
      this.existing.push(tool.name);
    },
    getAllTools(): Array<{ name: string }> {
      return this.existing.map((name) => ({ name }));
    },
  };
}

interface FakeUplink {
  posts: Array<{ path: string; body: unknown }>;
  discovery: unknown;
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  on(): void;
  close(): void;
}

function makeUplink(discovery: unknown): FakeUplink {
  return {
    posts: [],
    discovery,
    async get() {
      return this.discovery;
    },
    async post(path: string, body: unknown) {
      this.posts.push({ path, body });
      return {};
    },
    on() {
      // no-op
    },
    close() {
      // no-op
    },
  };
}

const DISCOVERY = {
  servers: [
    {
      name: 'sv',
      status: 'ready',
      error: null,
      tools: [
        {
          name: 'builtin',
          piName: 'mcp__sv__builtin',
          enabled: true,
          autoApprove: false,
          inputSchema: {},
        },
        {
          name: 'free',
          piName: 'mcp__sv__free',
          enabled: true,
          autoApprove: false,
          inputSchema: { type: 'object' },
        },
        {
          name: 'disabled',
          piName: 'mcp__sv__disabled',
          enabled: false,
          autoApprove: false,
          inputSchema: {},
        },
      ],
    },
  ],
};

describe('registerMcpTools 命名冲突让位（README 8.3.3）', () => {
  it('与 pi 已有工具重名时跳过注册并上报 /mcp/conflict', async () => {
    const pi = makePi(['mcp__sv__builtin']);
    const uplink = makeUplink(DISCOVERY);
    await registerMcpTools(pi as unknown as PiToolApi, uplink as unknown as Uplink, 's1');
    expect(pi.registered.map((t) => t.name)).toEqual(['mcp__sv__free']);
    expect(uplink.posts).toEqual([
      {
        path: '/mcp/conflict',
        body: {
          sessionId: 's1',
          server: 'sv',
          tool: 'builtin',
          piName: 'mcp__sv__builtin',
          conflict: true,
        },
      },
    ]);
  });

  it('无冲突时全部可用工具正常注册', async () => {
    const pi = makePi([]);
    const uplink = makeUplink(DISCOVERY);
    await registerMcpTools(pi as unknown as PiToolApi, uplink as unknown as Uplink, 's1');
    expect(pi.registered.map((t) => t.name)).toEqual(['mcp__sv__builtin', 'mcp__sv__free']);
    expect(uplink.posts).toEqual([]);
  });
});
