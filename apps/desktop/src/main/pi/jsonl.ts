/**
 * 严格 JSONL 切帧器（README 4.7）：
 * 仅按 \n 切分，剥尾部 \r；禁止使用 readline——它会额外在 U+2028/U+2029 断行。
 */
export class JsonlFramer {
  private buffer = '';

  /** 输入新 chunk，返回完整行（空行丢弃，部分行留在缓存）。 */
  push(chunk: Buffer | string): string[] {
    this.buffer += chunk.toString('utf8');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.map(stripCr).filter((l) => l.length > 0);
  }

  /** 流关闭时取出残留的部分行。 */
  flush(): string[] {
    if (this.buffer.length === 0) return [];
    const line = stripCr(this.buffer);
    this.buffer = '';
    return line.length > 0 ? [line] : [];
  }

  get hasPartial(): boolean {
    return this.buffer.length > 0;
  }
}

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
