import { useState } from 'react';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';
import { modelDetail } from '../utils/model-label';
import { DiffPanel } from './DiffPanel';
import { Icon } from './Icon';

/** 右侧栈叠面板（README 9.2）：会话信息 + M3 会话操作（重命名/归档/删除/导出）。 */
export function RightPanel(): React.JSX.Element {
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId] : undefined,
  );
  const activeId = useSessionStore((s) => s.activeSessionId);
  const diffFile = useUiStore((s) => s.diffFile);
  const closeDiff = useUiStore((s) => s.closeDiff);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [exportedPath, setExportedPath] = useState<string | null>(null);

  if (!session || !activeId) return <aside className="right-panel" />;
  if (diffFile) {
    return <DiffPanel root={session.workspacePath} file={diffFile} onClose={closeDiff} />;
  }

  const statusKey: 'status.idle' | 'status.streaming' | 'status.degraded' | 'status.error' =
    session.status === 'idle'
      ? 'status.idle'
      : session.status === 'streaming'
        ? 'status.streaming'
        : session.status === 'degraded'
          ? 'status.degraded'
          : 'status.error';

  const store = useSessionStore.getState();

  const commitRename = async (): Promise<void> => {
    const title = draftTitle.trim();
    if (!title) {
      setRenaming(false);
      return;
    }
    await store.renameSession(activeId, title);
    setRenaming(false);
  };

  const doExport = async (format: 'md' | 'json'): Promise<void> => {
    const path = await store.exportSession(activeId, format);
    if (path) setExportedPath(path);
  };

  return (
    <aside className="right-panel">
      <div className="panel-title">{t('panel.sessionInfo')}</div>
      <dl className="panel-list">
        <dt>{t('panel.status')}</dt>
        <dd data-status={session.status}>{t(statusKey)}</dd>
        <dt>{t('panel.model')}</dt>
        <dd>{modelDetail(session.model)}</dd>
        <dt>{t('panel.seq')}</dt>
        <dd>{session.seq}</dd>
        <dt>{t('panel.messages')}</dt>
        <dd>{session.messages.length}</dd>
        <dt>{t('panel.lastEvent')}</dt>
        <dd>{session.lastEventAt ? new Date(session.lastEventAt).toLocaleTimeString() : '—'}</dd>
      </dl>

      <div className="panel-section-title">{t('panel.actions')}</div>
      {renaming ? (
        <div className="rename-row">
          <input
            className="rename-input"
            value={draftTitle}
            placeholder={session.title}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
          <button type="button" className="session-action" onClick={() => void commitRename()}>
            <Icon name="check" size={14} />
          </button>
          <button type="button" className="session-action" onClick={() => setRenaming(false)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : (
        <div className="session-actions">
          <button
            type="button"
            className="session-action"
            onClick={() => {
              setDraftTitle(session.title);
              setRenaming(true);
            }}
          >
            {t('session.rename')}
          </button>
          <button
            type="button"
            className="session-action"
            onClick={() => void store.archiveSession(activeId)}
          >
            {t('session.archive')}
          </button>
          <button
            type="button"
            className="session-action session-action-danger"
            onClick={() => void store.deleteSession(activeId)}
          >
            {t('session.delete')}
          </button>
        </div>
      )}

      <div className="session-actions">
        <button type="button" className="session-action" onClick={() => void doExport('md')}>
          {t('session.exportMd')}
        </button>
        <button type="button" className="session-action" onClick={() => void doExport('json')}>
          {t('session.exportJson')}
        </button>
      </div>
      {exportedPath ? (
        <div className="exported-path" title={exportedPath}>
          {t('session.exported', { path: exportedPath })}
        </div>
      ) : null}
    </aside>
  );
}
