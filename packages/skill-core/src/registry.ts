import type { SkillDescriptor } from "@agentdesk/runtime-protocol"
import type { SkillManifest } from "./manifest.ts"

/** M17-T02: 平台 Skill（含 Manifest） */
export interface PlatformSkill extends SkillManifest {
  readonly id: string
  readonly source: "platform"
  readonly path: string
  readonly body: string
}

/** M17-T02: Skill Registry —— 统一管理 Platform / Native Skill，支持按来源过滤 */
export class SkillRegistry {
  private readonly skills = new Map<string, PlatformSkill>()

  register(skill: PlatformSkill): void {
    this.skills.set(skill.id, skill)
  }

  unregister(id: string): boolean {
    return this.skills.delete(id)
  }

  get(id: string): PlatformSkill | undefined {
    return this.skills.get(id)
  }

  list(): PlatformSkill[] {
    return [...this.skills.values()]
  }

  /** M17-T04: 合并 Native Skill 并输出统一 SkillDescriptor 视图（source 可区分） */
  describeAll(nativeSkills: readonly Omit<SkillDescriptor, "source">[]): SkillDescriptor[] {
    const platform: SkillDescriptor[] = this.list().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      source: "platform",
      version: s.version,
    }))
    const native: SkillDescriptor[] = nativeSkills.map((s) => ({ ...s, source: "native" as const }))
    return [...platform, ...native]
  }
}
