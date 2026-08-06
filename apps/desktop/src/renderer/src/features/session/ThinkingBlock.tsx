import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { t } from '../../i18n';

/** 思考块（README 9.4.2 #3）：折叠条，--thinking 色左边框、斜体；流式时自动展开。 */
export function ThinkingBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(streaming);
  useEffect(() => {
    if (streaming && text) setOpen(true);
  }, [streaming, text]);

  if (!text) return <span />;
  return (
    <div className="thinking-block" data-open={open}>
      <button
        type="button"
        className="thinking-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Icon name="chevronsUpDown" size={13} />
        <span className="thinking-label">
          {t('session.thinking')} · {text.length} 字符
        </span>
      </button>
      {open ? <div className="thinking-body">{text}</div> : null}
    </div>
  );
}
