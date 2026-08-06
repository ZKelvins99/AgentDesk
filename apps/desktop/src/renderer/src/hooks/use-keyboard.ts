import { useEffect } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';

/**
 * 全局快捷键（README 9.8 / M8 补全）。
 * Windows/Linux 用 Ctrl；macOS 用 Cmd（metaKey）。
 */
export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      // —— 应用级 ——
      if (mod && key === 'n' && !shift) {
        e.preventDefault();
        void useSessionStore.getState().createSession();
      } else if (mod && key === 'b') {
        e.preventDefault();
        useUiStore.getState().toggleSidebar();
      } else if (mod && key === ',') {
        e.preventDefault();
        useUiStore.getState().openSettingsPanel();
      }

      // —— M8 新增 ——
      // ⌘` / Ctrl+` → 终端
      else if (mod && e.key === '`') {
        e.preventDefault();
        useUiStore.getState().toggleTerminal();
      }
      // ⌘⇧E → 文件树
      else if (mod && shift && key === 'e') {
        e.preventDefault();
        useUiStore.getState().toggleFileTree();
      }
      // ⌘⇧T → 会话树
      else if (mod && shift && key === 't') {
        e.preventDefault();
        useUiStore.getState().openSessionTree();
      }
      // ⌘K → 全局搜索
      else if (mod && key === 'k') {
        e.preventDefault();
        useUiStore.getState().openGlobalSearch();
      }
      // ⌘P → 命令面板
      else if (mod && key === 'p' && !shift) {
        e.preventDefault();
        useUiStore.getState().openCommandPalette();
      }
      // ⌘/ → 切换思考块显示
      else if (mod && e.key === '/') {
        e.preventDefault();
        useUiStore.getState().toggleHideThinking();
      }
      // ⌘⇧M → 模型选择器
      else if (mod && shift && key === 'm') {
        e.preventDefault();
        useUiStore.getState().openModelPicker();
      }
      // ⌘⇧A → 循环审批模式
      else if (mod && shift && key === 'a') {
        e.preventDefault();
        const { activeSessionId } = useSessionStore.getState();
        useUiStore.getState().cycleApprovalMode(activeSessionId ?? undefined);
      }
      // ⌘⏎ → 批准当前审批
      else if (mod && e.key === 'Enter') {
        e.preventDefault();
        const approvals = useUiStore.getState().approvals;
        if (approvals.length > 0 && approvals[0]) {
          useUiStore.getState().resolveApproval(approvals[0].id, 'allow-once');
        }
      }
      // ⌘⌫ → 拒绝当前审批
      else if (mod && e.key === 'Backspace') {
        e.preventDefault();
        const approvals = useUiStore.getState().approvals;
        if (approvals.length > 0 && approvals[0]) {
          useUiStore.getState().resolveApproval(approvals[0].id, 'deny');
        }
      }
      // ⌘⌥← / ⌘⌥→ → 切换会话
      else if (mod && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
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
      // Esc → 停止当前回合
      else if (e.key === 'Escape') {
        // 不在模态对话框里时才中止
        if (!document.querySelector('[role="dialog"]')) {
          const { activeSessionId, abort } = useSessionStore.getState();
          if (activeSessionId) void abort();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
