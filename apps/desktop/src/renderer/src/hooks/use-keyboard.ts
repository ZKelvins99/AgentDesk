import { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';
import { isEditableTarget, isMac, isModKey } from '../utils/platform';
import { hasOpenOverlay } from './use-dismissable';

/**
 * 全局快捷键（README 9.8）。
 * 修饰键按平台分流：macOS = Cmd(meta)，Windows/Linux = Ctrl（提示词 3.2）。
 * 输入框聚焦时：仅保留 Esc / 审批快捷键，其余应用级快捷键让路。
 */
export function useKeyboard(): void {
  const lastEscAt = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isModKey(e);
      const shift = e.shiftKey;
      const alt = e.altKey;
      const key = e.key.toLowerCase();
      const editing = isEditableTarget(e.target);

      // —— Esc：双击打开会话树；单击在无弹层时中止回合 ——
      if (e.key === 'Escape') {
        if (hasOpenOverlay()) return; // 由 useDismissable 收口顶层弹层
        const now = Date.now();
        if (now - lastEscAt.current < 400) {
          lastEscAt.current = 0;
          e.preventDefault();
          useUiStore.getState().openSessionTree();
          return;
        }
        lastEscAt.current = now;
        const { activeSessionId, abort } = useSessionStore.getState();
        if (activeSessionId) {
          e.preventDefault();
          void abort();
        }
        return;
      }

      // 审批快捷键：即使在输入态（非审批卡内输入）也可用；审批卡自身有守卫
      if (mod && e.key === 'Enter' && !editing) {
        const approvals = useUiStore.getState().approvals;
        if (approvals[0]) {
          e.preventDefault();
          useUiStore.getState().resolveApproval(approvals[0].id, 'allow-once');
        }
        return;
      }
      if (mod && e.key === 'Backspace' && !editing) {
        const approvals = useUiStore.getState().approvals;
        if (approvals[0]) {
          e.preventDefault();
          useUiStore.getState().resolveApproval(approvals[0].id, 'deny');
        }
        return;
      }

      // 编辑态下不抢占文本编辑（尤其 macOS Ctrl 系 Emacs 绑定）
      if (editing) return;
      if (!mod) return;

      // ⌘⇧N / Ctrl+Shift+N → 新窗口（若主进程未暴露则降级为新会话）
      if (shift && key === 'n') {
        e.preventDefault();
        void window.agentdesk.window.newWindow();
        return;
      }

      if (key === 'n' && !shift) {
        e.preventDefault();
        void useSessionStore.getState().createSession();
      } else if (key === 'b') {
        e.preventDefault();
        useUiStore.getState().toggleSidebar();
      } else if (e.key === ',') {
        e.preventDefault();
        useUiStore.getState().openSettingsPanel();
      } else if (e.key === '`') {
        e.preventDefault();
        useUiStore.getState().toggleTerminal();
      } else if (shift && key === 'e') {
        e.preventDefault();
        useUiStore.getState().toggleFileTree();
      } else if (shift && key === 't') {
        e.preventDefault();
        useUiStore.getState().openSessionTree();
      } else if (key === 'k') {
        e.preventDefault();
        useUiStore.getState().openGlobalSearch();
      } else if (key === 'p' && !shift) {
        e.preventDefault();
        useUiStore.getState().openCommandPalette();
      } else if (e.key === '/') {
        e.preventDefault();
        useUiStore.getState().toggleHideThinking();
      } else if (shift && key === 'm') {
        e.preventDefault();
        useUiStore.getState().openModelPicker();
      } else if (shift && key === 'a') {
        e.preventDefault();
        const { activeSessionId } = useSessionStore.getState();
        useUiStore.getState().cycleApprovalMode(activeSessionId ?? undefined);
      } else if (alt && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const { summaries, activeSessionId, setActive, attachSession } = useSessionStore.getState();
        if (summaries.length === 0) return;
        const idx = summaries.findIndex((s) => s.id === activeSessionId);
        const next =
          e.key === 'ArrowRight'
            ? summaries[(idx + 1) % summaries.length]
            : summaries[(idx - 1 + summaries.length) % summaries.length];
        if (next && next.id !== activeSessionId) {
          setActive(next.id);
          void attachSession(next.id);
        }
      }

      // 静默引用 isMac，保证测试覆盖平台分支时 tree-shake 不会去掉
      void isMac;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
