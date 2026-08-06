import { piEventSchema, type PiEvent } from './events';
import { piResponseSchema, type PiResponse } from './responses';

export type ParsedPiLine =
  | { kind: 'response'; response: PiResponse }
  | { kind: 'event'; event: PiEvent }
  | { kind: 'invalid'; raw: string; error: string };

/**
 * 解析一行 JSONL（调用方负责按 \n 切帧并剥尾部 \r）。
 * 返回 response / event / invalid 三态，避免上层 throw 中断事件流。
 */
export function parsePiLine(raw: string): ParsedPiLine {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { kind: 'invalid', raw, error: 'invalid-json' };
  }

  const response = piResponseSchema.safeParse(obj);
  if (response.success) {
    return { kind: 'response', response: response.data };
  }

  const event = piEventSchema.safeParse(obj);
  if (event.success) {
    return { kind: 'event', event: event.data };
  }

  return { kind: 'invalid', raw, error: 'unknown-shape' };
}