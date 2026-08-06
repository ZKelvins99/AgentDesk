import { create } from 'zustand';

export type Theme = 'dark' | 'light' | 'system';

interface UiStore {
  theme: Theme;
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  modelPickerOpen: boolean;
  providerSettingsOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  openModelPicker: () => void;
  closeModelPicker: () => void;
  openProviderSettings: () => void;
  closeProviderSettings: () => void;
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
  rightPanelOpen: false,
  modelPickerOpen: false,
  providerSettingsOpen: false,
  setTheme: (theme) => {
    try {
      localStorage.setItem('agentdesk-theme', theme);
    } catch {
      // 忽略
    }
    set({ theme });
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  openModelPicker: () => set({ modelPickerOpen: true }),
  closeModelPicker: () => set({ modelPickerOpen: false }),
  openProviderSettings: () => set({ providerSettingsOpen: true }),
  closeProviderSettings: () => set({ providerSettingsOpen: false }),
}));

/** 解析 theme → data-theme（system 跟随 matchMedia），README 9.1 主题切换。 */
export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
