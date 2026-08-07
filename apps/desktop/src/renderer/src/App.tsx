import type { OnboardingStatus } from '@agentdesk/ipc';
import { useEffect, useState } from 'react';
import { ApprovalModal } from './components/ApprovalModal';
import { AuditPanel } from './components/AuditPanel';
import { CommandPalette } from './components/CommandPalette';
import { ContextUsageDrawer } from './components/ContextUsageDrawer';
import { GlobalSearch } from './components/GlobalSearch';
import { McpSettings } from './components/McpSettings';
import { ModelPicker } from './components/ModelPicker';
import { OnboardingWizard } from './components/OnboardingWizard';
import { PackageSettings } from './components/PackageSettings';
import { ProviderSettings } from './components/ProviderSettings';
import { SessionTreeOverlay } from './components/SessionTreeOverlay';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';
import { SkillSettings } from './components/SkillSettings';
import { TitleBar } from './components/TitleBar';
import { TrustDialog } from './components/TrustDialog';
import { UpdateBanner } from './components/UpdateBanner';
import { SessionView } from './features/session/SessionView';
import { useApprovalEvents } from './hooks/use-approval-events';
import { useDismissable } from './hooks/use-dismissable';
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
  useDismissable();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);

  // M9：首次启动引导页（README 9.11 / 15）
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.agentdesk.onboarding
      .status()
      .then((st) => {
        if (!cancelled) setOnboarding(st);
      })
      .catch(() => {
        if (!cancelled) setOnboarding({ completed: true, kernelVersion: null, providerCount: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 全局浮层状态
  const globalSearchOpen = useUiStore((s) => s.globalSearchOpen);
  const closeGlobalSearch = useUiStore((s) => s.closeGlobalSearch);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const closeCommandPalette = useUiStore((s) => s.closeCommandPalette);
  const sessionTreeOpen = useUiStore((s) => s.sessionTreeOpen);
  const closeSessionTree = useUiStore((s) => s.closeSessionTree);
  const contextUsageDrawerOpen = useUiStore((s) => s.contextUsageDrawerOpen);
  const closeContextUsageDrawer = useUiStore((s) => s.closeContextUsageDrawer);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  // 启动：恢复最近会话（M3，README 8.8.1）+ 加载 workspace 列表
  useEffect(() => {
    void useSessionStore.getState().restore();
    void useWorkspaceStore.getState().loadWorkspaces();
  }, []);

  const needsOnboarding = onboarding !== null && !onboarding.completed;

  if (needsOnboarding && onboarding) {
    return <OnboardingWizard status={onboarding} onComplete={() => setOnboarding(null)} />;
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body" data-sidebar-collapsed={sidebarCollapsed}>
        <Sidebar />
        <SessionView />
      </div>
      <UpdateBanner />
      <TrustDialog />
      <ModelPicker />
      <ProviderSettings />
      <McpSettings />
      <SkillSettings />
      <PackageSettings />
      <SettingsPanel />
      <ApprovalModal />
      <AuditPanel />
      {/* M8 浮层组件 */}
      {globalSearchOpen ? <GlobalSearch onClose={closeGlobalSearch} /> : null}
      {commandPaletteOpen ? <CommandPalette onClose={closeCommandPalette} /> : null}
      {sessionTreeOpen && activeSessionId ? (
        <SessionTreeOverlay sessionId={activeSessionId} onClose={closeSessionTree} />
      ) : null}
      {contextUsageDrawerOpen && activeSessionId ? (
        <ContextUsageDrawer sessionId={activeSessionId} onClose={closeContextUsageDrawer} />
      ) : null}
    </div>
  );
}
