import { useEffect } from 'react';
import { ApprovalModal } from './components/ApprovalModal';
import { AuditPanel } from './components/AuditPanel';
import { McpSettings } from './components/McpSettings';
import { ModelPicker } from './components/ModelPicker';
import { ProviderSettings } from './components/ProviderSettings';
import { Sidebar } from './components/Sidebar';
import { SkillSettings } from './components/SkillSettings';
import { TitleBar } from './components/TitleBar';
import { TrustDialog } from './components/TrustDialog';
import { SessionView } from './features/session/SessionView';
import { useApprovalEvents } from './hooks/use-approval-events';
import { useKeyboard } from './hooks/use-keyboard';
import { useSessionEvents } from './hooks/use-session-events';
import { useTheme } from './hooks/use-theme';
import { useSessionStore } from './stores/session-store';
import { useUiStore } from './stores/ui-store';
import { useWorkspaceStore } from './stores/workspace-store';

export default function App(): React.JSX.Element {
  useTheme();
  useSessionEvents();
  useApprovalEvents();
  useKeyboard();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);

  // 启动：恢复最近会话（M3，README 8.8.1）+ 加载 workspace 列表
  useEffect(() => {
    void useSessionStore.getState().restore();
    void useWorkspaceStore.getState().loadWorkspaces();
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body" data-sidebar-collapsed={sidebarCollapsed}>
        <Sidebar />
        <SessionView />
      </div>
      <TrustDialog />
      <ModelPicker />
      <ProviderSettings />
      <McpSettings />
      <SkillSettings />
      <ApprovalModal />
      <AuditPanel />
    </div>
  );
}
