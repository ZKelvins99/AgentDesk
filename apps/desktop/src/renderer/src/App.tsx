import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { SessionView } from './features/session/SessionView';
import { useKeyboard } from './hooks/use-keyboard';
import { useSessionEvents } from './hooks/use-session-events';
import { useTheme } from './hooks/use-theme';
import { useSessionStore } from './stores/session-store';
import { useUiStore } from './stores/ui-store';

export default function App(): React.JSX.Element {
  useTheme();
  useSessionEvents();
  useKeyboard();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const isCreating = useSessionStore((s) => s.isCreating);

  // 首次进入自动新开一个会话（M3 起改为恢复最近会话）
  useEffect(() => {
    if (!activeId && !isCreating) {
      void useSessionStore.getState().createSession();
    }
  }, [activeId, isCreating]);

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body" data-sidebar-collapsed={sidebarCollapsed}>
        <Sidebar />
        <SessionView />
      </div>
    </div>
  );
}
