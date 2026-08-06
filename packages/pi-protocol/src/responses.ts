import { z } from 'zod';

export const piResponseSchema = z
  .object({
    type: z.literal('response'),
    command: z.string(),
    id: z.string().optional(),
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.unknown().optional(),
  })
  .passthrough();

export const piModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  api: z.string().optional(),
  provider: z.string().optional(),
  baseUrl: z.string().optional(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
  cost: z
    .object({
      input: z.number().optional(),
      output: z.number().optional(),
      cacheRead: z.number().optional(),
      cacheWrite: z.number().optional(),
    })
    .optional(),
});

export const piCommandSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  source: z.string().optional(),
  sourceInfo: z
    .object({
      path: z.string().optional(),
      source: z.string().optional(),
      scope: z.string().optional(),
      origin: z.string().optional(),
      baseDir: z.string().optional(),
    })
    .optional(),
});

export const piSessionStateSchema = z.object({
  model: piModelSchema.nullable(),
  thinkingLevel: z.string().nullable(),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
  steeringMode: z.string(),
  followUpMode: z.string(),
  sessionFile: z.string().optional(),
  sessionId: z.string().optional(),
  sessionName: z.string().optional(),
  autoCompactionEnabled: z.boolean(),
  messageCount: z.number(),
  pendingMessageCount: z.number(),
});

export const getStateResponseSchema = z.object({
  type: z.literal('response'),
  command: z.literal('get_state'),
  success: z.literal(true),
  data: piSessionStateSchema,
});

export const getAvailableModelsResponseSchema = z.object({
  type: z.literal('response'),
  command: z.literal('get_available_models'),
  success: z.literal(true),
  data: z.object({ models: z.array(piModelSchema) }),
});

export const getCommandsResponseSchema = z.object({
  type: z.literal('response'),
  command: z.literal('get_commands'),
  success: z.literal(true),
  data: z.object({ commands: z.array(piCommandSchema) }),
});

export type PiResponse = z.infer<typeof piResponseSchema>;
export type PiSessionState = z.infer<typeof piSessionStateSchema>;
export type PiModel = z.infer<typeof piModelSchema>;
export type PiCommand = z.infer<typeof piCommandSchema>;