/** M17-T01: Platform Skill Manifest（SKILL.md frontmatter） */
export interface SkillManifest {
  readonly name: string
  readonly description: string
  readonly requiredCapabilities?: readonly string[]
  readonly preferredAgents?: readonly string[]
  readonly fallbackAgents?: readonly string[]
  readonly version?: string
  readonly [key: string]: unknown
}

/**
 * 解析 SKILL.md 的 YAML frontmatter（--- ... ---）。
 * 极简解析：支持 string / number / boolean / string[]，足够覆盖 Skill manifest。
 */
export function parseSkillFrontmatter(markdown: string): { manifest?: SkillManifest; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown)
  if (!match) return { body: markdown }
  const raw = match[1]
  const body = match[2] ?? ""
  try {
    const manifest = parseYamlLike(raw) as SkillManifest
    if (!manifest.name) return { body: markdown }
    return { manifest, body }
  } catch {
    return { body: markdown }
  }
}

function parseYamlLike(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const lines = raw.split(/\r?\n/)
  let currentKey: string | undefined
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const listItem = /^-\s+(.+)$/.exec(trimmed)
    if (listItem && currentKey) {
      const list = (out[currentKey] as string[] | undefined) ?? []
      list.push(listItem[1].trim())
      out[currentKey] = list
      continue
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(trimmed)
    if (kv) {
      currentKey = kv[1]
      out[currentKey] = parseScalar(kv[2].trim())
    }
  }
  return out
}

function parseScalar(value: string): string | number | boolean | null {
  if (value === "") return null
  if (value === "true") return true
  if (value === "false") return false
  const num = Number(value)
  if (value !== "" && Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(value)) return num
  return value
}
