import { describe, expect, it } from 'vitest';
import { splitStreamingTail } from './StreamingMarkdown';

describe('splitStreamingTail（README 9.4.3 增量解析）', () => {
  it('普通段落：以最后一个双换行为边界', () => {
    const { settled, tail } = splitStreamingTail('第一段\n\n第二段\n正在流式');
    expect(settled).toBe('第一段\n\n');
    expect(tail).toBe('第二段\n正在流式');
  });

  it('闭合代码块整体进入 settled', () => {
    const text = '说明\n\n```ts\nconst a = 1;\n```\n\n后面的段落';
    const { settled } = splitStreamingTail(text);
    expect(settled).toContain('```ts');
    expect(settled).toContain('```');
  });

  it('未闭合代码块：尾部从围栏起点开始', () => {
    const text = '前面的段落\n\n```ts\nconst a = 1;';
    const { settled, tail } = splitStreamingTail(text);
    expect(settled).toBe('前面的段落\n\n');
    expect(tail.startsWith('```ts')).toBe(true);
  });
});
