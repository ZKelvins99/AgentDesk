/**
 * OnboardingStore（README 9.11 / 15）：首次启动引导页状态。
 * 记录「已完成引导」标记，完成后不再拦截主界面。
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface OnboardingState {
  completed: boolean;
  completedAt: string | null;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class OnboardingStore {
  private readonly file: string;

  constructor(dataDir: string = path.join(homedir(), '.agentdesk')) {
    this.file = path.join(dataDir, 'onboarding.json');
  }

  state(): OnboardingState {
    const parsed = readJson(this.file);
    return {
      completed: parsed?.completed === true,
      completedAt: typeof parsed?.completedAt === 'string' ? parsed.completedAt : null,
    };
  }

  complete(): OnboardingState {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const next: OnboardingState = { completed: true, completedAt: new Date().toISOString() };
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.file);
    return next;
  }

  /** 测试/重置用。 */
  reset(): void {
    rmSync(this.file, { force: true });
  }
}
