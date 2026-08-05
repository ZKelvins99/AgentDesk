/** M20-T01: Hybrid Mode Switch */
export type HybridMode = "MODE_NATIVE_OPENCODE" | "MODE_NATIVE_PI" | "MODE_HYBRID"

export const HYBRID_MODES: readonly HybridMode[] = [
  "MODE_NATIVE_OPENCODE",
  "MODE_NATIVE_PI",
  "MODE_HYBRID",
]

export class ModeSwitch {
  private mode: HybridMode = "MODE_NATIVE_OPENCODE"

  switch(next: HybridMode): HybridMode {
    this.mode = next
    return this.mode
  }

  current(): HybridMode {
    return this.mode
  }

  get isHybrid(): boolean {
    return this.mode === "MODE_HYBRID"
  }
}
