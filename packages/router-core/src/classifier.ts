/** M20-T02: Task Classification（规则版，不上复杂 AI Router） */
export type TaskType =
  | "coding"
  | "document"
  | "spreadsheet"
  | "slides"
  | "research"
  | "data"
  | "general"

const RULES: Array<{ type: TaskType; keywords: string[] }> = [
  { type: "slides", keywords: ["ppt", "pptx", "幻灯片", "演示", "slides", "汇报 ppt"] },
  { type: "spreadsheet", keywords: ["xlsx", "excel", "表格", "电子表", "spreadsheet", "csv 分析", "数据表"] },
  { type: "document", keywords: ["docx", "word", "文档", "报告", "document", "mammoth", "doc"] },
  { type: "data", keywords: ["数据分析", "统计", "pandas", "dataset", "数据集", "图表", "chart", "csv"] },
  { type: "research", keywords: ["研究", "调研", "research", "搜集", "资料"] },
  { type: "coding", keywords: ["代码", "函数", "bug", "修复", "实现", "coding", "写个", "重构"] },
]

export class TaskClassifier {
  classify(text: string): TaskType {
    const lower = text.toLowerCase()
    // 长尾规则：slides/spreadsheet 优先于 data（"CSV 生成汇报 PPT" → slides）
    for (const rule of RULES) {
      if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) return rule.type
    }
    return "general"
  }
}
