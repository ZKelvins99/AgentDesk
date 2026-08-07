import { useEffect } from 'react';
import { useUiStore } from '../stores/ui-store';

/**
 * 弹层 Esc 收口：只关闭最顶层，避免 6 处各自监听导致叠层一起关。
 * 顶层判定顺序：审批(alertdialog) → 命令面板 → 全局搜索 → 会话树 → 上下文用量 → 其余。
 */
export type DismissLayer =
  | 'approval'
  | 'commandPalette'
  | 'globalSearch'
  | 'sessionTree'
  | 'contextUsage'
  | 'modelPicker'
  | 'settings'
  | 'providerSettings'
  | 'mcpSettings'
  | 'skillSettings'
  | 'packageSettings'
  | 'audit';

const LAYER_ORDER: DismissLayer[] = [
  'approval',
  'commandPalette',
  'globalSearch',
  'sessionTree',
  'contextUsage',
  'modelPicker',
  'providerSettings',
  'mcpSettings',
  'skillSettings',
  'packageSettings',
  'audit',
  'settings',
];

function topOpenLayer(): DismissLayer | null {
  const s = useUiStore.getState();
  const open: Record<DismissLayer, boolean> = {
    approval: s.approvals.length > 0,
    commandPalette: s.commandPaletteOpen,
    globalSearch: s.globalSearchOpen,
    sessionTree: s.sessionTreeOpen,
    contextUsage: s.contextUsageDrawerOpen,
    modelPicker: s.modelPickerOpen,
    providerSettings: s.providerSettingsOpen,
    mcpSettings: s.mcpSettingsOpen,
    skillSettings: s.skillSettingsOpen,
    packageSettings: s.packageSettingsOpen,
    audit: s.auditOpen,
    settings: s.settingsPanelOpen,
  };
  for (const layer of LAYER_ORDER) {
    if (open[layer]) return layer;
  }
  return null;
}

function dismiss(layer: DismissLayer): void {
  const s = useUiStore.getState();
  switch (layer) {
    case 'approval':
      // 审批 Esc = 拒绝当前项（不中止会话）
      if (s.approvals[0]) s.resolveApproval(s.approvals[0].id, 'deny');
      break;
    case 'commandPalette':
      s.closeCommandPalette();
      break;
    case 'globalSearch':
      s.closeGlobalSearch();
      break;
    case 'sessionTree':
      s.closeSessionTree();
      break;
    case 'contextUsage':
      s.closeContextUsageDrawer();
      break;
    case 'modelPicker':
      s.closeModelPicker();
      break;
    case 'providerSettings':
      s.closeProviderSettings();
      break;
    case 'mcpSettings':
      s.closeMcpSettings();
      break;
    case 'skillSettings':
      s.closeSkillSettings();
      break;
    case 'packageSettings':
      s.closePackageSettings();
      break;
    case 'audit':
      s.closeAudit();
      break;
    case 'settings':
      s.closeSettingsPanel();
      break;
  }
}

/** 是否有任意弹层打开（供 Esc 中止会话守卫使用）。 */
export function hasOpenOverlay(): boolean {
  return topOpenLayer() !== null;
}

/** 在 App 根挂一次即可；各弹层勿再各自监听 Esc。 */
export function useDismissable(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return;
      const top = topOpenLayer();
      if (!top) return;
      e.preventDefault();
      e.stopPropagation();
      dismiss(top);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
