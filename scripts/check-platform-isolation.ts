/**
 * M01-T09 / M22-T09 反耦合检查：
 * 平台核心包（platform-core / registry-core / event-bus / runtime-protocol）
 * 不得 import 任何 Runtime SDK（@opencode-ai/*、@earendil-works/*、pi、opencode）。
 * 运行：node scripts/check-platform-isolation.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

const FORBIDDEN = [
  "@opencode-ai/",
  "@earendil-works/",
  '"pi"',
  "'pi'",
  "@opencode-ai/sdk",
  "vendor/opencode",
  "vendor/pi",
]

const CORE_PACKAGES = ["platform-core", "registry-core", "event-bus", "runtime-protocol"]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      out.push(...walk(full))
    } else if (entry.name.endsWith(".ts")) {
      out.push(full)
    }
  }
  return out
}

function fail(where: string, line: string, pattern: string): void {
  console.error(`[FAIL] ${where} 匹配禁止依赖「${pattern}」:\n       ${line.trim()}`)
}

async function main(): Promise<number> {
  let failures = 0
  for (const pkg of CORE_PACKAGES) {
    const srcDir = join(ROOT, "packages", pkg, "src")
    if (!existsSync(srcDir)) continue
    for (const file of walk(srcDir)) {
      const content = readFileSync(file, "utf8")
      for (const line of content.split("\n")) {
        if (!line.includes("import")) continue
        for (const pattern of FORBIDDEN) {
          if (line.includes(pattern)) {
            fail(file.replace(ROOT + "\\", ""), line, pattern)
            failures++
          }
        }
      }
    }
  }
  if (failures > 0) {
    console.error(`\n反耦合检查失败：${failures} 处违规。`)
    return 1
  }
  console.log("反耦合检查通过：平台核心包未依赖 Runtime SDK。")
  return 0
}

main().then((code) => process.exit(code))