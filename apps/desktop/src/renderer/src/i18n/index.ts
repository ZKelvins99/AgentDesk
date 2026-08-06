/**
 * 轻量 i18n（README 9.9：zh-CN 默认 + en；所有面向用户字符串禁止硬编码）。
 * M7 起由 i18next + 类型安全 key 替换，此处先落 key 规范。
 */

const zhCN = {
  'app.name': 'AgentDesk',
  'titlebar.minimize': '最小化',
  'titlebar.maximize': '最大化',
  'titlebar.close': '关闭',
  'titlebar.theme': '切换主题（深色/浅色/跟随系统）',
  'sidebar.newChat': '新对话',
  'sidebar.projects': '项目',
  'sidebar.recent': '最近',
  'sidebar.help': '帮助',
  'sidebar.search': '搜索',
  'sidebar.notifications': '通知',
  'sidebar.addProject': '添加项目',
  'sidebar.untrusted': '未信任',
  'sidebar.dropHint': '拖拽文件夹到这里添加项目',
  'composer.placeholder': 'Do anything',
  'composer.send': '发送',
  'composer.stop': '停止',
  'composer.steering': '引导中',
  'composer.queued': '已排队 · {n}',
  'composer.model': '模型',
  'composer.modelChip': '{model}',
  'composer.approvalFull': '完全访问',
  'workspace.remove': '移除',
  'workspace.open': '打开',
  'workspace.trusted': '已信任',
  'workspace.trustOnce': '本次信任',
  'workspace.trustParent': '父目录信任',
  'workspace.trustUnknown': '待确认',
  'trust.title': '信任此项目？',
  'trust.body':
    '信任项目将允许加载 .pi/settings.json、执行 .pi/extensions 下的代码，并可能安装项目声明的依赖包（npm/git）。',
  'trust.once': '仅本次信任',
  'trust.always': '永久信任',
  'trust.alwaysParent': '永久信任父目录',
  'trust.never': '不信任',
  'session.creating': '创建会话中…',
  'session.restoring': '恢复会话中…',
  'session.emptyTitle': '新对话',
  'session.emptyHint': '输入消息开始新对话',
  'session.jumpToLatest': '跳到最新',
  'session.thinking': '思考',
  'session.toolRunning': '运行中',
  'session.toolDone': '完成',
  'session.toolError': '失败',
  'session.openLocation': '打开位置',
  'session.toggleFiles': '文件树',
  'session.togglePanels': '面板',
  'session.rename': '重命名',
  'session.archive': '归档',
  'session.delete': '删除',
  'session.exportMd': '导出 Markdown',
  'session.exportJson': '导出 JSON',
  'session.exported': '已导出：{path}',
  'panel.sessionInfo': '会话信息',
  'panel.actions': '操作',
  'panel.status': '状态',
  'panel.model': '模型',
  'panel.seq': '事件序号',
  'panel.messages': '消息数',
  'panel.lastEvent': '最近事件',
  'status.idle': '空闲',
  'status.streaming': '生成中',
  'status.degraded': '降级',
  'status.error': '错误',
} as const;

export type I18nKey = keyof typeof zhCN;

const en: Record<I18nKey, string> = {
  'app.name': 'AgentDesk',
  'titlebar.minimize': 'Minimize',
  'titlebar.maximize': 'Maximize',
  'titlebar.close': 'Close',
  'titlebar.theme': 'Toggle theme (dark / light / system)',
  'sidebar.newChat': 'New chat',
  'sidebar.projects': 'Projects',
  'sidebar.recent': 'Recent',
  'sidebar.help': 'Help',
  'sidebar.search': 'Search',
  'sidebar.notifications': 'Notifications',
  'sidebar.addProject': 'Add project',
  'sidebar.untrusted': 'Untrusted',
  'sidebar.dropHint': 'Drop a folder here to add a project',
  'composer.placeholder': 'Do anything',
  'composer.send': 'Send',
  'composer.stop': 'Stop',
  'composer.steering': 'Steering',
  'composer.queued': 'Queued · {n}',
  'composer.model': 'Model',
  'composer.modelChip': '{model}',
  'composer.approvalFull': 'Full access',
  'workspace.remove': 'Remove',
  'workspace.open': 'Open',
  'workspace.trusted': 'Trusted',
  'workspace.trustOnce': 'Trusted (once)',
  'workspace.trustParent': 'Trusted (parent)',
  'workspace.trustUnknown': 'Pending',
  'trust.title': 'Trust this project?',
  'trust.body':
    'Trusting a project allows loading .pi/settings.json, executing code under .pi/extensions, and installing packages declared by the project (npm/git).',
  'trust.once': 'Trust once',
  'trust.always': 'Always trust',
  'trust.alwaysParent': 'Always trust parent',
  'trust.never': 'Don\u2019t trust',
  'session.creating': 'Creating session…',
  'session.restoring': 'Restoring session…',
  'session.emptyTitle': 'New chat',
  'session.emptyHint': 'Type a message to start',
  'session.jumpToLatest': 'Jump to latest',
  'session.thinking': 'Thinking',
  'session.toolRunning': 'Running',
  'session.toolDone': 'Done',
  'session.toolError': 'Failed',
  'session.openLocation': 'Open location',
  'session.toggleFiles': 'File tree',
  'session.togglePanels': 'Panels',
  'session.rename': 'Rename',
  'session.archive': 'Archive',
  'session.delete': 'Delete',
  'session.exportMd': 'Export Markdown',
  'session.exportJson': 'Export JSON',
  'session.exported': 'Exported: {path}',
  'panel.sessionInfo': 'Session info',
  'panel.actions': 'Actions',
  'panel.status': 'Status',
  'panel.model': 'Model',
  'panel.seq': 'Event seq',
  'panel.messages': 'Messages',
  'panel.lastEvent': 'Last event',
  'status.idle': 'Idle',
  'status.streaming': 'Streaming',
  'status.degraded': 'Degraded',
  'status.error': 'Error',
};

const dictionaries: Record<string, Record<I18nKey, string>> = {
  'zh-CN': zhCN,
  en,
};

function currentLocale(): string {
  try {
    return localStorage.getItem('agentdesk-locale') ?? 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale()] ?? zhCN;
  let text = dict[key] ?? zhCN[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
