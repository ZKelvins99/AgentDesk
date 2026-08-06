import type { ApprovalMode } from '@agentdesk/shared';
import { Icon } from '../../components/Icon';
import { type I18nKey, t } from '../../i18n';
import { useSessionStore } from '../../stores/session-store';
import { useUiStore } from '../../stores/ui-store';
import { isRealModel, modelLabel } from '../../utils/model-label';

const APPROVAL_MODES: ApprovalMode[] = ['plan', 'read-only', 'auto-edit', 'full-access'];
const MODE_KEYS: Record<ApprovalMode, I18nKey> = {
  plan: 'approval.modePlan',
  'read-only': 'approval.modeReadOnly',
  'auto-edit': 'approval.modeAutoEdit',
  'full-access': 'approval.modeFullAccess',
};

/** 会话头（README 9.4.1）：面包屑 + 模型徽标 + 面板开关。 */
export function SessionHeader({
  sessionId,
  workspacePath,
  title,
  model,
  approvalMode,
  messageCount,
}: {
  sessionId: string;
  workspacePath: string;
  title: string;
  model: string | null;
  approvalMode: ApprovalMode;
  messageCount: number;
}): React.JSX.Element {
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const fileTreeOpen = useUiStore((s) => s.fileTreeOpen);
  const toggleFileTree = useUiStore((s) => s.toggleFileTree);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const openAudit = useUiStore((s) => s.openAudit);
  const openContextUsageDrawer = useUiStore((s) => s.openContextUsageDrawer);
  const openSessionTree = useUiStore((s) => s.openSessionTree);
  const openModelPicker = useUiStore((s) => s.openModelPicker);
  const workspaceName = workspaceNameOf(workspacePath);
  const sessionTitle = title || t('session.emptyTitle');

  return (
    <header className="session-header">
      <div className="session-breadcrumb" title={sessionTitle}>
        <span className="breadcrumb-workspace">{workspaceName}</span>
        <span className="breadcrumb-sep">›</span>
        <span className="breadcrumb-session">{sessionTitle}</span>
      </div>
      <div className="session-header-right">
        <button
          type="button"
          className="token-badge"
          title={t('panel.messages')}
          aria-label={t('panel.messages')}
          onClick={openContextUsageDrawer}
        >
          <Icon name="gauge" size={14} />
          {messageCount}
        </button>
        <button
          type="button"
          className="model-chip"
          data-unset={!isRealModel(model) || undefined}
          title={t('composer.modelSwitch')}
          onClick={openModelPicker}
        >
          {modelLabel(model)}
          <Icon name="chevronDown" size={12} />
        </button>
        <select
          className="approval-mode-chip"
          value={approvalMode}
          title={t('approval.modeSwitch')}
          aria-label={t('approval.modeSwitch')}
          onChange={(e) =>
            useSessionStore
              .getState()
              .setSessionApprovalMode(sessionId, e.target.value as ApprovalMode)
          }
        >
          {APPROVAL_MODES.map((m) => (
            <option key={m} value={m}>
              {t(MODE_KEYS[m])}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="header-btn"
          onClick={openSessionTree}
          title={`${t('command.sessionTree')} (Ctrl+Shift+T)`}
          aria-label={t('command.sessionTree')}
        >
          <Icon name="gitBranch" />
        </button>
        <button
          type="button"
          className="header-btn"
          onClick={openAudit}
          title={t('approval.audit')}
          aria-label={t('approval.audit')}
        >
          <Icon name="shield" />
        </button>
        <button
          type="button"
          className="header-btn"
          data-active={fileTreeOpen}
          onClick={toggleFileTree}
          title={t('session.toggleFiles')}
          aria-label={t('session.toggleFiles')}
        >
          <Icon name="panelLeft" />
        </button>
        <button
          type="button"
          className="header-btn"
          data-active={rightPanelOpen}
          onClick={toggleRightPanel}
          title={t('session.togglePanels')}
          aria-label={t('session.togglePanels')}
        >
          <Icon name="panelRight" />
        </button>
      </div>
    </header>
  );
}

function workspaceNameOf(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
