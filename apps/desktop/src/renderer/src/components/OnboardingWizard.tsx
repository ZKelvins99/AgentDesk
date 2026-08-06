import type { OnboardingStatus } from '@agentdesk/ipc';
import { useState } from 'react';
import { t } from '../i18n';

/**
 * 首次启动引导页（README 9.11 / 15）：
 * 三步（内核 → Provider → 完成），internal 完成后不再显示主界面。
 */
export function OnboardingWizard({
  status,
  onComplete,
}: {
  status: OnboardingStatus;
  onComplete: () => void;
}): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const finish = async (skip: boolean): Promise<void> => {
    setSaving(true);
    try {
      await window.agentdesk.onboarding.complete(
        skip
          ? {}
          : {
              ...(provider ? { provider } : {}),
              ...(apiKey ? { apiKey } : {}),
            },
      );
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding" role="dialog" aria-modal="true">
      <div className="onboarding-card">
        <div className="onboarding-title">{t('onboarding.welcome')}</div>
        <div className="onboarding-subtitle">{t('onboarding.subtitle')}</div>
        <div className="onboarding-steps">
          <div className={`onboarding-step ${step === 0 ? 'active' : ''}`}>
            <h3>{t('onboarding.step1Title')}</h3>
            <p>
              {status.kernelVersion
                ? t('onboarding.kernelVersion', { version: status.kernelVersion })
                : t('onboarding.step1Body')}
            </p>
            {status.kernelVersion ? <p className="muted">{t('onboarding.step1Body')}</p> : null}
          </div>
          <div className={`onboarding-step ${step === 1 ? 'active' : ''}`}>
            <h3>{t('onboarding.step2Title')}</h3>
            <p>{t('onboarding.step2Body')}</p>
            {step >= 1 && (
              <div className="onboarding-field">
                <input
                  className="field-input"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder={t('onboarding.providerPlaceholder')}
                />
                <input
                  className="field-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('onboarding.apiKeyPlaceholder')}
                />
              </div>
            )}
          </div>
          <div className={`onboarding-step ${step === 2 ? 'active' : ''}`}>
            <h3>{t('onboarding.step3Title')}</h3>
            <p>{t('onboarding.step3Done', { count: status.providerCount })}</p>
          </div>
        </div>
        <div className="onboarding-actions">
          <button
            type="button"
            className="btn-link"
            disabled={saving}
            onClick={() => void finish(true)}
          >
            {t('onboarding.skip')}
          </button>
          {step > 0 && (
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => setStep((s) => s - 1)}
            >
              {t('onboarding.back')}
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => setStep((s) => s + 1)}
            >
              {t('onboarding.next')}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => void finish(false)}
            >
              {saving ? t('onboarding.saving') : t('onboarding.finish')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
