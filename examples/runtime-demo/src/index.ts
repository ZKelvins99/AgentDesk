import { CAPABILITIES, type AgentCapabilities } from "@agentdesk/runtime-protocol"
import { BaseRuntime } from "@agentdesk/runtime-sdk"

/**
 * M22-T02/T03: 第三方 Demo Runtime —— 只依赖 @agentdesk/runtime-sdk + runtime-protocol，
 * 不 import 任何平台核心（G22：接入不改 platform-core/artifact-core/broker-core）。
 */
export class ThirdPartyDemoRuntime extends BaseRuntime {
  readonly id = "third-party-demo"
  readonly displayName = "Third-Party Demo"

  capabilities(): AgentCapabilities {
    return {
      ids: [
        CAPABILITIES.SESSION_CREATE,
        CAPABILITIES.SESSION_STREAM,
        CAPABILITIES.TOOLS_NATIVE,
      ],
    }
  }

  async doHealth(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: "third-party demo ready" }
  }

  protected async runTurn(sessionId: string, message: string): Promise<void> {
    this.emit({ type: "message.started", runtimeId: this.id, sessionId, messageId: `m1`, at: new Date().toISOString() })
    const reply = `[third-party] echo: ${message}`
    for (let i = 0; i < reply.length; i += 2) {
      this.emit({
        type: "message.delta",
        runtimeId: this.id,
        sessionId,
        messageId: `m1`,
        delta: reply.slice(i, i + 2),
        at: new Date().toISOString(),
      })
      await new Promise((r) => setTimeout(r, 10))
    }
    this.emit({
      type: "message.completed",
      runtimeId: this.id,
      sessionId,
      messageId: `m1`,
      text: reply,
      at: new Date().toISOString(),
    })
    this.emit({ type: "session.idle", runtimeId: this.id, sessionId, at: new Date().toISOString() })
  }

  protected async doCancel(_sessionId: string): Promise<void> {
    // 第三方实现取消
  }
}
