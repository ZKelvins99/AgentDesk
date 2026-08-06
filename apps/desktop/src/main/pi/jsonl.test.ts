import { describe, expect, it } from 'vitest';
import { JsonlFramer } from './jsonl';

describe('JsonlFramer', () => {
  it('按 \\n 切分并剥尾部 \\r', () => {
    const f = new JsonlFramer();
    expect(f.push(Buffer.from('{"a":1}\r\n{"b":2}\n'))).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('跨 chunk 的部分行缓存', () => {
    const f = new JsonlFramer();
    expect(f.push(Buffer.from('{"a":'))).toEqual([]);
    expect(f.push(Buffer.from('1}\n'))).toEqual(['{"a":1}']);
  });

  it('U+2028/U+2029 在 JSON 字符串内不断行（readline 的坑）', () => {
    const f = new JsonlFramer();
    const lines = f.push(Buffer.from('{"s":"a\u2028b"}\n{"s":"c\u2029d"}\n'));
    expect(lines).toEqual(['{"s":"a\u2028b"}', '{"s":"c\u2029d"}']);
  });

  it('flush 取出残留部分行', () => {
    const f = new JsonlFramer();
    f.push(Buffer.from('{"x":1}'));
    expect(f.flush()).toEqual(['{"x":1}']);
    expect(f.flush()).toEqual([]);
  });

  it('丢弃空行', () => {
    const f = new JsonlFramer();
    expect(f.push(Buffer.from('\n{"a":1}\n\n'))).toEqual(['{"a":1}']);
  });
});
