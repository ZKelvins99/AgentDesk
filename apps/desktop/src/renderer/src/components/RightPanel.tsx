import { t } from '../i18n';
import { useSessionStore } from '../stores/session-store';

/** 右侧栈叠面板（README 9.2）：M2 落地为会话信息抽屉，M8 起承载文件树/Diff/终端。 */
export function RightPanel(): React.JSX.Element {
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId] : undefined,
  );
  if (!session) return <aside className="right-panel" />;

  const statusKey: 'status.idle' | 'status.streaming' | 'status.degraded' | 'status.error' =
    session.status === 'idle'
      ? 'status.idle'
      : session.status === 'streaming'
        ? 'status.streaming'
        : session.status === 'degraded'
          ? 'status.degraded'
          : 'status.error';

  return (
    <aside className="right-panel">
      <div className="panel-title">{t('panel.sessionInfo')}</div>
      <dl className="panel-list">
        <dt>{t('panel.status')}</dt>
        <dd data-status={session.status}>{t(statusKey)}</dd>
        <dt>{t('panel.model')}</dt>
        <dd>{session.model ?? '—'}</dd>
        <dt>{t('panel.seq')}</dt>
        <dd>{session.seq}</dd>
        <dt>{t('panel.messages')}</dt>
        <dd>{session.messages.length}</dd>
        <dt>{t('panel.lastEvent')}</dt>
        <dd>{session.lastEventAt ? new Date(session.lastEventAt).toLocaleTimeString() : '—'}</dd>
      </dl>
    </aside>
  );
}
