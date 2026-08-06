import { z } from 'zod';

/** RPC 请求：{"id"?, "type": <command>, ...}，一行一个 JSON。 */

const baseRequest = { id: z.string().optional() };

export const promptRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('prompt'),
    message: z.string(),
    images: z
      .array(
        z.object({
          type: z.literal('image'),
          data: z.string(),
          mimeType: z.string(),
        }),
      )
      .optional(),
    streamingBehavior: z.enum(['steer', 'followUp']).optional(),
  })
  .passthrough();

export const steerRequestSchema = z
  .object({ ...baseRequest, type: z.literal('steer'), message: z.string() })
  .passthrough();

export const followUpRequestSchema = z
  .object({ ...baseRequest, type: z.literal('follow_up'), message: z.string() })
  .passthrough();

export const abortRequestSchema = z
  .object({ ...baseRequest, type: z.literal('abort') })
  .passthrough();

export const newSessionRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('new_session'),
    parentSession: z.string().optional(),
  })
  .passthrough();

export const setModelRequestSchema = z
  .object({ ...baseRequest, type: z.literal('set_model'), model: z.string() })
  .passthrough();

export const cycleModelRequestSchema = z
  .object({ ...baseRequest, type: z.literal('cycle_model'), direction: z.string().optional() })
  .passthrough();

export const setThinkingLevelRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('set_thinking_level'),
    level: z.string(),
  })
  .passthrough();

export const cycleThinkingLevelRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('cycle_thinking_level'),
    direction: z.string().optional(),
  })
  .passthrough();

export const setSteeringModeRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('set_steering_mode'),
    mode: z.enum(['all', 'one-at-a-time']),
  })
  .passthrough();

export const setFollowUpModeRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('set_follow_up_mode'),
    mode: z.enum(['all', 'one-at-a-time']),
  })
  .passthrough();

export const setAutoCompactionRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('set_auto_compaction'),
    enabled: z.boolean(),
  })
  .passthrough();

export const compactRequestSchema = z
  .object({ ...baseRequest, type: z.literal('compact') })
  .passthrough();

export const setAutoRetryRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('set_auto_retry'),
    enabled: z.boolean(),
  })
  .passthrough();

export const abortRetryRequestSchema = z
  .object({ ...baseRequest, type: z.literal('abort_retry') })
  .passthrough();

export const bashRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('bash'),
    command: z.string(),
    cwd: z.string().optional(),
  })
  .passthrough();

export const abortBashRequestSchema = z
  .object({ ...baseRequest, type: z.literal('abort_bash') })
  .passthrough();

export const setSessionNameRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('set_session_name'),
    name: z.string(),
  })
  .passthrough();

export const switchSessionRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('switch_session'),
    session: z.string(),
  })
  .passthrough();

export const forkRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('fork'),
    entryId: z.string().optional(),
  })
  .passthrough();

export const cloneRequestSchema = z
  .object({
    ...baseRequest,
    type: z.literal('clone'),
    entryId: z.string().optional(),
  })
  .passthrough();

/** 无参命令：get_state / get_messages / get_available_models / ... */
function noParamCommand<T extends string>(type: T) {
  return z.object({ ...baseRequest, type: z.literal(type) }).passthrough();
}

export const noParamRequestSchemas = {
  get_state: noParamCommand('get_state'),
  get_messages: noParamCommand('get_messages'),
  get_available_models: noParamCommand('get_available_models'),
  get_available_thinking_levels: noParamCommand('get_available_thinking_levels'),
  get_commands: noParamCommand('get_commands'),
  get_session_stats: noParamCommand('get_session_stats'),
  get_entries: noParamCommand('get_entries'),
  get_tree: noParamCommand('get_tree'),
  get_last_assistant_text: noParamCommand('get_last_assistant_text'),
  get_fork_messages: noParamCommand('get_fork_messages'),
  export_html: noParamCommand('export_html'),
} as const;

export const piRequestSchema = z.discriminatedUnion('type', [
  promptRequestSchema,
  steerRequestSchema,
  followUpRequestSchema,
  abortRequestSchema,
  newSessionRequestSchema,
  setModelRequestSchema,
  cycleModelRequestSchema,
  setThinkingLevelRequestSchema,
  cycleThinkingLevelRequestSchema,
  setSteeringModeRequestSchema,
  setFollowUpModeRequestSchema,
  setAutoCompactionRequestSchema,
  compactRequestSchema,
  setAutoRetryRequestSchema,
  abortRetryRequestSchema,
  bashRequestSchema,
  abortBashRequestSchema,
  setSessionNameRequestSchema,
  switchSessionRequestSchema,
  forkRequestSchema,
  cloneRequestSchema,
  ...Object.values(noParamRequestSchemas),
]);

export type PiRequest = z.infer<typeof piRequestSchema>;