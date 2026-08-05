import type { TaskType } from "./classifier.ts"

/** M20-T05: 简单 Hybrid Workflow 步骤 */
export interface WorkflowStep {
  readonly agentId: string
  readonly task: string
  readonly dependsOnArtifact?: string
}

/**
 * 简单 Hybrid Workflow：按任务类型编排多 Agent 步骤。
 * 验收案例：用户"分析 CSV 并生成汇报 PPT" → Data Agent → analysis artifact → Slides Agent → presentation.pptx
 */
export function buildHybridWorkflow(taskType: TaskType): WorkflowStep[] {
  switch (taskType) {
    case "slides":
      // 验收案例：分析 CSV 并生成汇报 PPT → Data Agent → Slides Agent
      return [
        { agentId: "data", task: "分析数据并产出 analysis artifact" },
        { agentId: "work", task: "基于 analysis artifact 生成汇报 PPT" },
      ]
    case "data":
      return [
        { agentId: "data", task: "分析数据并产出 dataset/chart artifact" },
        { agentId: "slides", task: "基于 analysis artifact 生成汇报 PPT" },
      ]
    case "document":
      return [{ agentId: "work", task: "生成结构化文档" }]
    case "spreadsheet":
      return [
        { agentId: "data", task: "分析并整理表格数据" },
        { agentId: "work", task: "生成 spreadsheet artifact" },
      ]
    case "research":
      return [{ agentId: "research", task: "搜集资料并产出研究 artifact" }]
    default:
      return [{ agentId: "code", task: "处理任务" }]
  }
}
