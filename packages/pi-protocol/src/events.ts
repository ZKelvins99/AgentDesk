import { z } from 'zod';

/** pi RPC 事件（对齐 rpc.md Events 章节 + README 4.7）。 */

export const agentStartEventSchema = z.object({ type: z.literal('agent_start') });

export const agentEndEventSchema = z.object({
  type: z.literal('agent_end'),
  messages: z.array(z.unknown()).optional(),
  willRetry: z.boolean().optional(),
});

export const agentSettledEventSchema = z.object({ type: z.literal('agent_settled') });

export const turnStartEventSchema = z.object({ type: z.literal('turn_start') });

export const turnEndEventSchema = z.object({
  type: z.literal('turn_end'),
  message: z.unknown().optional(),
  toolResults: z.array(z.unknown()).optional(),
});

export const messageStartEventSchema = z.object({
  type: z.literal('message_start'),
  message: z.unknown(),
});

export const assistantMessageEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), contentIndex: z.number().optional() }),
  z.object({
    type: z.literal('text_start'),
    contentIndex: z.number().optional(),
    partial: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('text_delta'),
    contentIndex: z.number().optional(),
    delta: z.string(),
    partial: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('text_end'),
    contentIndex: z.number().optional(),
    content: z.string().optional(),
    partial: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('thinking_start'),
    contentIndex: z.number().optional(),
    partial: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('thinking_delta'),
    contentIndex: z.number().optional(),
    delta: z.string(),
    partial: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('thinking_end'),
    contentIndex: z.number().optional(),
    thinking: z.string().optional(),
    partial: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('toolcall_start'),
    contentIndex: z.number().optional(),
  }),
  z.object({
    type: z.literal('toolcall_delta'),
    contentIndex: z.number().optional(),
    delta: z.string().optional(),
  }),
  z.object({
    type: z.literal('toolcall_end'),
    contentIndex: z.number().optional(),
    toolCall: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('done'),
    reason: z.enum(['stop', 'length', 'toolUse']).optional(),
  }),
  z.object({
    type: z.literal('error'),
    reason: z.enum(['aborted', 'error']).optional(),
    message: z.string().optional(),
  }),
]);

export const messageUpdateEventSchema = z.object({
  type: z.literal('message_update'),
  message: z.unknown(),
  assistantMessageEvent: assistantMessageEventSchema,
});

export const messageEndEventSchema = z.object({
  type: z.literal('message_end'),
  message: z.unknown(),
});

export const bashExecutionUpdateEventSchema = z.object({
  type: z.literal('bash_execution_update'),
  id: z.string().optional(),
  delta: z.string(),
});

export const toolExecutionStartEventSchema = z.object({
  type: z.literal('tool_execution_start'),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown(),
});

export const toolExecutionUpdateEventSchema = z.object({
  type: z.literal('tool_execution_update'),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown(),
  partialResult: z.unknown().optional(),
});

export const toolExecutionEndEventSchema = z.object({
  type: z.literal('tool_execution_end'),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown().optional(),
  isError: z.boolean().optional(),
});

export const queueUpdateEventSchema = z.object({
  type: z.literal('queue_update'),
  steering: z.array(z.string()).optional(),
  followUp: z.array(z.string()).optional(),
});

export const compactionStartEventSchema = z.object({
  type: z.literal('compaction_start'),
  reason: z.enum(['manual', 'threshold', 'overflow']).optional(),
});

export const compactionEndEventSchema = z.object({
  type: z.literal('compaction_end'),
  reason: z.enum(['manual', 'threshold', 'overflow']).optional(),
  result: z.unknown().nullable().optional(),
  aborted: z.boolean().optional(),
  willRetry: z.boolean().optional(),
  errorMessage: z.string().optional(),
});

export const autoRetryStartEventSchema = z.object({
  type: z.literal('auto_retry_start'),
  attempt: z.number(),
  maxAttempts: z.number().optional(),
  delayMs: z.number().optional(),
  errorMessage: z.string().optional(),
});

export const autoRetryEndEventSchema = z.object({
  type: z.literal('auto_retry_end'),
  success: z.boolean(),
  attempt: z.number().optional(),
  finalError: z.string().optional(),
});

export const summarizationRetryScheduledEventSchema = z.object({
  type: z.literal('summarization_retry_scheduled'),
  attempt: z.number().optional(),
  maxAttempts: z.number().optional(),
  delayMs: z.number().optional(),
  errorMessage: z.string().optional(),
});

export const summarizationRetryAttemptStartEventSchema = z.object({
  type: z.literal('summarization_retry_attempt_start'),
  source: z.enum(['compaction', 'branchSummary']).optional(),
  reason: z.string().optional(),
});

export const summarizationRetryFinishedEventSchema = z.object({
  type: z.literal('summarization_retry_finished'),
});

export const extensionErrorEventSchema = z.object({
  type: z.literal('extension_error'),
  extensionPath: z.string().optional(),
  event: z.string().optional(),
  error: z.string(),
});

export const extensionUiRequestEventSchema = z
  .object({
    type: z.literal('extension_ui_request'),
    id: z.string(),
    method: z.enum([
      'select',
      'confirm',
      'input',
      'editor',
      'notify',
      'setStatus',
      'setWidget',
      'setTitle',
      'set_editor_text',
    ]),
  })
  .passthrough();

export const piEventSchema = z.discriminatedUnion('type', [
  agentStartEventSchema,
  agentEndEventSchema,
  agentSettledEventSchema,
  turnStartEventSchema,
  turnEndEventSchema,
  messageStartEventSchema,
  messageUpdateEventSchema,
  messageEndEventSchema,
  bashExecutionUpdateEventSchema,
  toolExecutionStartEventSchema,
  toolExecutionUpdateEventSchema,
  toolExecutionEndEventSchema,
  queueUpdateEventSchema,
  compactionStartEventSchema,
  compactionEndEventSchema,
  autoRetryStartEventSchema,
  autoRetryEndEventSchema,
  summarizationRetryScheduledEventSchema,
  summarizationRetryAttemptStartEventSchema,
  summarizationRetryFinishedEventSchema,
  extensionErrorEventSchema,
  extensionUiRequestEventSchema,
]);

export type PiEvent = z.infer<typeof piEventSchema>;
export type ExtensionUiRequest = z.infer<typeof extensionUiRequestEventSchema>;
export type AssistantMessageEvent = z.infer<typeof assistantMessageEventSchema>;
