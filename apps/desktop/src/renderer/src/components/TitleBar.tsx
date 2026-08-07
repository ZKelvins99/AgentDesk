import { t } from '../i18n';
import { type Theme, useUiStore } from '../stores/ui-store';
import { isMac as detectMac } from '../utils/platform';
import { Icon, type IconName } from './Icon';

const THEME_ICON: Record<Theme, IconName> = {
  dark: 'moon',
  light: 'sun',
  system: 'monitor',
};

const THEME_ORDER: Theme[] = ['dark', 'light', 'system'];

/** 自绘标题栏（README 9.1）：36px 拖拽区；macOS 让位交通灯，其他平台自绘窗口控制。 */
export function TitleBar(): React.JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const isMac = detectMac();

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length] as Theme);
  };

  return (
    <header className="titlebar" data-mac={isMac}>
      <div className="titlebar-left">
        <span className="titlebar-brand">{t('app.name')}</span>
        <button
          type="button"
          className="titlebar-theme"
          onClick={cycleTheme}
          title={t('titlebar.theme')}
          aria-label={t('titlebar.theme')}
        >
          <Icon name={THEME_ICON[theme]} size={15} />
        </button>
      </div>
      {!isMac ? (
        <div className="titlebar-actions">
          <button
            type="button"
            className="titlebar-btn"
            onClick={() => void window.agentdesk.window.minimize()}
            aria-label={t('titlebar.minimize')}
            title={t('titlebar.minimize')}
          >
            <Icon name="minimize" size={14} />
          </button>
          <button
            type="button"
            className="titlebar-btn"
            onClick={() => void window.agentdesk.window.maximize()}
            aria-label={t('titlebar.maximize')}
            title={t('titlebar.maximize')}
          >
            <Icon name="maximize" size={13} />
          </button>
          <button
            type="button"
            className="titlebar-btn titlebar-close"
            onClick={() => void window.agentdesk.window.close()}
            aria-label={t('titlebar.close')}
            title={t('titlebar.close')}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}
    </header>
  );
}
