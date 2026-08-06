import { useEffect } from 'react';
import type { SessionEventPayload } from '../stores/session-store';
import { useSessionStore } from '../stores/session-store';

/**
 * 订阅 event:session（README 5.3）：
 * 渲染层收到事件后缓冲，16ms 批量合流进 Zustand（避免逐 token setState）。
 */
export function useSessionEvents(): void {
  useEffect(() => {
    const buffer: SessionEventPayload[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      const batch = buffer.splice(0, buffer.length);
      if (batch.length > 0) useSessionStore.getState().applyEvents(batch);
    };

    const push = (payload: SessionEventPayload) => {
      buffer.push(payload);
      if (timer === null) timer = setTimeout(flush, 16);
    };

    const unsubscribe = window.agentdesk.onSessionEvent(push);
    return () => {
      if (timer !== null) clearTimeout(timer);
      flush();
      unsubscribe();
    };
  }, []);
}
