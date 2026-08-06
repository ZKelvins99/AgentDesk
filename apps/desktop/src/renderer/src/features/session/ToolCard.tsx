import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import type { UiMessage } from './message-model';

/** 工具卡（README 9.4.2 #4-8）：单行头 + 可展开参数/结果/输出。 */
export function ToolCard({
  message,
}: {
  message: Extract<UiMessage, { kind: 'tool' }>;
}): React.JSX.Element {
  const [open, setOpen] = useState(message.expanded);
  useEffect(() => {
    if (message.status === 'running') setOpen(true);
  }, [message.status]);

  const statusLabel =
    message.status === 'running'
      ? t('session.toolRunning')
      : message.status === 'ok'
        ? t('session.toolDone')
        : t('session.toolError');

  return (
    <div className={`tool-card tool-${message.status}`} data-open={open}>
      <button
        type="button"
        className="tool-card-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-caret">{open ? '▾' : '▸'}</span>
        <span className="tool-icon">⌗</span>
        <span className="tool-name">{message.toolName}</span>
        <span className="tool-summary">{summarizeArgs(message.args)}</span>
        <span className="tool-status" data-status={message.status}>
          {message.status === 'running' ? <span className="spinner" /> : null}
          {statusLabel}
          {message.ms !== undefined && message.status !== 'running' ? ` · ${message.ms}ms` : ''}
        </span>
      </button>
      {open ? (
        <div className="tool-card-body">
          <div className="tool-section">
            <div className="tool-section-label">args</div>
            <pre className="tool-pre">{JSON.stringify(message.args, null, 2)}</pre>
          </div>
          {message.output ? (
            <div className="tool-section">
              <div className="tool-section-label">output</div>
              <pre className="tool-pre tool-output">{message.output}</pre>
            </div>
          ) : null}
          {message.result !== undefined ? (
            <div className="tool-section">
              <div className="tool-section-label">result</div>
              <pre className="tool-pre">{formatResult(message.result)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function summarizeArgs(args: unknown): string {
  if (args && typeof args === 'object') {
    const obj = args as Record<string, unknown>;
    const entries = Object.entries(obj)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ');
    return entries;
  }
  return String(args);
}

function formatResult(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}
