import { memo } from 'react';
import { Icon } from '../../components/Icon';
import { t } from '../../i18n';
import { useUiStore } from '../../stores/ui-store';
import { looksLikeMissingModel } from '../../utils/error-message';
import type { UiMessage } from './message-model';
import { StreamingMarkdown } from './StreamingMarkdown';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';

/** 消息项（README 9.4.2）：用户气泡 / 助手 markdown / 思考块 / 工具卡 / 系统提示。 */
export const MessageItem = memo(function MessageItem({
  message,
}: {
  message: UiMessage;
}): React.JSX.Element {
  switch (message.kind) {
    case 'user':
      return (
        <div className="msg user-msg" data-status={message.status}>
          <div className="msg-bubble">{message.text}</div>
        </div>
      );
    case 'assistant':
      return (
        <div className="msg assistant-msg">
          <ThinkingBlock text={message.thinking} streaming={message.status === 'streaming'} />
          <StreamingMarkdown text={message.text} />
        </div>
      );
    case 'tool':
      return (
        <div className="msg tool-msg">
          <ToolCard message={message} />
        </div>
      );
    case 'system':
      return message.tone === 'error' ? (
        <SystemError text={message.text} />
      ) : (
        <div className={`msg system-msg tone-${message.tone}`}>{message.text}</div>
      );
    default:
      return <span />;
  }
});

/** 错误提示卡：原因 + 可操作出口（缺模型时直达供应商配置）。 */
function SystemError({ text }: { text: string }): React.JSX.Element {
  const openProviderSettings = useUiStore((s) => s.openProviderSettings);
  const needsProvider = looksLikeMissingModel(text);
  return (
    <div className="msg system-msg tone-error">
      <Icon name="alert" size={15} className="system-msg-icon" />
      <div className="system-msg-body">
        <div>{text}</div>
        {needsProvider ? (
          <div className="system-msg-hint">
            {t('session.needModel')}
            <button type="button" className="link-btn" onClick={openProviderSettings}>
              {t('session.goConfigure')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
