/** M13-T05: Platform Tool 权限核心 —— 平台工具统一过这里；Native Tool 仍走 Native Permission Engine */
export type PermissionDecision = "allow" | "deny" | "ask"

export interface PermissionRule {
  readonly pattern: string
  readonly decision: PermissionDecision
}

export interface PermissionRequest {
  readonly toolId: string
  readonly action: string
  readonly input: Record<string, unknown>
}

export class PermissionCore {
  private readonly rules: PermissionRule[] = []

  addRule(rule: PermissionRule): void {
    this.rules.push(rule)
  }

  setRules(rules: readonly PermissionRule[]): void {
    this.rules.length = 0
    this.rules.push(...rules)
  }

  /**
   * 判断工具是否允许执行。
   * 规则按 pattern 匹配 toolId；无规则命中时默认 allow（Native 工具不走这里）。
   */
  check(request: PermissionRequest): PermissionDecision {
    for (const rule of this.rules) {
      if (matchPattern(rule.pattern, request.toolId)) {
        return rule.decision
      }
    }
    return "allow"
  }

  /** 一次性询问结果提交（ask → 最终决策） */
  resolve(askId: string, decision: "allow" | "deny"): void {
    void askId
    void decision
    // 预留：ask 流程由 UI/Broker 持有，此处保持最小实现
  }
}

export function matchPattern(pattern: string, value: string): boolean {
  if (pattern === value) return true
  if (pattern === "*") return true
  // 简单通配：platform.file.*
  const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$")
  return regex.test(value)
}
