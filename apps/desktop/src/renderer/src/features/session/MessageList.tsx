import { VirtualList, type VirtualListHandle } from '@agentdesk/ui';
import { useRef, useState } from 'react';
import { t } from '../../i18n';
import { MessageItem } from './MessageItem';
import type { UiMessage } from './message-model';

/** 消息流（README 9.4.3）：TanStack Virtual 虚拟化 + 自动滚底（±80px）+ 跳到最新。 */
export function MessageList({ messages }: { messages: UiMessage[] }): React.JSX.Element {
  const listRef = useRef<VirtualListHandle | null>(null);
  const [nearEnd, setNearEnd] = useState(true);

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <div className="empty-title">{t('session.emptyTitle')}</div>
        <div className="empty-hint">{t('session.emptyHint')}</div>
      </div>
    );
  }

  return (
    <div className="message-list-wrap">
      <VirtualList<UiMessage>
        ref={listRef}
        className="message-list"
        items={messages}
        getKey={(m) => m.id}
        estimateSize={(index) => estimateMessageHeight(messages[index] as UiMessage)}
        renderItem={(m) => <MessageItem message={m} />}
        followEnd
        onNearEndChange={setNearEnd}
      />
      {!nearEnd ? (
        <button
          type="button"
          className="jump-to-latest"
          onClick={() => listRef.current?.scrollToEnd('smooth')}
        >
          {t('session.jumpToLatest')} ↓
        </button>
      ) : null}
    </div>
  );
}

function estimateMessageHeight(msg: UiMessage): number {
  switch (msg.kind) {
    case 'user':
      return 56;
    case 'assistant':
      return 120;
    case 'tool':
      return 44;
    case 'system':
      return 40;
    default:
      return 80;
  }
}
