/**
 * AgentDesk 事件归一化契约（README 8.1.4）。
 * 类型与 zod schema 的单一源在 @agentdesk/ipc（主进程校验、渲染层消费共用）。
 */
export type {
  AgentDeskEvent,
  AgentDeskUsage,
  SessionState,
  UiRequestKind,
} from '@agentdesk/ipc';
