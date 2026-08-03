import type { AgentEvent, Unsubscribe } from "@agentdesk/runtime-protocol"

export type EventListener = (event: AgentEvent) => void

export interface EventFilter {
  readonly types?: readonly AgentEvent["type"][]
  readonly runtimeId?: string
  readonly sessionId?: string
}

/**
 * 统一事件总线（文档第 8 节 / M04）。
 * UI、Broker、Registry 只消费 AgentEvent，不感知 Runtime 类型。
 */
export class EventBus {
  private readonly listeners = new Set<EventListener>()
  private readonly filters = new Map<EventListener, EventFilter>()

  publish(event: AgentEvent): void {
    for (const listener of this.listeners) {
      const filter = this.filters.get(listener)
      if (filter && !matchesFilter(event, filter)) continue
      try {
        listener(event)
      } catch {
        // 单个 listener 异常不中断总线
      }
    }
  }

  subscribe(listener: EventListener): Unsubscribe
  subscribe(filter: EventFilter, listener: EventListener): Unsubscribe
  subscribe(
    filterOrListener: EventFilter | EventListener,
    maybeListener?: EventListener,
  ): Unsubscribe {
    const listener: EventListener =
      typeof filterOrListener === "function" ? filterOrListener : maybeListener!
    const filter: EventFilter | undefined =
      typeof filterOrListener === "function" ? undefined : filterOrListener
    this.listeners.add(listener)
    if (filter) this.filters.set(listener, filter)
    return () => {
      this.listeners.delete(listener)
      this.filters.delete(listener)
    }
  }
}

function matchesFilter(event: AgentEvent, filter: EventFilter): boolean {
  if (filter.types && !filter.types.includes(event.type)) return false
  if (filter.runtimeId && event.runtimeId !== filter.runtimeId) return false
  if (filter.sessionId && "sessionId" in event && event.sessionId !== filter.sessionId) {
    return false
  }
  return true
}