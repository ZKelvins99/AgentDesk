import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import type { PlatformSkill } from "./registry.ts"
import { parseSkillFrontmatter } from "./manifest.ts"

/**
 * M17-T03: Skill Loader —— 扫描 .agentdesk/skills/ 目录加载 SKILL.md。
 * 目录结构：.agentdesk/skills/<skill-name>/SKILL.md 或 .agentdesk/skills/<name>.md。
 */
export function loadSkillsFromDir(dir: string): PlatformSkill[] {
  const out: PlatformSkill[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const skillDir = join(dir, entry.name)
        const skillFile = join(skillDir, "SKILL.md")
        try {
          if (statSync(skillFile).isFile()) {
            const skill = loadSkillFile(skillFile, entry.name)
            if (skill) out.push(skill)
          }
        } catch {
          // 无 SKILL.md 的子目录跳过
        }
      } else if (entry.name.endsWith(".md")) {
        const skill = loadSkillFile(join(dir, entry.name), entry.name.replace(/\.md$/, ""))
        if (skill) out.push(skill)
      }
    }
  } catch {
    // 目录不存在 → 空
  }
  return out
}

function loadSkillFile(filePath: string, fallbackName: string): PlatformSkill | undefined {
  try {
    const markdown = readFileSync(filePath, "utf8")
    const { manifest, body } = parseSkillFrontmatter(markdown)
    if (!manifest) return undefined
    return {
      id: `platform-skill:${manifest.name}`,
      name: manifest.name,
      description: manifest.description ?? "",
      requiredCapabilities: manifest.requiredCapabilities,
      preferredAgents: manifest.preferredAgents,
      fallbackAgents: manifest.fallbackAgents,
      version: manifest.version,
      source: "platform",
      path: resolve(filePath),
      body,
    }
  } catch {
    return undefined
  }
}
