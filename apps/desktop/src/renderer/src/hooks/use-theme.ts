import { useEffect } from 'react';
import { resolveTheme, useUiStore } from '../stores/ui-store';

/** 把 theme 落到 document.documentElement[data-theme]（README 9.1 CSS 变量）。 */
export function useTheme(): void {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme);
    };
    apply();
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);
}
