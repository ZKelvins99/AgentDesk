import type { AgentCapabilities, RuntimeManifest } from "@agentdesk/runtime-protocol"

/** M22-T03: Runtime Manifest 构建器 */
export function createRuntimeManifest(input: {
  id: string
  displayName: string
  version?: string
  description?: string
  capabilities: AgentCapabilities
  supports?: Partial<RuntimeManifest["supports"]>
  upstream?: RuntimeManifest["upstream"]
}): RuntimeManifest {
  return {
    id: input.id,
    displayName: input.displayName,
    description: input.description,
    version: input.version ?? "0.1.0",
    upstream: input.upstream ?? { name: input.id },
    capabilities: input.capabilities,
    supports: {
      resume: input.supports?.resume ?? false,
      streaming: input.supports?.streaming ?? true,
      cancel: input.supports?.cancel ?? false,
      nativePermissions: input.supports?.nativePermissions ?? false,
      nativeExtensions: input.supports?.nativeExtensions ?? false,
    },
  }
}
