import { afterEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../stores/ui-store';
import { hasOpenOverlay } from './use-dismissable';

describe('hasOpenOverlay Esc 守卫', () => {
  afterEach(() => {
    useUiStore.setState({
      approvals: [],
      commandPaletteOpen: false,
      globalSearchOpen: false,
      sessionTreeOpen: false,
      contextUsageDrawerOpen: false,
      modelPickerOpen: false,
      providerSettingsOpen: false,
      mcpSettingsOpen: false,
      skillSettingsOpen: false,
      packageSettingsOpen: false,
      settingsPanelOpen: false,
      auditOpen: false,
    });
  });

  it('无弹层时为 false（Esc 可中止会话）', () => {
    expect(hasOpenOverlay()).toBe(false);
  });

  it('审批打开时为 true（即使 role=alertdialog，也不依赖 DOM）', () => {
    useUiStore.setState({
      approvals: [
        {
          id: 'a1',
          sessionId: 's1',
          tool: 'bash',
          argsSummary: 'rm -rf',
          risk: 'high',
          cwd: '/',
        },
      ],
    });
    expect(hasOpenOverlay()).toBe(true);
  });

  it('命令面板打开时为 true', () => {
    useUiStore.setState({ commandPaletteOpen: true });
    expect(hasOpenOverlay()).toBe(true);
  });
});
