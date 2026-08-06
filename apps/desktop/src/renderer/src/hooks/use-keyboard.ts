import { useEffect } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';

/**
 * 全局快捷键（README 9.8，M2 先落地 ⌘N / ⌘B / Esc）。
 * Windows/Linux 用 Ctrl；macOS 用 Cmd（metaKey）。
 */
export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'n') {
        e.preventDefault();
        void useSessionStore.getState().createSession();
      } else if (mod && key === 'b') {
        e.preventDefault();
        useUiStore.getState().toggleSidebar();
      } else if (e.key === 'Escape') {
        const { activeSessionId, abort } = useSessionStore.getState();
        if (activeSessionId) void abort();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
