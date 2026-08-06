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
  'composer.placeholder': 'Do anything',
  'composer.send': '发送',
  'composer.stop': '停止',
  'composer.steering': '引导中',
  'composer.queued': '已排队 · {n}',
  'composer.model': '模型',
  'composer.modelChip': '{model}',
  'composer.approvalFull': '完全访问',
  'session.creating': '创建会话中…',
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
  'panel.sessionInfo': '会话信息',
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
  'composer.placeholder': 'Do anything',
  'composer.send': 'Send',
  'composer.stop': 'Stop',
  'composer.steering': 'Steering',
  'composer.queued': 'Queued · {n}',
  'composer.model': 'Model',
  'composer.modelChip': '{model}',
  'composer.approvalFull': 'Full access',
  'session.creating': 'Creating session…',
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
  'panel.sessionInfo': 'Session info',
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
