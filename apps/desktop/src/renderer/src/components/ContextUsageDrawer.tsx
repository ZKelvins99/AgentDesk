/**
 * 上下文用量抽屉（README 9.4.1 token 徽标 / M8）。
 * 点击会话头 token 徽标弹出，展示用量分解。
 */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

interface ContextUsage {
  used: number;
  limit: number;
  compactionThreshold: number;
  breakdown: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

interface ContextUsageDrawerProps {
  sessionId: string;
  onClose: () => void;
}

/** 格式化大数：>= 1000 显示 k */
function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function ContextUsageDrawer({
  sessionId,
  onClose,
}: ContextUsageDrawerProps): React.JSX.Element {
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await window.agentdesk.contextUsage({ sessionId });
      setUsage(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pct = usage ? Math.min(Math.round((usage.used / usage.limit) * 100), 100) : 0;
  const nearLimit = usage ? usage.used >= usage.compactionThreshold : false;

  return (
    <div
      className="context-drawer"
      role="dialog"
      aria-label="上下文用量"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="context-drawer-panel">
        <div className="context-drawer-header">
          <span className="context-drawer-title">上下文用量</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="context-drawer-close"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
        {error && <div className="context-drawer-error">{error}</div>}
        {usage && (
          <div className="context-drawer-body">
            <div className="context-usage-bar-wrap">
              <div
                className="context-usage-bar"
                data-near={nearLimit || undefined}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="context-usage-summary">
              <span className="context-usage-used">{fmt(usage.used)}</span>
              <span className="context-usage-sep"> / </span>
              <span className="context-usage-limit">{fmt(usage.limit)}</span>
              <span className="context-usage-pct"> ({pct}%)</span>
            </div>
            {nearLimit && (
              <div className="context-usage-warn">
                <Icon name="alert" size={13} /> 接近压缩阈值（{fmt(usage.compactionThreshold)}），pi
                将自动压缩上下文。
              </div>
            )}
            <table className="context-breakdown">
              <thead>
                <tr>
                  <th>分类</th>
                  <th>Token</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>输入</td>
                  <td>{fmt(usage.breakdown.input)}</td>
                </tr>
                <tr>
                  <td>输出</td>
                  <td>{fmt(usage.breakdown.output)}</td>
                </tr>
                <tr>
                  <td>缓存读</td>
                  <td>{fmt(usage.breakdown.cacheRead)}</td>
                </tr>
                <tr>
                  <td>缓存写</td>
                  <td>{fmt(usage.breakdown.cacheWrite)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
