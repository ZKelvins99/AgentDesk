import { RightPanel } from '../../components/RightPanel';
import { t } from '../../i18n';
import { useSessionStore } from '../../stores/session-store';
import { useUiStore } from '../../stores/ui-store';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { SessionHeader } from './SessionHeader';

/** 会话视图：三栏布局的中栏（README 9.2）。 */
export function SessionView(): React.JSX.Element {
  const activeId = useSessionStore((s) => s.activeSessionId);
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId] : undefined,
  );
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);

  if (!activeId || !session) {
    return (
      <div className="session-view">
        <div className="session-empty-pane">{t('session.creating')}</div>
      </div>
    );
  }

  return (
    <div className="session-view">
      <div className="session-main">
        <SessionHeader
          workspacePath={session.workspacePath}
          title={session.title}
          model={session.model}
          messageCount={session.messages.filter((m) => m.kind !== 'system').length}
        />
        <MessageList messages={session.messages} />
        <Composer
          status={session.status}
          pendingCount={session.pendingCount}
          model={session.model}
        />
      </div>
      {rightPanelOpen ? <RightPanel /> : null}
    </div>
  );
}
