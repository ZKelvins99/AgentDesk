import type { DragEvent } from 'react';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import type { WorkspaceRecord } from '../types';

/** 左侧栏（README 9.3）：品牌区 / 主导航 / 项目（含信任态与拖拽添加）/ 最近会话 / 底部状态。 */
export function Sidebar(): React.JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const sessions = useSessionStore((s) => s.sessions);
  const summaries = useSessionStore((s) => s.summaries);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const isCreating = useSessionStore((s) => s.isCreating);
  const createError = useSessionStore((s) => s.createError);
  const attachSession = useSessionStore((s) => s.attachSession);
  const setActive = useSessionStore((s) => s.setActive);
  const createSession = useSessionStore((s) => s.createSession);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const pickAndAdd = useWorkspaceStore((s) => s.pickAndAdd);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);

  const recent = summaries.slice(0, 8);
  const activeWorkspacePath = activeId ? (sessions[activeId]?.workspacePath ?? '') : '';

  const handleDrop = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    const p = (e.dataTransfer.files[0] as File & { path?: string })?.path;
    if (p) void addWorkspace(p);
  };

  return (
    <aside
      className="sidebar"
      data-collapsed={collapsed}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
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
          onClick={() => void createSession()}
          disabled={isCreating}
          title={`${t('sidebar.newChat')} (⌘N)`}
        >
          ＋ {t('sidebar.newChat')}
        </button>
        {createError ? <div className="sidebar-error">{createError}</div> : null}
      </nav>

      <div className="sidebar-section">
        <div className="section-label">{t('sidebar.projects')}</div>
        <div className="workspace-list">
          {workspaces.map((ws) => (
            <WorkspaceItem
              key={ws.id}
              workspace={ws}
              active={ws.path === activeWorkspacePath}
              onOpen={() => void openWorkspace(ws.id)}
              onRemove={() => void removeWorkspace(ws.id)}
              onNewChat={() => void createSession(ws.path)}
            />
          ))}
        </div>
        <button
          type="button"
          className="sidebar-add"
          title={t('sidebar.dropHint')}
          onClick={() => void pickAndAdd()}
        >
          ＋ {t('sidebar.addProject')}…
        </button>
      </div>

      <div className="sidebar-section sidebar-recent">
        <div className="section-label">{t('sidebar.recent')}</div>
        {recent.map((s) => {
          const loaded = Boolean(sessions[s.id]);
          return (
            <button
              type="button"
              key={s.id}
              className="recent-item"
              data-active={s.id === activeId}
              onClick={() => {
                if (loaded) setActive(s.id);
                else void attachSession(s.id, 0);
              }}
            >
              <span className="recent-dot" data-streaming={s.status === 'streaming'} />
              <span className="recent-title">{s.title || t('session.emptyTitle')}</span>
            </button>
          );
        })}
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

function WorkspaceItem({
  workspace,
  active,
  onOpen,
  onRemove,
  onNewChat,
}: {
  workspace: WorkspaceRecord;
  active: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onNewChat: () => void;
}): React.JSX.Element {
  const trustLabel = trustBadge(workspace.trust);
  return (
    <div className="project-item" data-active={active} title={workspace.path}>
      <button type="button" className="project-icon" aria-label={workspace.path} onClick={onOpen}>
        ▸
      </button>
      <button
        type="button"
        className="project-name"
        title={`${workspace.path}\n${t('sidebar.newChat')}`}
        onClick={onNewChat}
      >
        {workspace.name}
      </button>
      <span className="project-trust" data-trust={workspace.trust} title={trustLabel}>
        {trustIcon(workspace.trust)}
      </span>
      <button
        type="button"
        className="project-remove"
        title={t('workspace.remove')}
        aria-label={t('workspace.remove')}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}

function trustIcon(trust: WorkspaceRecord['trust']): string {
  switch (trust) {
    case 'always':
    case 'alwaysParent':
      return '✓';
    case 'once':
      return '◐';
    case 'never':
      return '✕';
    default:
      return '⚠';
  }
}

function trustBadge(trust: WorkspaceRecord['trust']): string {
  switch (trust) {
    case 'always':
    case 'alwaysParent':
      return t('workspace.trusted');
    case 'once':
      return t('workspace.trustOnce');
    case 'never':
      return t('sidebar.untrusted');
    default:
      return t('workspace.trustUnknown');
  }
}
