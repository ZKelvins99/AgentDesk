import type { ApprovalMode } from '@agentdesk/shared';
import { type I18nKey, t } from '../../i18n';
import { useSessionStore } from '../../stores/session-store';
import { useUiStore } from '../../stores/ui-store';

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
        <span className="token-badge" title={t('panel.messages')}>
          {messageCount} msgs
        </span>
        <span className="model-chip" title={model ?? ''}>
          {model ?? t('composer.model')}
        </span>
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
          onClick={openAudit}
          title={t('approval.audit')}
          aria-label={t('approval.audit')}
        >
          🛡
        </button>
        <button
          type="button"
          className="header-btn"
          data-active={fileTreeOpen}
          onClick={toggleFileTree}
          title={t('session.toggleFiles')}
          aria-label={t('session.toggleFiles')}
        >
          ⊞
        </button>
        <button
          type="button"
          className="header-btn"
          data-active={rightPanelOpen}
          onClick={toggleRightPanel}
          title={t('session.togglePanels')}
          aria-label={t('session.togglePanels')}
        >
          ⧉
        </button>
      </div>
    </header>
  );
}

function workspaceNameOf(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
