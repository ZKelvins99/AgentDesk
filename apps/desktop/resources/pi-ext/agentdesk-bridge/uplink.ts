/**
 * Uplink 客户端（README 8.2.2）：与主进程 HTTP loopback 控制通道通信。
 * 一次性 Bearer token；POST /approval、POST /log、GET /mcp/tools、POST /mcp/call；
 * GET /events (SSE) 收 mcp:changed 等热更新推送。
 */

export interface Uplink {
  post(path: string, body: unknown, timeoutMs?: number): Promise<unknown>;
  get(path: string, timeoutMs?: number): Promise<unknown>;
  on(event: string, handler: (data?: unknown) => void): void;
  close(): void;
}

interface UplinkEvent {
  type: string;
  data?: unknown;
}

function parseSsePayload(line: string): UplinkEvent | null {
  if (!line.startsWith('data:')) return null;
  const raw = line.slice(5).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as UplinkEvent;
    if (parsed && typeof parsed.type === 'string') return parsed;
  } catch {
    // 忽略无法解析的 SSE 帧
  }
  return null;
}

export function createUplink(
  baseUrl: string | undefined,
  token: string | undefined,
): Uplink | null {
  if (!baseUrl || !token) return null;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const listeners = new Map<string, Set<(data?: unknown) => void>>();
  let sseAbort: AbortController | null = null;
  let closed = false;

  const openSse = (): void => {
    if (closed) return;
    const controller = new AbortController();
    sseAbort = controller;
    void (async () => {
      try {
        const res = await fetch(`${baseUrl}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setTimeout(openSse, 5_000);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const event = parseSsePayload(line);
            if (!event) continue;
            const set = listeners.get(event.type);
            if (!set) continue;
            for (const handler of [...set]) {
              try {
                handler(event.data);
              } catch {
                // 扩展侧 handler 异常不影响 SSE 读取
              }
            }
          }
        }
      } catch {
        // 连接中断
      }
      if (!closed) setTimeout(openSse, 5_000);
    })();
  };

  openSse();

  return {
    async post(path: string, body: unknown, timeoutMs = 10_000): Promise<unknown> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`uplink ${path} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        if (res.status === 204) return undefined;
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    async get(path: string, timeoutMs = 10_000): Promise<unknown> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`uplink ${path} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    on(event: string, handler: (data?: unknown) => void): void {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler);
    },
    close(): void {
      closed = true;
      sseAbort?.abort();
      listeners.clear();
    },
  };
}
