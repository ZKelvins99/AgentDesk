import { z } from 'zod';
import type { IpcChannel } from './channels';

export const pingRequestSchema = z.object({
  nonce: z.string().optional(),
});
export const pingResponseSchema = z.object({
  pong: z.string(),
});

export const getVersionResponseSchema = z.object({
  version: z.string(),
});

export interface InvokeMap {
  'app:ping': {
    request: z.infer<typeof pingRequestSchema>;
    response: z.infer<typeof pingResponseSchema>;
  };
  'app:get-version': {
    request: undefined;
    response: z.infer<typeof getVersionResponseSchema>;
  };
  'window:minimize': { request: undefined; response: undefined };
  'window:maximize': { request: undefined; response: undefined };
  'window:close': { request: undefined; response: undefined };
}

/** 运行时请求校验表：main 侧 handler 执行前必须过 zod（README 16.1）。 */
export const invokeRequestSchemas = {
  'app:ping': pingRequestSchema,
  'app:get-version': z.undefined(),
  'window:minimize': z.undefined(),
  'window:maximize': z.undefined(),
  'window:close': z.undefined(),
} as const satisfies Record<IpcChannel, z.ZodType>;

export type InvokeRequest<C extends keyof InvokeMap> = InvokeMap[C]['request'];
export type InvokeResponse<C extends keyof InvokeMap> = InvokeMap[C]['response'];
