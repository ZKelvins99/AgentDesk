import { FileTreePanel } from '../../components/FileTreePanel';
import { RightPanel } from '../../components/RightPanel';
import { TerminalPanel } from '../../components/TerminalPanel';
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
  const fileTreeOpen = useUiStore((s) => s.fileTreeOpen);
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);

  if (!activeId || !session) {
    // activeId 存在但状态还没到 = 正在创建/恢复；完全没有 activeId = 尚未选择会话
    return (
      <div className="session-view">
        <div className="session-empty-pane">
          {activeId ? (
            <span>{t('session.creating')}</span>
          ) : (
            <div className="session-welcome">
              <div className="empty-title">{t('session.emptyTitle')}</div>
              <div className="empty-hint">{t('session.emptyHint')}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="session-view">
      {fileTreeOpen ? <FileTreePanel root={session.workspacePath} /> : null}
      <div className="session-main">
        <SessionHeader
          sessionId={session.id}
          workspacePath={session.workspacePath}
          title={session.title}
          model={session.model}
          approvalMode={session.approvalMode}
          messageCount={session.messages.filter((m) => m.kind !== 'system').length}
        />
        <MessageList messages={session.messages} />
        <Composer
          status={session.status}
          pendingCount={session.pendingCount}
          model={session.model}
          approvalMode={session.approvalMode}
        />
      </div>
      {rightPanelOpen ? <RightPanel /> : null}
      {terminalOpen ? <TerminalPanel cwd={session.workspacePath} onClose={toggleTerminal} /> : null}
    </div>
  );
}
