import { useRef, useState } from 'react';
import { t } from '../../i18n';
import type { SendMode } from '../../stores/session-store';
import { useSessionStore } from '../../stores/session-store';

/**
 * Composer（README 9.5）：
 * 自增高输入（1-12 行）、⏎ 发送 / ⇧⏎ 换行、运行中 ■ 停止、steer/follow-up 状态徽标。
 */
export function Composer({
  status,
  pendingCount,
  model,
}: {
  status: 'idle' | 'streaming' | 'degraded' | 'error';
  pendingCount: number;
  model: string | null;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isRunning = status === 'streaming';
  const hasQueue = pendingCount > 0;

  const submit = async () => {
    const value = text;
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    const mode = await useSessionStore.getState().send(value);
    if (mode === null && value.trim()) {
      // 发送失败：恢复文本，方便重试
      setText(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const handleStop = () => {
    void useSessionStore.getState().abort();
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 12 * 20)}px`;
  };

  const sendModeLabel: SendMode | null = isRunning ? 'steer' : hasQueue ? 'followUp' : null;

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        className="composer-input"
        placeholder={t('composer.placeholder')}
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          autoGrow(e.target);
        }}
        onKeyDown={handleKeyDown}
        aria-label={t('composer.placeholder')}
      />
      <div className="composer-toolbar">
        <div className="composer-left">
          {sendModeLabel ? (
            <span className={`composer-mode chip mode-${sendModeLabel}`}>
              {sendModeLabel === 'steer'
                ? t('composer.steering')
                : t('composer.queued', { n: pendingCount })}
            </span>
          ) : null}
          <span className="composer-model chip" title={model ?? ''}>
            {model ?? t('composer.modelChip', { model: t('composer.model') })}
          </span>
          <span className="composer-approval chip chip-warn">⚠ {t('composer.approvalFull')}</span>
        </div>
        <div className="composer-right">
          {isRunning ? (
            <button type="button" className="composer-stop" onClick={handleStop}>
              ■ {t('composer.stop')}
            </button>
          ) : (
            <button
              type="button"
              className="composer-send"
              disabled={!text.trim()}
              onClick={() => void submit()}
              aria-label={t('composer.send')}
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
