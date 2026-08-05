import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import type { ExtensionManifest, ExtensionPermission } from "./manifest.ts"

/**
 * M21-T03: Extension Loader —— 扫描 .agentdesk/extensions/ 目录。
 * 目录结构：.agentdesk/extensions/<ext-id>/extension.json + entry
 */
export interface LoadedExtension {
  readonly manifest: ExtensionManifest
  readonly rootDir: string
}

export function loadExtensionsFromDir(dir: string): LoadedExtension[] {
  const out: LoadedExtension[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const extDir = join(dir, entry.name)
      const manifestFile = join(extDir, "extension.json")
      try {
        if (!statSync(manifestFile).isFile()) continue
        const raw = JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, unknown>
        if (typeof raw.id !== "string" || typeof raw.entry !== "string") continue
        const manifest: ExtensionManifest = {
          id: raw.id,
          name: String(raw.name ?? raw.id),
          version: String(raw.version ?? "0.0.0"),
          description: typeof raw.description === "string" ? raw.description : undefined,
          permissions: Array.isArray(raw.permissions) ? (raw.permissions as ExtensionPermission[]) : [],
          entry: raw.entry,
          enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
        }
        out.push({ manifest, rootDir: resolve(extDir) })
      } catch {
        // 无效 extension.json 跳过
      }
    }
  } catch {
    // 目录不存在 → 空
  }
  return out
}
