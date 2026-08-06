/**
 * 统一错误类型。README 16.1：错误统一用 AgentDeskError，不得 throw 字符串。
 */
export class AgentDeskError extends Error {
  readonly code: string;
  readonly scope: string;
  override readonly cause?: unknown;
  readonly userMessage: string;

  constructor(options: {
    code: string;
    scope: string;
    cause?: unknown;
    userMessage: string;
  }) {
    super(options.userMessage);
    this.name = 'AgentDeskError';
    this.code = options.code;
    this.scope = options.scope;
    this.cause = options.cause;
    this.userMessage = options.userMessage;
  }
}
