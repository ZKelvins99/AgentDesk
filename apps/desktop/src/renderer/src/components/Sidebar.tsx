import { t } from '../i18n';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';

/** 左侧栏（README 9.3）：品牌区 / 主导航 / 项目 / 最近 / 底部状态。M2 先落地最小集。 */
export function Sidebar(): React.JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const isCreating = useSessionStore((s) => s.isCreating);
  const createError = useSessionStore((s) => s.createError);

  const recent = Object.values(sessions)
    .sort((a, b) => b.lastEventAt - a.lastEventAt)
    .slice(0, 8);

  const workspacePath = activeId ? (sessions[activeId]?.workspacePath ?? '') : '';
  const workspaceName = workspaceNameOf(workspacePath);

  return (
    <aside className="sidebar" data-collapsed={collapsed}>
      <div className="sidebar-brand">
        <span className="brand-name">{t('app.name')} ⌄</span>
        <span className="brand-actions">
          <button
            type="button"
            className="icon-btn"
            disabled
            title={t('sidebar.search')}
            aria-label={t('sidebar.search')}
          >
            🔍
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled
            title={t('sidebar.notifications')}
            aria-label={t('sidebar.notifications')}
          >
            🔔
          </button>
        </span>
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className="nav-item"
          onClick={() => void useSessionStore.getState().createSession()}
          disabled={isCreating}
          title={`${t('sidebar.newChat')} (⌘N)`}
        >
          ＋ {t('sidebar.newChat')}
        </button>
        {createError ? <div className="sidebar-error">{createError}</div> : null}
      </nav>

      <div className="sidebar-section">
        <div className="section-label">{t('sidebar.projects')}</div>
        {workspacePath ? (
          <div className="project-item" data-active={Boolean(activeId)}>
            <span className="project-icon">▸</span>
            <span className="project-name">{workspaceName}</span>
            <span className="project-trust">⚠</span>
          </div>
        ) : null}
        <div className="sidebar-add">{t('sidebar.addProject')}…</div>
      </div>

      <div className="sidebar-section sidebar-recent">
        <div className="section-label">{t('sidebar.recent')}</div>
        {recent.map((s) => (
          <button
            type="button"
            key={s.id}
            className="recent-item"
            data-active={s.id === activeId}
            onClick={() => useSessionStore.getState().setActive(s.id)}
          >
            <span className="recent-dot" data-streaming={s.status === 'streaming'} />
            <span className="recent-title">{s.title || t('session.emptyTitle')}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <span className="footer-model" title="model">
          {activeId && sessions[activeId]
            ? (sessions[activeId]?.model ?? t('composer.model'))
            : t('composer.model')}
        </span>
        <span className="footer-help">? {t('sidebar.help')}</span>
      </div>
    </aside>
  );
}

function workspaceNameOf(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
