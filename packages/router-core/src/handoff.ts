/** M20-T04: Artifact Handoff —— Agent A 产出，Agent B 通过 URI 消费 */
export interface ArtifactHandoff {
  readonly artifactId: string
  readonly artifactUri: string
  readonly producedByAgent: string
  consumedByAgent?: string
  readonly at: string
}

export class HandoffRegistry {
  private readonly handoffs = new Map<string, ArtifactHandoff>()

  record(artifact: { id: string; uri: string }, producedByAgent: string): ArtifactHandoff {
    const handoff: ArtifactHandoff = {
      artifactId: artifact.id,
      artifactUri: artifact.uri,
      producedByAgent,
      at: new Date().toISOString(),
    }
    this.handoffs.set(artifact.id, handoff)
    return handoff
  }

  consume(artifactId: string, consumedByAgent: string): ArtifactHandoff | undefined {
    const handoff = this.handoffs.get(artifactId)
    if (!handoff) return undefined
    handoff.consumedByAgent = consumedByAgent
    return handoff
  }

  list(): ArtifactHandoff[] {
    return [...this.handoffs.values()]
  }
}
