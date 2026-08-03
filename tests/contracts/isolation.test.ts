/**
 * M01-T09 反耦合测试：platform-core 不依赖 Runtime SDK（静态检查源码）。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..", "..")
const FORBIDDEN = ["@opencode-ai/", "@earendil-works/", "vendor/opencode", "vendor/pi"]
const CORE_PACKAGES = ["platform-core", "registry-core", "event-bus", "runtime-protocol"]

test("平台核心包不 import Runtime SDK", () => {
  for (const pkg of CORE_PACKAGES) {
    const srcDir = join(ROOT, "packages", pkg, "src")
    for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".ts"))) {
      const content = readFileSync(join(srcDir, file), "utf8")
      for (const line of content.split("\n")) {
        if (!line.includes("import")) continue
        for (const pattern of FORBIDDEN) {
          assert.ok(!line.includes(pattern), `${pkg}/${file} 不得 import ${pattern}: ${line.trim()}`)
        }
      }
    }
  }
})