/**
 * 错误文案清洗。
 *
 * Electron 的 ipcRenderer.invoke 会把主进程异常包装成
 * `Error invoking remote method 'session:send': AgentDeskError: RPC prompt 失败`，
 * 直接丢给用户既冗长又吓人。这里剥掉传输层包装，只留下真正的原因。
 */

const IPC_WRAPPER = /^Error invoking remote method\s+'[^']*':\s*/;
const ERROR_CLASS_PREFIX = /^(?:[A-Za-z_]\w*Error|Error):\s*/;

/** 去掉 IPC 包装与错误类名前缀，返回可直接展示的原因。 */
export function cleanErrorMessage(raw: string): string {
  let msg = raw.replace(IPC_WRAPPER, '');
  // 可能嵌套多层（AgentDeskError: Error: ...）
  while (ERROR_CLASS_PREFIX.test(msg)) {
    msg = msg.replace(ERROR_CLASS_PREFIX, '');
  }
  return msg.trim() || raw;
}

/**
 * 判断错误是否源于「没有可用模型 / 供应商未配置」。
 * pi 在缺少 provider 或密钥时不会给出结构化错误码，只能按特征匹配，
 * 命中后 UI 会附带一个「去配置供应商」入口。
 */
export function looksLikeMissingModel(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('prompt 失败') ||
    m.includes('no model') ||
    m.includes('model not found') ||
    m.includes('unknown model') ||
    m.includes('no provider') ||
    m.includes('api key') ||
    m.includes('unauthorized') ||
    m.includes('401')
  );
}
