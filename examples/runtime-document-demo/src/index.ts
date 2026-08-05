import { CAPABILITIES, type AgentCapabilities } from "@agentdesk/runtime-protocol"
import { BaseRuntime } from "@agentdesk/runtime-sdk"
import { documentCreateTool } from "@agentdesk/tool-core"

/** M23-T02: Document Agent Capability 声明 */
export interface DocumentCapabilities {
  readonly documents: boolean
  readonly pdf: boolean
  readonly spreadsheets: boolean
  readonly slides: boolean
  readonly terminal: boolean
}

export const DOCUMENT_CAPABILITIES: DocumentCapabilities = {
  documents: true,
  pdf: true,
  spreadsheets: true,
  slides: true,
  terminal: false,
}

/**
 * M23-T01: 专业文档 Agent 示例 —— 模拟未来接入一个文档 Runtime。
 * 复用 platform 文档工具（document/spreadsheet/slides），不改平台核心。
 */
export class DocumentDemoRuntime extends BaseRuntime {
  readonly id = "document-demo"
  readonly displayName = "Document Agent"
  private readonly workspacePath?: string

  constructor(workspacePath?: string) {
    super()
    this.workspacePath = workspacePath
  }

  capabilities(): AgentCapabilities {
    return {
      ids: [
        CAPABILITIES.SESSION_CREATE,
        CAPABILITIES.SESSION_STREAM,
        CAPABILITIES.ARTIFACT_EMIT,
      ],
      // M23-T02: 文档能力声明（供 Router/Profile 匹配）
      native: { ...DOCUMENT_CAPABILITIES },
    }
  }

  async doHealth(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: "document agent ready" }
  }

  protected async runTurn(sessionId: string, message: string): Promise<void> {
    const ws = this.workspacePath ?? "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace"
    const now = new Date().toISOString()
    this.emit({ type: "message.started", runtimeId: this.id, sessionId, messageId: "doc-1", at: now })
    // 按指令生成 DOCX（复用 platform.document.create）
    const title = extractTitle(message)
    const result = await documentCreateTool.execute(
      { workspacePath: ws, allowWrite: true },
      { title, paragraphs: [`由 Document Agent 生成：${message}`] },
    )
    const path = result.ok ? String((result.output as { path: string }).path) : undefined
    this.emit({
      type: "artifact.emitted",
      runtimeId: this.id,
      sessionId,
      artifact: {
        id: `art-doc-${Date.now()}`,
        kind: "docx",
        name: `${title}.docx`,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        uri: path ? `file:///${path.replace(/\\/g, "/")}` : "file:///none",
        createdAt: now,
        createdBy: this.id,
        parentIds: [],
      },
      at: now,
    })
    const reply = result.ok ? `已生成文档：${title}.docx` : `生成失败：${result.error}`
    this.emit({ type: "message.delta", runtimeId: this.id, sessionId, messageId: "doc-1", delta: reply, at: now })
    this.emit({ type: "message.completed", runtimeId: this.id, sessionId, messageId: "doc-1", text: reply, at: now })
    this.emit({ type: "session.idle", runtimeId: this.id, sessionId, at: now })
  }

  protected async doCancel(_sessionId: string): Promise<void> {}
}

function extractTitle(message: string): string {
  const match = /(?:生成|制作|输出)?\s*([\u4e00-\u9fffA-Za-z0-9_-]{2,20})/.exec(message)
  return match?.[1] ?? "report"
}
