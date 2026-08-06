import type { ApprovalMode } from '@agentdesk/shared';
import { useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { type I18nKey, t } from '../../i18n';
import type { SendMode } from '../../stores/session-store';
import { useSessionStore } from '../../stores/session-store';
import { useUiStore } from '../../stores/ui-store';
import { isRealModel, modelLabel } from '../../utils/model-label';

const MODE_KEYS: Record<ApprovalMode, I18nKey> = {
  plan: 'approval.modePlan',
  'read-only': 'approval.modeReadOnly',
  'auto-edit': 'approval.modeAutoEdit',
  'full-access': 'approval.modeFullAccess',
};

/**
 * Composer（README 9.5）：
 * 自增高输入（1-12 行）、⏎ 发送 / ⇧⏎ 换行、运行中 ■ 停止、steer/follow-up 状态徽标。
 */
export function Composer({
  status,
  pendingCount,
  model,
  approvalMode,
}: {
  status: 'idle' | 'streaming' | 'degraded' | 'error';
  pendingCount: number;
  model: string | null;
  approvalMode: ApprovalMode;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const openModelPicker = useUiStore((s) => s.openModelPicker);
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
      <div className="composer-box">
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
            <button
              type="button"
              className="composer-model chip chip-btn"
              data-unset={!isRealModel(model) || undefined}
              title={t('composer.modelSwitch')}
              onClick={openModelPicker}
            >
              {modelLabel(model)}
              <Icon name="chevronDown" size={12} />
            </button>
            <span className="composer-approval chip" data-mode={approvalMode}>
              {approvalMode === 'full-access' ? <Icon name="alert" size={13} /> : null}
              {t(MODE_KEYS[approvalMode])}
            </span>
          </div>
          <div className="composer-right">
            {isRunning ? (
              <button type="button" className="composer-stop" onClick={handleStop}>
                <Icon name="stop" size={13} />
                {t('composer.stop')}
              </button>
            ) : (
              <button
                type="button"
                className="composer-send"
                disabled={!text.trim()}
                onClick={() => void submit()}
                aria-label={t('composer.send')}
                title={t('composer.send')}
              >
                <Icon name="arrowUp" size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
