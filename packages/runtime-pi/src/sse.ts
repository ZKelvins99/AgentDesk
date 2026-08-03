/** 极简 SSE 客户端：fetch + ReadableStream 逐事件解析（pi-web 同款 SSE 格式） */
export interface SseEvent {
  readonly data: string
  readonly event?: string
}

export async function* readSse(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, unknown> {
  if (!response.body) throw new Error("SSE response has no body")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseSseBlock(block)
        if (event) yield event
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseSseBlock(block: string): SseEvent | undefined {
  let data = ""
  let eventName: string | undefined
  for (const line of block.split("\n")) {
    if (line.startsWith("data:")) {
      data += line.slice(5).trimStart()
    } else if (line.startsWith("event:")) {
      eventName = line.slice(6).trim()
    }
    // 注释行（: heartbeat）忽略
  }
  if (data.length === 0) return undefined
  return { data, event: eventName }
}