import type {
  ProviderApi,
  ProviderAuthMethod,
  ProviderConfigInput,
  ProviderPreset,
  ProviderView,
} from '@agentdesk/ipc';
import { useEffect, useState } from 'react';
import { type I18nKey, t } from '../i18n';
import { useProviderStore } from '../stores/provider-store';
import { useUiStore } from '../stores/ui-store';

const API_OPTIONS: Array<{ value: ProviderApi; label: string }> = [
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'google-generative-ai', label: 'Google Generative AI' },
  { value: 'azure-openai-responses', label: 'Azure OpenAI (internal)' },
  { value: 'openai-codex-responses', label: 'OpenAI Codex (internal)' },
  { value: 'bedrock-converse-stream', label: 'Bedrock Converse (internal)' },
  { value: 'google-vertex', label: 'Google Vertex (internal)' },
  { value: 'mistral-conversations', label: 'Mistral (internal)' },
  { value: 'pi-messages', label: 'Pi Messages (internal)' },
];

const AUTH_METHODS: Array<{ value: ProviderAuthMethod; label: I18nKey }> = [
  { value: 'api-key', label: 'provider.authApiKey' },
  { value: 'env', label: 'provider.authEnv' },
  { value: 'shell', label: 'provider.authShell' },
  { value: 'none', label: 'provider.authNone' },
  { value: 'oauth', label: 'provider.authOAuth' },
];

interface ModelRow {
  rowKey: string;
  id: string;
  name: string;
  contextWindow: string;
  maxTokens: string;
  reasoning: boolean;
}

interface FormState {
  name: string;
  baseUrl: string;
  api: ProviderApi;
  authMethod: ProviderAuthMethod;
  apiKey: string;
  apiKeyRef: string;
  authHeader: boolean;
  supportsDeveloperRole: boolean;
  supportsReasoningEffort: boolean;
  headers: Array<{ rowKey: string; name: string; value: string }>;
  models: ModelRow[];
}

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  return `row-${rowKeySeq}`;
}

function emptyForm(): FormState {
  return {
    name: '',
    baseUrl: '',
    api: 'openai-completions',
    authMethod: 'api-key',
    apiKey: '',
    apiKeyRef: '',
    authHeader: true,
    supportsDeveloperRole: true,
    supportsReasoningEffort: true,
    headers: [],
    models: [],
  };
}

function formFromView(view: ProviderView | null): FormState {
  if (!view) return emptyForm();
  return {
    name: view.name,
    baseUrl: view.baseUrl ?? '',
    api: view.api ?? 'openai-completions',
    authMethod: view.authMethod,
    apiKey: '',
    apiKeyRef: view.apiKeyRef ?? '',
    authHeader: view.authHeader,
    supportsDeveloperRole: view.compat.supportsDeveloperRole ?? true,
    supportsReasoningEffort: view.compat.supportsReasoningEffort ?? true,
    headers: Object.entries(view.headers ?? {}).map(([name, value]) => ({
      rowKey: nextRowKey(),
      name,
      value,
    })),
    models: view.models.map((m) => ({
      rowKey: nextRowKey(),
      id: m.id,
      name: m.name ?? '',
      contextWindow: m.contextWindow !== undefined ? String(m.contextWindow) : '',
      maxTokens: m.maxTokens !== undefined ? String(m.maxTokens) : '',
      reasoning: m.reasoning ?? false,
    })),
  };
}

function formToConfig(form: FormState): ProviderConfigInput {
  const compat: { supportsDeveloperRole?: boolean; supportsReasoningEffort?: boolean } = {};
  if (form.supportsDeveloperRole !== undefined)
    compat.supportsDeveloperRole = form.supportsDeveloperRole;
  if (form.supportsReasoningEffort !== undefined)
    compat.supportsReasoningEffort = form.supportsReasoningEffort;
  const headers = Object.fromEntries(
    form.headers.filter((h) => h.name.trim()).map((h) => [h.name.trim(), h.value]),
  );
  const models = form.models
    .filter((m) => m.id.trim())
    .map((m) => ({
      id: m.id.trim(),
      ...(m.name.trim() ? { name: m.name.trim() } : {}),
      ...(m.contextWindow.trim() ? { contextWindow: Number(m.contextWindow) } : {}),
      ...(m.maxTokens.trim() ? { maxTokens: Number(m.maxTokens) } : {}),
      ...(m.reasoning ? { reasoning: true } : {}),
    }));
  return {
    name: form.name.trim(),
    authMethod: form.authMethod,
    ...(form.baseUrl.trim() ? { baseUrl: form.baseUrl.trim() } : {}),
    ...(form.api ? { api: form.api } : {}),
    ...(form.authMethod === 'env' || form.authMethod === 'shell'
      ? form.apiKeyRef.trim()
        ? { apiKeyRef: form.apiKeyRef.trim() }
        : {}
      : {}),
    ...(form.authHeader !== undefined ? { authHeader: form.authHeader } : {}),
    ...(form.supportsDeveloperRole !== undefined || form.supportsReasoningEffort !== undefined
      ? { compat }
      : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(models.length > 0 ? { models } : {}),
  };
}

/** Provider 设置（README 8.6.3）：内置目录 + 自定义 CRUD + 密钥 + 预设 + 发现 + 连通测试 + OAuth。 */
export function ProviderSettings(): React.JSX.Element | null {
  const open = useUiStore((s) => s.providerSettingsOpen);
  const close = useUiStore((s) => s.closeProviderSettings);
  const providers = useProviderStore((s) => s.providers);
  const presets = useProviderStore((s) => s.presets);
  const secretsStatus = useProviderStore((s) => s.secretsStatus);
  const authStatus = useProviderStore((s) => s.authStatus);
  const loadProviders = useProviderStore((s) => s.loadProviders);
  const saveProvider = useProviderStore((s) => s.saveProvider);
  const deleteProvider = useProviderStore((s) => s.deleteProvider);
  const refreshSecrets = useProviderStore((s) => s.refreshSecrets);
  const refreshAuth = useProviderStore((s) => s.refreshAuth);
  const launchLogin = useProviderStore((s) => s.launchLogin);

  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [presetId, setPresetId] = useState('');

  useEffect(() => {
    if (!open) return;
    void loadProviders();
    void refreshSecrets();
    void refreshAuth();
    setSelected(null);
    setForm(emptyForm());
    setError(null);
    setNotice(null);
    setTestResult(null);
  }, [open, loadProviders, refreshSecrets, refreshAuth]);

  useEffect(() => {
    if (!selected) return;
    const view = providers.find((p) => p.name === selected) ?? null;
    setForm(formFromView(view));
    setError(null);
    setTestResult(null);
  }, [selected, providers]);

  if (!open) return null;

  const filtered = providers.filter((p) => {
    const q = search.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q);
  });

  const patch = (part: Partial<FormState>): void => setForm((f) => ({ ...f, ...part }));

  const updateHeader = (i: number, part: Partial<{ name: string; value: string }>): void => {
    const cur = form.headers[i];
    if (!cur) return;
    const headers = [...form.headers];
    headers[i] = {
      rowKey: cur.rowKey,
      name: part.name ?? cur.name,
      value: part.value ?? cur.value,
    };
    patch({ headers });
  };

  const updateModel = (i: number, part: Partial<ModelRow>): void => {
    const cur = form.models[i];
    if (!cur) return;
    const models = [...form.models];
    models[i] = {
      rowKey: cur.rowKey,
      id: part.id ?? cur.id,
      name: part.name ?? cur.name,
      contextWindow: part.contextWindow ?? cur.contextWindow,
      maxTokens: part.maxTokens ?? cur.maxTokens,
      reasoning: part.reasoning ?? cur.reasoning,
    };
    patch({ models });
  };

  const applyPreset = (id: string): void => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    const cfg = preset.config;
    setForm({
      name: cfg.name,
      baseUrl: cfg.baseUrl ?? '',
      api: cfg.api ?? 'openai-completions',
      authMethod: cfg.authMethod,
      apiKey: '',
      apiKeyRef: cfg.apiKeyRef ?? '',
      authHeader: cfg.authHeader ?? true,
      supportsDeveloperRole: cfg.compat?.supportsDeveloperRole ?? true,
      supportsReasoningEffort: cfg.compat?.supportsReasoningEffort ?? true,
      headers: Object.entries(cfg.headers ?? {}).map(([name, value]) => ({
        rowKey: nextRowKey(),
        name,
        value,
      })),
      models: (cfg.models ?? []).map((m) => ({
        rowKey: nextRowKey(),
        id: m.id,
        name: m.name ?? '',
        contextWindow: m.contextWindow !== undefined ? String(m.contextWindow) : '',
        maxTokens: m.maxTokens !== undefined ? String(m.maxTokens) : '',
        reasoning: m.reasoning ?? false,
      })),
    });
    setSelected(null);
    setNotice(t('provider.presetApplied', { label: preset.label }));
  };

  const discover = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { models } = await window.agentdesk.provider.discoverModels({
        baseUrl: form.baseUrl.trim(),
        api: form.api,
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      });
      const existing = new Set(form.models.map((m) => m.id));
      const merged = [...form.models];
      for (const m of models) {
        if (!existing.has(m.id)) {
          merged.push({
            rowKey: nextRowKey(),
            id: m.id,
            name: m.name ?? '',
            contextWindow: '',
            maxTokens: '',
            reasoning: false,
          });
        }
      }
      patch({ models: merged });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const test = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await window.agentdesk.provider.test({ name: form.name.trim() });
      setTestResult(
        res.ok
          ? t('provider.testOk', {
              status: String(res.status ?? '?'),
              ms: String(res.latencyMs ?? '?'),
            })
          : t('provider.testFail', { err: res.error ?? String(res.status ?? '?') }),
      );
    } catch (err) {
      setTestResult(
        t('provider.testFail', { err: err instanceof Error ? err.message : String(err) }),
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const config = formToConfig(form);
      const apiKey =
        form.authMethod === 'api-key' && form.apiKey.trim() ? form.apiKey.trim() : undefined;
      await saveProvider(config, apiKey);
      setSelected(config.name);
      setNotice(t('provider.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await deleteProvider(selected);
      setSelected(null);
      setForm(emptyForm());
      setNotice(t('provider.deleted'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const doLaunchLogin = async (): Promise<void> => {
    await launchLogin();
    setTimeout(() => void refreshAuth(), 1_000);
  };

  const authFor = authStatus?.find((a) => a.name === form.name);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('provider.settings')}
    >
      <div className="modal-card provider-settings">
        <div className="provider-settings-header">
          <div className="model-picker-title">{t('provider.settings')}</div>
          <button type="button" className="modal-close" onClick={close} aria-label="close">
            ✕
          </button>
        </div>
        <div className="provider-settings-body">
          <div className="provider-sidebar">
            <input
              className="model-search"
              placeholder={t('provider.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="provider-sidebar-list">
              <button
                type="button"
                className="provider-sidebar-item"
                data-active={selected === null}
                onClick={() => {
                  setSelected(null);
                  setForm(emptyForm());
                }}
              >
                <span className="provider-sidebar-name">＋ {t('provider.custom')}</span>
              </button>
              {filtered.map((p) => (
                <button
                  type="button"
                  key={p.name}
                  className="provider-sidebar-item"
                  data-active={selected === p.name}
                  onClick={() => setSelected(p.name)}
                >
                  <span className="provider-sidebar-name">{p.name}</span>
                  <span className="provider-sidebar-tags">
                    <span className="model-tag">
                      {p.builtin ? t('provider.builtin') : t('provider.custom')}
                    </span>
                    {p.hasSecret ? (
                      <span className="provider-key-dot" title={t('provider.apiKeyConfigured')} />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="provider-form">
            <div className="provider-field-row">
              <label className="provider-field">
                <span>{t('provider.name')}</span>
                <input value={form.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="provider-field">
                <span>{t('provider.api')}</span>
                <select
                  value={form.api}
                  onChange={(e) => patch({ api: e.target.value as ProviderApi })}
                >
                  {API_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="provider-field">
              <span>{t('provider.baseUrl')}</span>
              <input
                value={form.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
                placeholder="https://…"
              />
            </label>

            <div className="provider-field">
              <span>{t('provider.authMethod')}</span>
              <div className="auth-method-row">
                {AUTH_METHODS.map((m) => (
                  <label key={m.value} className="auth-method-option">
                    <input
                      type="radio"
                      name="authMethod"
                      checked={form.authMethod === m.value}
                      onChange={() => patch({ authMethod: m.value })}
                    />
                    {t(m.label)}
                  </label>
                ))}
              </div>
            </div>

            {form.authMethod === 'api-key' ? (
              <label className="provider-field">
                <span>
                  {t('provider.apiKey')}
                  {providers.find((p) => p.name === form.name)?.hasSecret ? (
                    <em className="provider-key-hint"> · {t('provider.apiKeyConfigured')}</em>
                  ) : null}
                </span>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => patch({ apiKey: e.target.value })}
                  placeholder="sk-…"
                />
              </label>
            ) : null}

            {form.authMethod === 'env' || form.authMethod === 'shell' ? (
              <label className="provider-field">
                <span>{t('provider.apiKeyRef')}</span>
                <input
                  value={form.apiKeyRef}
                  onChange={(e) => patch({ apiKeyRef: e.target.value })}
                  placeholder={form.authMethod === 'env' ? '$MY_KEY' : '!op read …'}
                />
              </label>
            ) : null}

            {form.authMethod === 'none' ? (
              <p className="provider-hint">{t('provider.keylessHint')}</p>
            ) : null}

            <label className="provider-check">
              <input
                type="checkbox"
                checked={form.authHeader}
                onChange={(e) => patch({ authHeader: e.target.checked })}
              />
              {t('provider.authHeader')}
            </label>

            <div className="provider-field">
              <span>{t('provider.compat')}</span>
              <label className="provider-check">
                <input
                  type="checkbox"
                  checked={form.supportsDeveloperRole}
                  onChange={(e) => patch({ supportsDeveloperRole: e.target.checked })}
                />
                {t('provider.compatDeveloperRole')}
              </label>
              <label className="provider-check">
                <input
                  type="checkbox"
                  checked={form.supportsReasoningEffort}
                  onChange={(e) => patch({ supportsReasoningEffort: e.target.checked })}
                />
                {t('provider.compatReasoningEffort')}
              </label>
            </div>

            <div className="provider-field">
              <span>{t('provider.headers')}</span>
              {form.headers.map((h, i) => (
                <div key={h.rowKey} className="header-row">
                  <input
                    placeholder={t('provider.headerName')}
                    value={h.name}
                    onChange={(e) => updateHeader(i, { name: e.target.value })}
                  />
                  <input
                    placeholder={t('provider.headerValue')}
                    value={h.value}
                    onChange={(e) => updateHeader(i, { value: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => patch({ headers: form.headers.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  patch({
                    headers: [...form.headers, { rowKey: nextRowKey(), name: '', value: '' }],
                  })
                }
              >
                ＋ {t('provider.headerName')}
              </button>
            </div>

            <div className="provider-field">
              <span>{t('provider.models')}</span>
              <div className="models-table">
                {form.models.map((m, i) => (
                  <div key={m.rowKey} className="model-edit-row">
                    <input
                      placeholder={t('provider.modelId')}
                      value={m.id}
                      onChange={(e) => updateModel(i, { id: e.target.value })}
                    />
                    <input
                      placeholder={t('provider.modelName')}
                      value={m.name}
                      onChange={(e) => updateModel(i, { name: e.target.value })}
                    />
                    <input
                      placeholder={t('provider.contextWindow')}
                      value={m.contextWindow}
                      onChange={(e) => updateModel(i, { contextWindow: e.target.value })}
                    />
                    <input
                      placeholder={t('provider.maxTokens')}
                      value={m.maxTokens}
                      onChange={(e) => updateModel(i, { maxTokens: e.target.value })}
                    />
                    <label className="provider-check" title={t('provider.reasoning')}>
                      <input
                        type="checkbox"
                        checked={m.reasoning}
                        onChange={(e) => updateModel(i, { reasoning: e.target.checked })}
                      />
                      {t('provider.reasoning')}
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => patch({ models: form.models.filter((_, j) => j !== i) })}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="provider-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    patch({
                      models: [
                        ...form.models,
                        {
                          rowKey: nextRowKey(),
                          id: '',
                          name: '',
                          contextWindow: '',
                          maxTokens: '',
                          reasoning: false,
                        },
                      ],
                    })
                  }
                >
                  ＋ {t('provider.modelId')}
                </button>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => void discover()}
                  disabled={busy}
                >
                  {t('provider.discover')}
                </button>
              </div>
            </div>

            <div className="provider-actions">
              <label className="preset-select">
                <select
                  value={presetId}
                  onChange={(e) => {
                    setPresetId(e.target.value);
                    applyPreset(e.target.value);
                  }}
                >
                  <option value="">{t('provider.presets')}…</option>
                  {presets.map((p: ProviderPreset) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void test()}
                disabled={busy || !form.name.trim()}
              >
                {t('provider.test')}
              </button>
              {form.authMethod === 'oauth' ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void doLaunchLogin()}
                >
                  {t('provider.oauthLogin')}
                </button>
              ) : null}
              <button
                type="button"
                className="primary-btn"
                onClick={() => void save()}
                disabled={busy || !form.name.trim()}
              >
                {t('provider.save')}
              </button>
              {selected ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => void remove()}
                  disabled={busy}
                >
                  {t('provider.delete')}
                </button>
              ) : null}
            </div>

            {notice ? <div className="provider-notice">{notice}</div> : null}
            {error ? <div className="provider-error">{error}</div> : null}
            {testResult ? <div className="provider-test-result">{testResult}</div> : null}

            {authFor ? (
              <div className="provider-auth-status">
                <span>{t('provider.authStatus')}</span>
                <span data-configured={authFor.configured}>
                  {authFor.configured
                    ? t('provider.authConfigured')
                    : t('provider.authNotConfigured')}
                </span>
                <span>
                  {' · '}
                  {authFor.via === 'agentdesk'
                    ? t('provider.authViaAgentdesk')
                    : t('provider.authViaPi')}
                </span>
              </div>
            ) : null}

            <div className="provider-secrets-status">
              {secretsStatus
                ? secretsStatus.available
                  ? t('provider.secretsAvailable') +
                    ' · ' +
                    t('provider.secretsEntries', { n: String(secretsStatus.entries.length) })
                  : t('provider.secretsUnavailable')
                : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
