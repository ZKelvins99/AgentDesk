import type {
  McpCallLogEntry,
  McpScope,
  McpServerConfig,
  McpServerView,
  McpSnapshot,
  McpToolView,
} from '@agentdesk/ipc';
import { useCallback, useEffect, useState } from 'react';
import { useUiStore } from '../stores/ui-store';
import { Icon } from './Icon';

type Transport = 'stdio' | 'sse' | 'http';

interface FormState {
  name: string;
  scope: McpScope;
  enabled: boolean;
  transport: Transport;
  command: string;
  args: string;
  env: string;
  cwd: string;
  url: string;
  headers: string;
  timeoutMs: string;
  startupTimeoutMs: string;
  allow: string;
  deny: string;
  autoApprove: string;
  maxRetries: string;
  baseDelayMs: string;
}

interface EditorState {
  mode: 'create' | 'edit';
  view: McpServerView | null;
}

const STATUS_LABEL: Record<McpSnapshot['status'], string> = {
  disconnected: '未连接',
  connecting: '连接中',
  ready: '就绪',
  degraded: '降级',
  failed: '失败',
};

function emptyForm(): FormState {
  return {
    name: '',
    scope: 'global',
    enabled: true,
    transport: 'stdio',
    command: '',
    args: '',
    env: '',
    cwd: '',
    url: '',
    headers: '',
    timeoutMs: '',
    startupTimeoutMs: '',
    allow: '',
    deny: '',
    autoApprove: '',
    maxRetries: '',
    baseDelayMs: '',
  };
}

function kvLinesToRecord(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function recordToKvLines(record: Record<string, string> | undefined): string {
  if (!record) return '';
  return Object.entries(record)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function commaList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function optionalNumber(text: string): number | undefined {
  const n = Number(text.trim());
  return text.trim() && Number.isFinite(n) ? n : undefined;
}

function formToConfig(form: FormState): McpServerConfig {
  const config: McpServerConfig = { transport: form.transport };
  if (!form.enabled) config.enabled = false;
  if (form.command.trim()) config.command = form.command.trim();
  const args = form.args
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (args.length > 0) config.args = args;
  const env = kvLinesToRecord(form.env);
  if (Object.keys(env).length > 0) config.env = env;
  if (form.cwd.trim()) config.cwd = form.cwd.trim();
  if (form.url.trim()) config.url = form.url.trim();
  const headers = kvLinesToRecord(form.headers);
  if (Object.keys(headers).length > 0) config.headers = headers;
  const timeoutMs = optionalNumber(form.timeoutMs);
  if (timeoutMs !== undefined) config.timeoutMs = timeoutMs;
  const startupTimeoutMs = optionalNumber(form.startupTimeoutMs);
  if (startupTimeoutMs !== undefined) config.startupTimeoutMs = startupTimeoutMs;
  const allow = commaList(form.allow);
  const deny = commaList(form.deny);
  if (allow.length > 0 || deny.length > 0) {
    config.toolFilter = {
      ...(allow.length > 0 ? { allow } : {}),
      ...(deny.length > 0 ? { deny } : {}),
    };
  }
  const autoApprove = commaList(form.autoApprove);
  if (autoApprove.length > 0) config.autoApprove = autoApprove;
  const maxRetries = optionalNumber(form.maxRetries);
  const baseDelayMs = optionalNumber(form.baseDelayMs);
  if (maxRetries !== undefined || baseDelayMs !== undefined) {
    config.reconnect = {
      ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...(baseDelayMs !== undefined ? { baseDelayMs } : {}),
    };
  }
  return config;
}

function formFromConfig(view: McpServerView | null): FormState {
  if (!view) return emptyForm();
  const c = view.config;
  return {
    name: view.name,
    scope: view.scope,
    enabled: c.enabled !== false,
    transport: c.transport,
    command: c.command ?? '',
    args: (c.args ?? []).join('\n'),
    env: recordToKvLines(c.env),
    cwd: c.cwd ?? '',
    url: c.url ?? '',
    headers: recordToKvLines(c.headers),
    timeoutMs: c.timeoutMs !== undefined ? String(c.timeoutMs) : '',
    startupTimeoutMs: c.startupTimeoutMs !== undefined ? String(c.startupTimeoutMs) : '',
    allow: (c.toolFilter?.allow ?? []).join(', '),
    deny: (c.toolFilter?.deny ?? []).join(', '),
    autoApprove: (c.autoApprove ?? []).join(', '),
    maxRetries: c.reconnect?.maxRetries !== undefined ? String(c.reconnect.maxRetries) : '',
    baseDelayMs: c.reconnect?.baseDelayMs !== undefined ? String(c.reconnect.baseDelayMs) : '',
  };
}

function cloneConfig(config: McpServerConfig): McpServerConfig {
  return JSON.parse(JSON.stringify(config)) as McpServerConfig;
}

/** 按工具粒度开关：enabled → toolFilter 增删精确名；免审批 → autoApprove 增删（README 8.3.6）。 */
function toggleToolField(
  config: McpServerConfig,
  toolName: string,
  field: 'enabled' | 'autoApprove',
  current: boolean,
): McpServerConfig {
  const next = cloneConfig(config);
  if (field === 'autoApprove') {
    const list = [...(next.autoApprove ?? [])];
    const idx = list.indexOf(toolName);
    if (current && idx >= 0) list.splice(idx, 1);
    if (!current && idx < 0) list.push(toolName);
    if (list.length > 0) next.autoApprove = list;
    else delete next.autoApprove;
    return next;
  }
  const deny = [...(next.toolFilter?.deny ?? [])];
  const allow = [...(next.toolFilter?.allow ?? [])];
  if (current) {
    if (!deny.includes(toolName)) deny.push(toolName);
  } else {
    const denyIdx = deny.indexOf(toolName);
    if (denyIdx >= 0) deny.splice(denyIdx, 1);
    if (allow.length > 0 && !allow.includes(toolName)) allow.push(toolName);
  }
  if (allow.length > 0 || deny.length > 0) {
    next.toolFilter = {
      ...(allow.length > 0 ? { allow } : {}),
      ...(deny.length > 0 ? { deny } : {}),
    };
  } else {
    delete next.toolFilter;
  }
  return next;
}

function formatTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function statusDotClass(status: McpSnapshot['status']): string {
  switch (status) {
    case 'ready':
      return 'mcp-status-ready';
    case 'connecting':
      return 'mcp-status-connecting';
    case 'degraded':
      return 'mcp-status-degraded';
    case 'failed':
      return 'mcp-status-failed';
    default:
      return 'mcp-status-off';
  }
}

/** MCP Host 管理界面（README 8.3.6）：状态灯 / 测试连接 / 工具清单 schema 展开 / 按工具开关与免审批 / 调用日志 / 导入导出。 */
export function McpSettings(): React.JSX.Element | null {
  const open = useUiStore((s) => s.mcpSettingsOpen);
  const close = useUiStore((s) => s.closeMcpSettings);
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [snapshots, setSnapshots] = useState<McpSnapshot[]>([]);
  const [logs, setLogs] = useState<McpCallLogEntry[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [formError, setFormError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState('');
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpToolView[]>>({});
  const [toolsError, setToolsError] = useState<Record<string, string>>({});
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedSchema, setExpandedSchema] = useState<Set<string>>(new Set());
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  const load = useCallback(async (): Promise<void> => {
    const [listRes, snapRes, logRes] = await Promise.all([
      window.agentdesk.mcp.list({}),
      window.agentdesk.mcp.snapshots({}),
      window.agentdesk.mcp.logs({}),
    ]);
    setServers(listRes.servers);
    setSnapshots(snapRes.snapshots);
    setLogs(logRes.logs);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  const snapshotOf = (name: string): McpSnapshot | undefined =>
    snapshots.find((s) => s.name === name);

  const startCreate = (): void => {
    setEditor({ mode: 'create', view: null });
    setForm(emptyForm());
    setJsonMode(false);
    setJsonText('');
    setFormError('');
  };

  const startEdit = (view: McpServerView): void => {
    setEditor({ mode: 'edit', view });
    setForm(formFromConfig(view));
    setJsonMode(false);
    setJsonText(JSON.stringify(view.config, null, 2));
    setFormError('');
  };

  const doSave = async (config: McpServerConfig, name: string, scope: McpScope): Promise<void> => {
    await window.agentdesk.mcp.save({ name, scope, config });
    setEditor(null);
    setFormError('');
    await load();
  };

  const submitForm = async (): Promise<void> => {
    const name = form.name.trim();
    if (!name) {
      setFormError('请填写 server 名称');
      return;
    }
    if (form.transport === 'stdio' && !form.command.trim()) {
      setFormError('stdio 传输需要 command');
      return;
    }
    if (form.transport !== 'stdio' && !form.url.trim()) {
      setFormError(`${form.transport} 传输需要 url`);
      return;
    }
    try {
      await doSave(formToConfig(form), name, form.scope);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const submitJson = async (): Promise<void> => {
    if (!editor) return;
    const name = editor.mode === 'create' ? form.name.trim() : (editor.view?.name ?? '');
    const scope = editor.mode === 'create' ? form.scope : (editor.view?.scope ?? 'global');
    if (!name) {
      setFormError('请填写 server 名称');
      return;
    }
    let config: unknown;
    try {
      config = JSON.parse(jsonText);
    } catch {
      setFormError('JSON 解析失败');
      return;
    }
    try {
      await doSave(config as McpServerConfig, name, scope);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleServerEnabled = async (view: McpServerView): Promise<void> => {
    const next = cloneConfig(view.config);
    if (next.enabled === false) delete next.enabled;
    else next.enabled = false;
    await doSave(next, view.name, view.scope);
  };

  const testConnection = async (name: string): Promise<void> => {
    setTesting((s) => new Set(s).add(name));
    setTestResults((s) => ({ ...s, [name]: '测试中…' }));
    try {
      const r = await window.agentdesk.mcp.test({ name });
      setTestResults((s) => ({
        ...s,
        [name]: r.ok
          ? `✓ ${r.serverInfo?.name ?? name}${r.serverInfo?.version ? ` v${r.serverInfo.version}` : ''} · ${r.toolCount} 个工具 · ${r.latencyMs}ms`
          : `✗ ${r.error ?? '连接失败'}`,
      }));
    } catch (error) {
      setTestResults((s) => ({
        ...s,
        [name]: `✗ ${error instanceof Error ? error.message : String(error)}`,
      }));
    } finally {
      setTesting((s) => {
        const next = new Set(s);
        next.delete(name);
        return next;
      });
      await load();
    }
  };

  const openTools = async (name: string): Promise<void> => {
    const next = new Set(expandedTools);
    if (next.has(name)) {
      next.delete(name);
      setExpandedTools(next);
      return;
    }
    next.add(name);
    setExpandedTools(next);
    if (!toolsByServer[name]) {
      try {
        const r = await window.agentdesk.mcp.tools({ name });
        setToolsByServer((s) => ({ ...s, [name]: r.tools }));
        setToolsError((s) => ({ ...s, [name]: '' }));
      } catch (error) {
        setToolsByServer((s) => ({ ...s, [name]: [] }));
        setToolsError((s) => ({
          ...s,
          [name]: error instanceof Error ? error.message : String(error),
        }));
      }
    }
  };

  const toggleTool = async (
    view: McpServerView,
    tool: McpToolView,
    field: 'enabled' | 'autoApprove',
  ): Promise<void> => {
    const current = field === 'enabled' ? tool.enabled : tool.autoApprove;
    const next = toggleToolField(view.config, tool.name, field, current);
    await window.agentdesk.mcp.save({ name: view.name, scope: view.scope, config: next });
    try {
      const r = await window.agentdesk.mcp.tools({ name: view.name });
      setToolsByServer((s) => ({ ...s, [view.name]: r.tools }));
    } catch {
      // 工具清单刷新失败不阻塞
    }
    await load();
  };

  const removeServer = async (view: McpServerView): Promise<void> => {
    if (!window.confirm(`删除 MCP server ${view.name}？`)) return;
    await window.agentdesk.mcp.delete({ name: view.name, scope: view.scope });
    await load();
  };

  const doImport = async (): Promise<void> => {
    setImportResult('');
    try {
      const r = await window.agentdesk.mcp.importServers({ json: importText, scope: 'global' });
      setImportResult(
        `导入 ${r.imported.length} 个${r.skipped.length > 0 ? `，跳过 ${r.skipped.length} 个（${r.skipped.map((s) => `${s.name}: ${s.reason}`).join('；')}）` : ''}`,
      );
      setImportText('');
      await load();
    } catch (error) {
      setImportResult(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const doExport = async (): Promise<void> => {
    const { json } = await window.agentdesk.mcp.export({});
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agentdesk-mcp.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card mcp-settings">
        <div className="provider-settings-header">
          <h2 className="model-picker-title">MCP Host 管理</h2>
          <button type="button" className="link-btn" onClick={() => void doExport()}>
            导出
          </button>
          <button type="button" className="link-btn" onClick={() => setImportOpen(true)}>
            导入
          </button>
          <button type="button" className="btn" onClick={startCreate}>
            + 新增
          </button>
          <button type="button" className="modal-close" onClick={close} aria-label="close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="mcp-server-list">
          {servers.length === 0 ? (
            <div className="mcp-empty">还没有 MCP server，点击「新增」配置一个。</div>
          ) : (
            servers.map((view) => {
              const snap = snapshotOf(view.name);
              const status: McpSnapshot['status'] = snap?.status ?? 'disconnected';
              return (
                <div className="mcp-server-row" key={`${view.scope}:${view.name}`}>
                  <span
                    className={`mcp-status-dot ${statusDotClass(status)}`}
                    title={STATUS_LABEL[status]}
                  />
                  <span className="mcp-server-name">{view.name}</span>
                  <span className="chip">{view.config.transport}</span>
                  <span className="chip">{view.scope === 'global' ? '全局' : '工作区'}</span>
                  <span className="mcp-server-tools">{snap?.tools.length ?? 0} 工具</span>
                  <span className="mcp-server-error" title={snap?.lastError ?? ''}>
                    {snap?.lastError ?? ''}
                  </span>
                  <span className="mcp-test-result">{testResults[view.name] ?? ''}</span>
                  <div className="mcp-row-actions">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => void testConnection(view.name)}
                      disabled={testing.has(view.name)}
                    >
                      {testing.has(view.name) ? '测试中…' : '测试连接'}
                    </button>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => void openTools(view.name)}
                    >
                      {expandedTools.has(view.name) ? '收起工具' : '工具'}
                    </button>
                    <button type="button" className="link-btn" onClick={() => startEdit(view)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => void toggleServerEnabled(view)}
                    >
                      {view.config.enabled === false ? '启用' : '停用'}
                    </button>
                    <button
                      type="button"
                      className="link-btn danger-btn"
                      onClick={() => void removeServer(view)}
                    >
                      删除
                    </button>
                  </div>
                  {expandedTools.has(view.name) ? (
                    <div className="mcp-tools">
                      {toolsError[view.name] ? (
                        <div className="mcp-error">{toolsError[view.name]}</div>
                      ) : null}
                      {toolsByServer[view.name]?.length === 0 ? (
                        <div className="mcp-empty">该 server 暂无可用工具（或尚未连接）。</div>
                      ) : (
                        (toolsByServer[view.name] ?? []).map((tool) => (
                          <div className="mcp-tool-row" key={tool.piName}>
                            <span className="mcp-tool-name" title={tool.description}>
                              {tool.name}
                              {tool.conflict ? (
                                <span className="mcp-conflict-badge">重名让位</span>
                              ) : null}
                            </span>
                            <span className="mcp-tool-pi">{tool.piName}</span>
                            <label className="mcp-toggle">
                              <input
                                type="checkbox"
                                checked={tool.enabled}
                                onChange={() => void toggleTool(view, tool, 'enabled')}
                              />
                              启用
                            </label>
                            <label className="mcp-toggle">
                              <input
                                type="checkbox"
                                checked={tool.autoApprove}
                                onChange={() => void toggleTool(view, tool, 'autoApprove')}
                              />
                              免审批
                            </label>
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => {
                                const next = new Set(expandedSchema);
                                if (next.has(tool.piName)) next.delete(tool.piName);
                                else next.add(tool.piName);
                                setExpandedSchema(next);
                              }}
                            >
                              {expandedSchema.has(tool.piName) ? '收起 schema' : 'schema'}
                            </button>
                            {expandedSchema.has(tool.piName) ? (
                              <pre className="mcp-schema">
                                {JSON.stringify(tool.inputSchema, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="panel-section-title">最近 {logs.length} 次调用（最多 20）</div>
        <div className="mcp-log-list">
          {logs.length === 0 ? (
            <div className="mcp-empty">暂无调用日志。</div>
          ) : (
            logs.map((log) => (
              <div className="mcp-log-row" key={log.id}>
                <span className="mcp-log-at">{formatTime(log.at)}</span>
                <span className="mcp-log-server">{log.server}</span>
                <span className="mcp-log-tool">{log.tool}</span>
                <span className="mcp-log-duration">{log.durationMs}ms</span>
                <span className={log.isError ? 'mcp-log-err' : 'mcp-log-ok'}>
                  {log.isError ? `✗ ${log.error ?? ''}` : '✓'}
                </span>
                <span className="mcp-log-args" title={JSON.stringify(log.args)}>
                  {JSON.stringify(log.args).slice(0, 120)}
                </span>
                <span className="mcp-log-result" title={String(log.result ?? '')}>
                  {log.isError ? '' : String(log.result ?? '').slice(0, 120)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {editor ? (
        <div className="modal-overlay">
          <div className="modal-card mcp-editor">
            <div className="provider-settings-header">
              <h3 className="model-picker-title">
                {editor.mode === 'create' ? '新增 MCP server' : `编辑 ${editor.view?.name}`}
              </h3>
              <button type="button" className="link-btn" onClick={() => setJsonMode((m) => !m)}>
                {jsonMode ? '表单模式' : 'JSON 模式'}
              </button>
              <button
                type="button"
                className="modal-close"
                onClick={() => setEditor(null)}
                aria-label="close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            {formError ? <div className="mcp-error">{formError}</div> : null}
            {jsonMode ? (
              <textarea
                className="mcp-json-input"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
              />
            ) : (
              <div className="mcp-form">
                <label className="mcp-field">
                  <span>名称</span>
                  <input
                    value={form.name}
                    disabled={editor.mode === 'edit'}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label className="mcp-field">
                  <span>作用域</span>
                  <select
                    value={form.scope}
                    disabled={editor.mode === 'edit'}
                    onChange={(e) => setForm({ ...form, scope: e.target.value as McpScope })}
                  >
                    <option value="global">全局</option>
                    <option value="workspace">工作区</option>
                  </select>
                </label>
                <label className="mcp-field">
                  <span>传输</span>
                  <select
                    value={form.transport}
                    onChange={(e) => setForm({ ...form, transport: e.target.value as Transport })}
                  >
                    <option value="stdio">stdio</option>
                    <option value="sse">SSE</option>
                    <option value="http">StreamableHTTP</option>
                  </select>
                </label>
                <label className="mcp-field mcp-field-check">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  启用该 server
                </label>
                {form.transport === 'stdio' ? (
                  <>
                    <label className="mcp-field">
                      <span>command</span>
                      <input
                        value={form.command}
                        onChange={(e) => setForm({ ...form, command: e.target.value })}
                      />
                    </label>
                    <label className="mcp-field">
                      <span>args（每行一个）</span>
                      <textarea
                        value={form.args}
                        onChange={(e) => setForm({ ...form, args: e.target.value })}
                        spellCheck={false}
                      />
                    </label>
                    <label className="mcp-field">
                      <span>env（KEY=VALUE 每行）</span>
                      <textarea
                        value={form.env}
                        onChange={(e) => setForm({ ...form, env: e.target.value })}
                        spellCheck={false}
                      />
                    </label>
                    <label className="mcp-field">
                      <span>cwd</span>
                      <input
                        value={form.cwd}
                        onChange={(e) => setForm({ ...form, cwd: e.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="mcp-field">
                      <span>url</span>
                      <input
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                      />
                    </label>
                    <label className="mcp-field">
                      <span>headers（KEY=VALUE 每行）</span>
                      <textarea
                        value={form.headers}
                        onChange={(e) => setForm({ ...form, headers: e.target.value })}
                        spellCheck={false}
                      />
                    </label>
                  </>
                )}
                <label className="mcp-field">
                  <span>timeoutMs</span>
                  <input
                    value={form.timeoutMs}
                    onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })}
                  />
                </label>
                <label className="mcp-field">
                  <span>startupTimeoutMs</span>
                  <input
                    value={form.startupTimeoutMs}
                    onChange={(e) => setForm({ ...form, startupTimeoutMs: e.target.value })}
                  />
                </label>
                <label className="mcp-field">
                  <span>toolFilter.allow（逗号分隔）</span>
                  <input
                    value={form.allow}
                    onChange={(e) => setForm({ ...form, allow: e.target.value })}
                  />
                </label>
                <label className="mcp-field">
                  <span>toolFilter.deny（逗号分隔）</span>
                  <input
                    value={form.deny}
                    onChange={(e) => setForm({ ...form, deny: e.target.value })}
                  />
                </label>
                <label className="mcp-field">
                  <span>autoApprove（逗号分隔）</span>
                  <input
                    value={form.autoApprove}
                    onChange={(e) => setForm({ ...form, autoApprove: e.target.value })}
                  />
                </label>
                <label className="mcp-field">
                  <span>reconnect.maxRetries</span>
                  <input
                    value={form.maxRetries}
                    onChange={(e) => setForm({ ...form, maxRetries: e.target.value })}
                  />
                </label>
                <label className="mcp-field">
                  <span>reconnect.baseDelayMs</span>
                  <input
                    value={form.baseDelayMs}
                    onChange={(e) => setForm({ ...form, baseDelayMs: e.target.value })}
                  />
                </label>
              </div>
            )}
            <div className="mcp-editor-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => void (jsonMode ? submitJson() : submitForm())}
              >
                保存
              </button>
              <button type="button" className="btn" onClick={() => setEditor(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="modal-overlay">
          <div className="modal-card mcp-editor">
            <div className="provider-settings-header">
              <h3 className="model-picker-title">导入 Claude Desktop mcpServers</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setImportOpen(false)}
                aria-label="close"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <textarea
              className="mcp-json-input"
              placeholder='{"mcpServers": {"name": {"command": "npx", "args": []}}}'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              spellCheck={false}
            />
            {importResult ? <div className="mcp-test-result">{importResult}</div> : null}
            <div className="mcp-editor-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => void doImport()}
                disabled={!importText.trim()}
              >
                导入
              </button>
              <button type="button" className="btn" onClick={() => setImportOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
