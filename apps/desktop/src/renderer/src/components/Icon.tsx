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
  | 'trash';

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
