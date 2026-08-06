import type { ApprovalDecisionKind, ApprovalRequestView } from '@agentdesk/ipc';
import { create } from 'zustand';

export type Theme = 'dark' | 'light' | 'system';

interface UiStore {
  theme: Theme;
  sidebarCollapsed: boolean;
  fileTreeOpen: boolean;
  rightPanelOpen: boolean;
  modelPickerOpen: boolean;
  providerSettingsOpen: boolean;
  mcpSettingsOpen: boolean;
  skillSettingsOpen: boolean;
  packageSettingsOpen: boolean;
  settingsPanelOpen: boolean;
  diffFile: string | null;
  approvals: ApprovalRequestView[];
  auditOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  toggleFileTree: () => void;
  toggleRightPanel: () => void;
  openModelPicker: () => void;
  closeModelPicker: () => void;
  openProviderSettings: () => void;
  closeProviderSettings: () => void;
  openMcpSettings: () => void;
  closeMcpSettings: () => void;
  openSkillSettings: () => void;
  closeSkillSettings: () => void;
  openPackageSettings: () => void;
  closePackageSettings: () => void;
  openSettingsPanel: () => void;
  closeSettingsPanel: () => void;
  openDiff: (file: string) => void;
  closeDiff: () => void;
  pushApproval: (req: ApprovalRequestView) => void;
  resolveApproval: (id: string, decision: ApprovalDecisionKind, reason?: string) => void;
  openAudit: () => void;
  closeAudit: () => void;
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('agentdesk-theme');
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
  } catch {
    // 忽略 localStorage 不可用
  }
  return 'dark';
}

export const useUiStore = create<UiStore>()((set) => ({
  theme: initialTheme(),
  sidebarCollapsed: false,
  fileTreeOpen: false,
  rightPanelOpen: false,
  modelPickerOpen: false,
  providerSettingsOpen: false,
  mcpSettingsOpen: false,
  skillSettingsOpen: false,
  packageSettingsOpen: false,
  settingsPanelOpen: false,
  diffFile: null,
  approvals: [],
  auditOpen: false,
  setTheme: (theme) => {
    try {
      localStorage.setItem('agentdesk-theme', theme);
    } catch {
      // 忽略
    }
    set({ theme });
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleFileTree: () => set((s) => ({ fileTreeOpen: !s.fileTreeOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  openModelPicker: () => set({ modelPickerOpen: true }),
  closeModelPicker: () => set({ modelPickerOpen: false }),
  openProviderSettings: () => set({ providerSettingsOpen: true }),
  closeProviderSettings: () => set({ providerSettingsOpen: false }),
  openMcpSettings: () => set({ mcpSettingsOpen: true }),
  closeMcpSettings: () => set({ mcpSettingsOpen: false }),
  openSkillSettings: () => set({ skillSettingsOpen: true }),
  closeSkillSettings: () => set({ skillSettingsOpen: false }),
  openPackageSettings: () => set({ packageSettingsOpen: true }),
  closePackageSettings: () => set({ packageSettingsOpen: false }),
  openSettingsPanel: () => set({ settingsPanelOpen: true }),
  closeSettingsPanel: () => set({ settingsPanelOpen: false }),
  openDiff: (file) => set({ diffFile: file, rightPanelOpen: true }),
  closeDiff: () => set({ diffFile: null }),
  pushApproval: (req) =>
    set((s) =>
      s.approvals.some((a) => a.id === req.id) ? s : { approvals: [...s.approvals, req] },
    ),
  resolveApproval: (id, decision, reason) => {
    void window.agentdesk.approval.respond({
      requestId: id,
      decision,
      ...(reason !== undefined ? { reason } : {}),
    });
    set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) }));
  },
  openAudit: () => set({ auditOpen: true }),
  closeAudit: () => set({ auditOpen: false }),
}));

/** 解析 theme → data-theme（system 跟随 matchMedia），README 9.1 主题切换。 */
export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
