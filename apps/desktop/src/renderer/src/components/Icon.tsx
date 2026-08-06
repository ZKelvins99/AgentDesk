/**
 * 统一图标组件。
 *
 * 原先各处直接用 emoji / 生僻字符（🔍 🔔 ⎇ ⧉ ⧩ …），在 Windows 上会退化成
 * 彩色 emoji 或缺字方框，且无法跟随文字颜色。这里改为单色线性 SVG：
 * 统一 24 视窗、currentColor 描边，视觉与 codex 一致。
 */

export type IconName =
  | 'search'
  | 'command'
  | 'plus'
  | 'sliders'
  | 'plug'
  | 'book'
  | 'package'
  | 'shield'
  | 'panelLeft'
  | 'panelRight'
  | 'gitBranch'
  | 'terminal'
  | 'moon'
  | 'sun'
  | 'monitor'
  | 'minimize'
  | 'maximize'
  | 'close'
  | 'arrowUp'
  | 'stop'
  | 'chevronRight'
  | 'chevronDown'
  | 'check'
  | 'alert'
  | 'help'
  | 'gauge'
  | 'refresh'
  | 'message'
  | 'file'
  | 'trash'
  // ---- 新增图标 ----
  | 'shieldCheck'
  | 'shieldOff'
  | 'chevronsUpDown'
  | 'copy'
  | 'externalLink'
  | 'arrowLeft'
  | 'arrowRight'
  | 'download'
  | 'upload'
  | 'folder'
  | 'moreHorizontal'
  | 'settings'
  | 'tool';

const PATHS: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </>
  ),
  command: (
    <path d="M15 6a3 3 0 1 1 3 3h-3V6zm0 12a3 3 0 1 0 3-3h-3v3zM9 6a3 3 0 1 0-3 3h3V6zm0 12a3 3 0 1 1-3-3h3v3zm0-9h6v6H9V9z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  sliders: (
    <>
      <path d="M4 7h9M19 7h1M4 17h5M15 17h5" />
      <circle cx="16" cy="7" r="2.5" />
      <circle cx="12" cy="17" r="2.5" />
    </>
  ),
  plug: <path d="M12 22v-5M9 8V2M15 8V2M6 8h12v3a6 6 0 0 1-12 0V8z" />,
  book: (
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V5a2.5 2.5 0 0 1 2.5-2.5H20v19H6.5A2.5 2.5 0 0 1 4 19.5z" />
  ),
  package: (
    <>
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" />
      <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" />
    </>
  ),
  shield: <path d="M12 2.5 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />,
  panelLeft: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M9.5 3v18" />
    </>
  ),
  panelRight: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M14.5 3v18" />
    </>
  ),
  gitBranch: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M6 15.5V6M18 8.5a9 9 0 0 1-9 9" />
    </>
  ),
  terminal: <path d="M4.5 16.5 9 12 4.5 7.5M12 17h7.5" />,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8.5 21h7M12 17v4" />
    </>
  ),
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  arrowUp: <path d="M12 19.5V5M5.5 11.5 12 5l6.5 6.5" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  alert: <path d="M12 3.5 21 19.5H3zM12 9.5v4M12 16.5h.01" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6M12 17h.01" />
    </>
  ),
  gauge: (
    <>
      <path d="M3.5 17a9 9 0 1 1 17 0" />
      <path d="M12 13.5 16 9.5" />
    </>
  ),
  refresh: <path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3M20.5 4v5.5H15" />,
  message: (
    <path d="M21 11.5c0 4.1-4 7.5-9 7.5-1 0-2-.1-2.9-.4L4 21l1.4-3.6A7.3 7.3 0 0 1 3 11.5C3 7.4 7 4 12 4s9 3.4 9 7.5z" />
  ),
  file: (
    <>
      <path d="M14 3.5H7.5A2 2 0 0 0 5.5 5.5v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <path d="M14 3.5V8h4.5" />
    </>
  ),
  trash: <path d="M4.5 7.5h15M9.5 7.5V5h5v2.5M6.5 7.5l1 12.5h9l1-12.5" />,

  // ---- 新增图标 ----

  /**
   * shieldCheck：盾牌内有对勾——「始终信任」工作区状态。
   * 比单独用 shield + check 更语义化，一眼识别安全已授权。
   */
  shieldCheck: (
    <>
      <path d="M12 2.5 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),

  /**
   * shieldOff：盾牌带斜线——「从不信任」工作区状态。
   * 视觉上是盾牌缺口 + 斜线，与 shieldCheck 形成明确对比。
   */
  shieldOff: (
    <>
      <path d="M19.7 14A8.9 8.9 0 0 0 20 12V6l-8-3.5-4.1 1.8M4.3 5.3 4 6v6c0 5 3.5 8.5 8 10a13.6 13.6 0 0 0 3.9-2.3" />
      <path d="M3 3l18 18" />
    </>
  ),

  /**
   * chevronsUpDown：上下双箭头——折叠/展开切换控件（ThinkingBlock、树节点）。
   * 比实心三角 ▸▾ 更轻、与整套线性风格一致。
   */
  chevronsUpDown: <path d="M8 9l4-4.5L16 9M8 15l4 4.5 4-4.5" />,

  /**
   * copy：两个层叠矩形——复制到剪贴板（代码块、会话导出）。
   */
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5H9" />
    </>
  ),

  /**
   * externalLink：方框右上角带箭头——在浏览器打开外部链接。
   */
  externalLink: (
    <>
      <path d="M18 13v5.5A2.5 2.5 0 0 1 15.5 21h-10A2.5 2.5 0 0 1 3 18.5v-10A2.5 2.5 0 0 1 5.5 6H11" />
      <path d="M15 3h6v6M10 14 21 3" />
    </>
  ),

  /**
   * arrowLeft：向左箭头——历史后退、会话切换。
   */
  arrowLeft: <path d="M19.5 12H5M11.5 5.5 5 12l6.5 6.5" />,

  /**
   * arrowRight：向右箭头——历史前进、展开导航。
   */
  arrowRight: <path d="M4.5 12H19M12.5 5.5 19 12l-6.5 6.5" />,

  /**
   * download：向下箭头 + 托盘——下载文件、内核更新。
   */
  download: (
    <>
      <path d="M12 3v12.5M7.5 11 12 15.5 16.5 11" />
      <path d="M3.5 18.5h17" />
    </>
  ),

  /**
   * upload：向上箭头 + 托盘——上传文件、导入配置。
   */
  upload: (
    <>
      <path d="M12 15.5V3M7.5 7l4.5-4.5L16.5 7" />
      <path d="M3.5 18.5h17" />
    </>
  ),

  /**
   * folder：文件夹——工作区路径、文件树节点。
   */
  folder: (
    <path d="M3 6.5A2 2 0 0 1 5 4.5h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5z" />
  ),

  /**
   * moreHorizontal：三个横向圆点——溢出菜单、更多操作。
   */
  moreHorizontal: (
    <>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),

  /**
   * settings：齿轮——通用设置入口。
   */
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2M12 19.5v2M4.4 4.4l1.4 1.4M18.2 18.2l1.4 1.4M2.5 12h2M19.5 12h2M4.4 19.6l1.4-1.4M18.2 5.8l1.4-1.4" />
    </>
  ),

  /**
   * tool：扫手工具调用标识。两个交叉的开口扫手键，直观表达「工具/扫手」语义。
   */
  tool: (
    <>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </>
  ),
};

/** 线性单色图标；size 同时决定描边视觉粗细的相对比例。 */
export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
