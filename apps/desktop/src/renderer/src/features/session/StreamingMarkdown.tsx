import { Markdown } from '@agentdesk/ui';
import { memo, useMemo } from 'react';

/**
 * 流式 Markdown（README 9.4.3）：
 * 只对最后一个未闭合块做重解析；已完成块记忆化（React.memo 按字符串复用）。
 */
export function StreamingMarkdown({ text }: { text: string }): React.JSX.Element {
  const { settled, tail } = useMemo(() => splitStreamingTail(text), [text]);
  return (
    <div className="streaming-md">
      <SettledMarkdown text={settled} />
      {tail ? <Markdown text={tail} /> : null}
    </div>
  );
}

const SettledMarkdown = memo(function SettledMarkdown({ text }: { text: string }) {
  if (!text) return null;
  return <Markdown text={text} />;
});

/** 找到最后一个安全边界：围栏外的双换行；若围栏未闭合，尾部从该围栏起点开始。 */
export function splitStreamingTail(text: string): { settled: string; tail: string } {
  if (!text) return { settled: '', tail: '' };
  const lines = text.split('\n');
  let inFence = false;
  let openFenceIdx: number | null = null;
  let boundary = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\s*```/.test(line)) {
      if (inFence) {
        inFence = false;
        openFenceIdx = null;
      } else {
        inFence = true;
        openFenceIdx = i;
      }
      continue;
    }
    if (!inFence && line.trim() === '' && i > 0 && i < lines.length - 1) {
      boundary = i + 1;
    }
  }
  const cut = inFence && openFenceIdx !== null ? openFenceIdx : boundary;
  const settled = cut > 0 ? `${lines.slice(0, cut).join('\n')}\n` : '';
  const tail = cut > 0 ? lines.slice(cut).join('\n') : text;
  return { settled, tail };
}
