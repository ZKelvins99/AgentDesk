/**
 * MetricsStore（README 13.2）：用量/健康指标入库（metrics 表）。
 * 指标只增不删，聚合在诊断报告时按窗口读取。
 */
import type { AppDatabase } from '../storage';

export type MetricName =
  | 'session.created'
  | 'session.msg'
  | 'session.tokens'
  | 'mcp.call'
  | 'kernel.updated'
  | 'update.downloaded'
  | 'app.launch';

export class MetricsStore {
  private readonly inc;

  constructor(private readonly db: AppDatabase) {
    this.inc = this.db.sqlite.prepare(
      'INSERT INTO metrics (name, value, at) VALUES (?, ?, ?)',
    );
  }

  record(name: MetricName | string, value = 1, at = Date.now()): void {
    try {
      this.inc.run(name, value, at);
    } catch {
      // 指标写入失败不应影响主流程
    }
  }

  /** 聚合窗口内指标：返回 name → { count, sum, lastAt }。 */
  summary(since: number): Record<string, { count: number; sum: number; lastAt: number }> {
    const rows = this.db.sqlite
      .prepare('SELECT name, COUNT(*) as count, COALESCE(SUM(value),0) as sum, MAX(at) as lastAt FROM metrics WHERE at >= ? GROUP BY name')
      .all(since) as Array<{ name: string; count: number; sum: number; lastAt: number }>;
    const out: Record<string, { count: number; sum: number; lastAt: number }> = {};
    for (const r of rows) out[r.name] = { count: r.count, sum: r.sum, lastAt: r.lastAt };
    return out;
  }

  prune(before: number): number {
    const res = this.db.sqlite.prepare('DELETE FROM metrics WHERE at < ?').run(before);
    return res.changes;
  }
}
