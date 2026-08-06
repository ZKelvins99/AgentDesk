/**
 * Uplink 客户端（README 8.2.2）：与主进程 HTTP loopback 控制通道通信。
 * 一次性 Bearer token；POST /approval、POST /log；GET /events (SSE) 预留给 M6。
 */

export interface Uplink {
  post(path: string, body: unknown, timeoutMs?: number): Promise<unknown>;
  close(): void;
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
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    close(): void {
      // 无长连接需要显式关闭
    },
  };
}
