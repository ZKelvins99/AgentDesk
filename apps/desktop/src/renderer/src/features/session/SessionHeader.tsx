import { t } from '../../i18n';
import { useUiStore } from '../../stores/ui-store';

/** 会话头（README 9.4.1）：面包屑 + 模型徽标 + 面板开关。 */
export function SessionHeader({
  workspacePath,
  title,
  model,
  messageCount,
}: {
  workspacePath: string;
  title: string;
  model: string | null;
  messageCount: number;
}): React.JSX.Element {
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
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
        <button
          type="button"
          className="header-btn"
          disabled
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
