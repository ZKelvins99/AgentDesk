import { memo } from 'react';
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
      return <div className={`msg system-msg tone-${message.tone}`}>{message.text}</div>;
    default:
      return <span />;
  }
});
