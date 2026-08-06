import type { ConfigValidationIssue, KernelStatus } from '@agentdesk/ipc';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { useUiStore } from '../stores/ui-store';

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'max'] as const;

const NAV: Array<{ id: string; label: string }> = [
  { id: 'general', label: '常规' },
  { id: 'kernel', label: 'Agent 内核' },
  { id: 'providers', label: '供应商' },
  { id: 'models', label: '模型' },
  { id: 'secrets', label: '密钥与登录' },
  { id: 'thinking', label: '思考与压缩' },
  { id: 'network', label: '重试与网络' },
  { id: 'approval', label: '权限与审批' },
  { id: 'skill', label: 'Skill' },
  { id: 'mcp', label: 'MCP' },
  { id: 'packages', label: 'Pi Package' },
  { id: 'agentdesk-plugins', label: 'AgentDesk 插件' },
  { id: 'prompts', label: 'Prompt 与主题' },
  { id: 'shell', label: 'Shell 与工具' },
  { id: 'storage', label: '会话与存储' },
  { id: 'advanced', label: '高级' },
];

interface SettingField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'array';
  options?: readonly string[];
  placeholder?: string;
  hint?: string;
}

const FORM_FIELDS: Record<string, SettingField[]> = {
  models: [
    { key: 'defaultProvider', label: '默认 Provider', type: 'string', placeholder: '如 anthropic' },
    { key: 'defaultModel', label: '默认模型', type: 'string', placeholder: '如 claude-sonnet-4' },
    {
      key: 'defaultThinkingLevel',
      label: '默认思考强度',
      type: 'select',
      options: THINKING_LEVELS,
    },
    { key: 'enabledModels', label: 'enabledModels（Ctrl+P 循环，每行一个 glob）', type: 'array' },
  ],
  thinking: [
    { key: 'hideThinkingBlock', label: '隐藏思考块', type: 'boolean' },
    { key: 'thinkingBudgets.minimal', label: 'thinkingBudgets.minimal', type: 'number' },
    { key: 'thinkingBudgets.low', label: 'thinkingBudgets.low', type: 'number' },
    { key: 'thinkingBudgets.medium', label: 'thinkingBudgets.medium', type: 'number' },
    { key: 'thinkingBudgets.high', label: 'thinkingBudgets.high', type: 'number' },
    { key: 'compaction.enabled', label: 'compaction.enabled', type: 'boolean' },
    { key: 'compaction.reserveTokens', label: 'compaction.reserveTokens', type: 'number' },
    { key: 'compaction.keepRecentTokens', label: 'compaction.keepRecentTokens', type: 'number' },
    { key: 'branchSummary.reserveTokens', label: 'branchSummary.reserveTokens', type: 'number' },
    { key: 'branchSummary.skipPrompt', label: 'branchSummary.skipPrompt', type: 'boolean' },
  ],
  network: [
    { key: 'retry.enabled', label: 'retry.enabled', type: 'boolean' },
    { key: 'retry.maxRetries', label: 'retry.maxRetries', type: 'number' },
    { key: 'retry.baseDelayMs', label: 'retry.baseDelayMs', type: 'number' },
    { key: 'retry.provider.timeoutMs', label: 'retry.provider.timeoutMs', type: 'number' },
    { key: 'retry.provider.maxRetries', label: 'retry.provider.maxRetries', type: 'number' },
    {
      key: 'retry.provider.maxRetryDelayMs',
      label: 'retry.provider.maxRetryDelayMs',
      type: 'number',
    },
    {
      key: 'httpProxy',
      label: 'httpProxy（仅全局）',
      type: 'string',
      placeholder: 'http://127.0.0.1:7890',
    },
    {
      key: 'transport',
      label: 'transport',
      type: 'select',
      options: ['sse', 'websocket', 'websocket-cached', 'auto'],
    },
    { key: 'httpIdleTimeoutMs', label: 'httpIdleTimeoutMs', type: 'number' },
    { key: 'websocketConnectTimeoutMs', label: 'websocketConnectTimeoutMs', type: 'number' },
  ],
  prompts: [
    {
      key: 'prompts',
      label: 'prompts（每行一个路径/glob）',
      type: 'array',
      hint: '[]=全不加载；支持 !排除 / +强制 / -排除',
    },
    {
      key: 'themes',
      label: 'themes（每行一个路径/glob）',
      type: 'array',
      hint: '[]=全不加载；支持 !排除 / +强制 / -排除',
    },
  ],
  shell: [
    {
      key: 'shellPath',
      label: 'shellPath',
      type: 'string',
      placeholder: '如 C:/Program Files/Git/bin/bash.exe',
    },
    { key: 'shellCommandPrefix', label: 'shellCommandPrefix', type: 'string' },
    { key: 'npmCommand', label: 'npmCommand（每行一个参数）', type: 'array' },
  ],
  storage: [
    {
      key: 'sessionDir',
      label: 'sessionDir（会话存储目录）',
      type: 'string',
      placeholder: '如 ~/.pi/agent/sessions',
    },
  ],
};

function getPath(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setPath(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const parts = key.split('.');
  const next: Record<string, unknown> = { ...obj };
  let cur = next;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (part === undefined) return next;
    const existing = cur[part];
    cur[part] =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cur = cur[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (last !== undefined) cur[last] = value;
  return next;
}

function arrayToText(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join('\n') : '';
}

function textToArray(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: unknown;
  onChange: (value: unknown) => void;
}): React.JSX.Element {
  if (field.type === 'boolean') {
    return (
      <label className="settings-field settings-field-check">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <label className="settings-field">
        <span>{field.label}</span>
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">（未设置）</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === 'array') {
    return (
      <label className="settings-field">
        <span>
          {field.label}
          {field.hint ? <em className="settings-hint">（{field.hint}）</em> : null}
        </span>
        <textarea
          className="settings-array-input"
          value={arrayToText(value)}
          spellCheck={false}
          placeholder={field.placeholder}
          onChange={(e) => onChange(textToArray(e.target.value))}
        />
      </label>
    );
  }
  return (
    <label className="settings-field">
      <span>{field.label}</span>
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value === undefined || value === null ? '' : String(value)}
        placeholder={field.placeholder}
        spellCheck={false}
        onChange={(e) => {
          if (field.type === 'number') {
            onChange(e.target.value === '' ? undefined : Number(e.target.value));
          } else {
            onChange(e.target.value || undefined);
          }
        }}
      />
    </label>
  );
}

function SettingsFormPage({
  fields,
  workspacePath,
}: {
  fields: SettingField[];
  workspacePath: string;
}): React.JSX.Element {
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const r = await window.agentdesk.settings.read({
      file: 'settings',
      scope,
      ...(scope === 'project' && workspacePath ? { workspacePath } : {}),
    });
    setDraft(r.parsed);
    setStatus('已加载');
  }, [scope, workspacePath]);

  useEffect(() => {
    void load();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [load]);

  const scheduleSave = (next: Record<string, unknown>): void => {
    setStatus('保存中…');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void window.agentdesk.settings
        .save({
          file: 'settings',
          scope,
          parsed: next,
          ...(scope === 'project' && workspacePath ? { workspacePath } : {}),
        })
        .then((r) => {
          if (r.saved) setStatus('已保存');
          else if (r.validation[0]) {
            setStatus(`保存被拒绝：${r.validation[0].path} ${r.validation[0].message}`);
          } else setStatus('保存失败');
        })
        .catch((err) => setStatus(`保存失败：${err instanceof Error ? err.message : String(err)}`));
    }, 300);
  };

  const change = (field: SettingField, value: unknown): void => {
    const next = setPath(draft, field.key, value);
    setDraft(next);
    scheduleSave(next);
  };

  return (
    <div className="settings-page">
      <div className="settings-toolbar">
        <span className="settings-toolbar-status">{status}</span>
        <select
          className="settings-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as 'global' | 'project')}
        >
          <option value="global">全局（~/.pi/agent/settings.json）</option>
          <option value="project" disabled={!workspacePath}>
            项目（.pi/settings.json，需打开工作区会话）
          </option>
        </select>
      </div>
      {scope === 'project' && !workspacePath ? (
        <div className="settings-empty">打开工作区会话后可编辑项目设置。</div>
      ) : (
        <div className="settings-fields">
          {fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={getPath(draft, field.key)}
              onChange={(v) => change(field, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RawConfigPage({ workspacePath }: { workspacePath: string }): React.JSX.Element {
  const [file, setFile] = useState<'settings' | 'models'>('settings');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [raw, setRaw] = useState('');
  const [path, setPathName] = useState('');
  const [validation, setValidation] = useState<ConfigValidationIssue[]>([]);
  const [status, setStatus] = useState('');

  const load = useCallback(async (): Promise<void> => {
    const r = await window.agentdesk.settings.read({
      file,
      scope,
      ...(scope === 'project' && workspacePath ? { workspacePath } : {}),
    });
    setRaw(r.raw);
    setPathName(r.path);
    setValidation(r.validation);
    setStatus(r.validation.length > 0 ? '当前文件存在校验问题' : '已加载');
  }, [file, scope, workspacePath]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (): Promise<void> => {
    const r = await window.agentdesk.settings.save({
      file,
      scope,
      raw,
      ...(scope === 'project' && workspacePath ? { workspacePath } : {}),
    });
    setValidation(r.validation);
    if (r.saved) setStatus('已保存（原文保留注释与格式）');
    else if (r.validation[0]) {
      setStatus(`保存被拒绝：${r.validation[0].message}`);
    } else setStatus('保存失败');
  };

  const reset = async (): Promise<void> => {
    if (!window.confirm(`重置 ${file === 'settings' ? 'settings.json' : 'models.json'} 为 {}？`)) {
      return;
    }
    const r = await window.agentdesk.settings.save({
      file,
      scope,
      parsed: {},
      ...(scope === 'project' && workspacePath ? { workspacePath } : {}),
    });
    setValidation(r.validation);
    setRaw(r.raw);
    setStatus(r.saved ? '已重置' : '重置被拒绝');
  };

  return (
    <div className="settings-page">
      <div className="settings-toolbar">
        <div className="settings-file-tabs">
          {(['settings', 'models'] as const).map((f) => (
            <button
              type="button"
              key={f}
              className={`settings-file-tab ${file === f ? 'active' : ''}`}
              onClick={() => setFile(f)}
            >
              {f === 'settings' ? 'settings.json' : 'models.json'}
            </button>
          ))}
        </div>
        <select
          className="settings-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as 'global' | 'project')}
        >
          <option value="global">全局</option>
          <option value="project" disabled={!workspacePath}>
            项目
          </option>
        </select>
        <span className="settings-toolbar-status">{status}</span>
      </div>
      <div className="settings-raw-path">{path || '（文件尚不存在，保存时创建）'}</div>
      <CodeMirror
        value={raw}
        height="360px"
        theme={oneDark}
        extensions={[json()]}
        onChange={(v) => {
          setRaw(v);
          setStatus('');
        }}
        basicSetup={{ lineNumbers: true, foldGutter: true }}
      />
      {validation.length > 0 ? (
        <div className="settings-validation">
          {validation.map((v) => (
            <div key={`${v.path}-${v.line}-${v.message}`} className="skill-validation-error">
              第 {v.line ?? '?'} 行 · {v.path}：{v.message}
            </div>
          ))}
        </div>
      ) : null}
      <div className="settings-actions">
        <button type="button" className="primary-btn" onClick={() => void save()}>
          保存
        </button>
        <button type="button" className="btn danger-btn" onClick={() => void reset()}>
          重置
        </button>
      </div>
      <div className="settings-note">
        原始配置编辑器是逃生舱：任何 UI 未覆盖的 pi 设置都能在这里改，保存时按 JSON Schema
        校验并给出行内错误。
      </div>
    </div>
  );
}

function GeneralPage(): React.JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [fontSize, setFontSize] = useState(() => {
    try {
      return Number(localStorage.getItem('agentdesk-font-size') ?? '') || 14;
    } catch {
      return 14;
    }
  });
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('agentdesk-lang') ?? 'zh';
    } catch {
      return 'zh';
    }
  });

  const applyFont = (size: number): void => {
    setFontSize(size);
    document.documentElement.style.fontSize = `${size}px`;
    try {
      localStorage.setItem('agentdesk-font-size', String(size));
    } catch {
      // 忽略
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-fields">
        <label className="settings-field">
          <span>主题</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
          >
            <option value="dark">深色</option>
            <option value="light">浅色</option>
            <option value="system">跟随系统</option>
          </select>
        </label>
        <label className="settings-field">
          <span>语言</span>
          <select
            value={lang}
            onChange={(e) => {
              setLang(e.target.value);
              try {
                localStorage.setItem('agentdesk-lang', e.target.value);
              } catch {
                // 忽略
              }
            }}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="settings-field">
          <span>字号（px）</span>
          <input
            type="number"
            min={11}
            max={20}
            value={fontSize}
            onChange={(e) => applyFont(Number(e.target.value) || 14)}
          />
        </label>
      </div>
    </div>
  );
}

function KernelPage(): React.JSX.Element {
  const [status, setStatus] = useState<KernelStatus | null>(null);
  useEffect(() => {
    void window.agentdesk.settings
      .kernelStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  return (
    <div className="settings-page">
      {!status ? (
        <div className="settings-empty">加载内核状态中…</div>
      ) : (
        <div className="settings-kernel">
          <div>
            内核二进制：<code>{status.binary ?? '未找到（打包内置 resources/bin）'}</code>{' '}
            {status.binaryExists ? <span className="chip chip-ok">存在</span> : null}
          </div>
          <div>版本：{status.version ?? '未知'}</div>
          <div>
            Agent Dir：<code>{status.agentDir}</code>
          </div>
          <div>
            pi 托管二进制目录（~/.pi/agent/bin）：<code>{status.binDir}</code>{' '}
            {status.binDirExists ? <span className="chip chip-ok">存在</span> : null}
          </div>
          <div className="settings-note">
            Profile（Agent Dir 隔离）在后续步骤提供；内核来源/--offline/PI_SKIP_VERSION_CHECK
            由启动配置决定。
          </div>
        </div>
      )}
    </div>
  );
}

function LinkPage({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; action: () => void }>;
}): React.JSX.Element {
  return (
    <div className="settings-page">
      <div className="settings-link-title">{title}</div>
      <div className="settings-actions">
        {items.map((item) => (
          <button key={item.label} type="button" className="btn" onClick={item.action}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 设置页（README 9.7，⌘,）：16 页导航 + schema 驱动表单 + 原始配置编辑器。 */
export function SettingsPanel(): React.JSX.Element | null {
  const open = useUiStore((s) => s.settingsPanelOpen);
  const close = useUiStore((s) => s.closeSettingsPanel);
  const [page, setPage] = useState('general');
  const activeId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const workspacePath = activeId ? (sessions[activeId]?.workspacePath ?? '') : '';
  const openProvider = useUiStore((s) => s.openProviderSettings);
  const openSkill = useUiStore((s) => s.openSkillSettings);
  const openMcp = useUiStore((s) => s.openMcpSettings);
  const openPackages = useUiStore((s) => s.openPackageSettings);
  const openAudit = useUiStore((s) => s.openAudit);

  if (!open) return null;

  const renderPage = (): React.JSX.Element => {
    if (page === 'general') return <GeneralPage />;
    if (page === 'kernel') return <KernelPage />;
    if (page === 'providers') {
      return (
        <LinkPage
          title="供应商（Provider）"
          items={[{ label: '打开供应商设置', action: openProvider }]}
        />
      );
    }
    if (page === 'secrets') {
      return (
        <LinkPage
          title="密钥与登录"
          items={[{ label: '打开密钥与供应商设置', action: openProvider }]}
        />
      );
    }
    if (page === 'approval') {
      return (
        <LinkPage
          title="权限与审批（默认审批模式、规则、审计）"
          items={[{ label: '打开审批规则与审计', action: openAudit }]}
        />
      );
    }
    if (page === 'skill') {
      return (
        <LinkPage title="Skill 管理" items={[{ label: '打开 Skill 管理', action: openSkill }]} />
      );
    }
    if (page === 'mcp') {
      return <LinkPage title="MCP Host" items={[{ label: '打开 MCP 管理', action: openMcp }]} />;
    }
    if (page === 'packages') {
      return (
        <LinkPage
          title="Pi Package（插件）"
          items={[{ label: '打开插件管理', action: openPackages }]}
        />
      );
    }
    if (page === 'agentdesk-plugins') {
      return (
        <div className="settings-page">
          <div className="settings-empty">
            AgentDesk 前端插件（contributes.panels/renderers/commands/themes/settings）为 P1， V1
            只预留清单格式与加载器骨架，暂无已安装插件。
          </div>
        </div>
      );
    }
    if (page === 'advanced') return <RawConfigPage workspacePath={workspacePath} />;
    const fields = FORM_FIELDS[page];
    if (fields) return <SettingsFormPage fields={fields} workspacePath={workspacePath} />;
    return <div className="settings-page" />;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card settings-panel">
        <div className="provider-settings-header">
          <h2 className="model-picker-title">设置</h2>
          <button type="button" className="modal-close" onClick={close} aria-label="close">
            ×
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav">
            {NAV.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`settings-nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => setPage(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="settings-content">{renderPage()}</div>
        </div>
      </div>
    </div>
  );
}
