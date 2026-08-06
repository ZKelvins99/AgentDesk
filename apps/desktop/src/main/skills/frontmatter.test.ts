import { describe, expect, it } from 'vitest';
import { extractFrontmatter, parseSkillFrontmatter, parseYamlLite } from './frontmatter';

describe('parseSkillFrontmatter（README 8.4.3）', () => {
  it('合法 frontmatter：name/description 与可选字段', () => {
    const md = [
      '---',
      'name: my-skill',
      'description: 一个测试技能',
      'license: MIT',
      'compatibility: pi>=1.0',
      'metadata:',
      '  category: demo',
      'allowed-tools:',
      '  - bash',
      '  - read_file',
      'disable-model-invocation: true',
      '---',
      '',
      '正文',
    ].join('\n');
    const r = parseSkillFrontmatter(md);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.frontmatter.name).toBe('my-skill');
    expect(r.frontmatter.description).toBe('一个测试技能');
    expect(r.frontmatter.license).toBe('MIT');
    expect(r.frontmatter.compatibility).toBe('pi>=1.0');
    expect(r.frontmatter.metadata).toEqual({ category: 'demo' });
    expect(r.frontmatter.allowedTools).toEqual(['bash', 'read_file']);
    expect(r.frontmatter.disableModelInvocation).toBe(true);
  });

  it('缺 description 报错', () => {
    const r = parseSkillFrontmatter('---\nname: no-desc\n---\n正文');
    expect(r.errors).toContain('缺少 description（pi 不加载）');
  });

  it('非法 name 报错', () => {
    const r = parseSkillFrontmatter('---\nname: My Skill!\ndescription: d\n---\n');
    expect(r.errors).toContain('name 仅允许小写字母/数字/连字符（无首尾或连续连字符）');
  });

  it('description 超长给 warning 不报错', () => {
    const r = parseSkillFrontmatter(
      `---\nname: long-desc\ndescription: ${'x'.repeat(1025)}\n---\n`,
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toContain('description 超过 1024 字符');
  });

  it('无 frontmatter 时 name/description 为空并报错', () => {
    const r = parseSkillFrontmatter('纯正文');
    expect(r.frontmatter.name).toBeNull();
    expect(r.errors).toContain('缺少 name');
  });
});

describe('parseYamlLite / extractFrontmatter', () => {
  it('解析标量、内联数组与缩进 KV，嵌套块后仍能落盘', () => {
    const raw = parseYamlLite('a: 1\nb: true\nc: [x, y]\nmeta:\n  k: v\nnext: 2\n');
    expect(raw.a).toBe(1);
    expect(raw.b).toBe(true);
    expect(raw.c).toEqual(['x', 'y']);
    expect(raw.meta).toEqual({ k: 'v' });
    expect(raw.next).toBe(2);
  });

  it('extractFrontmatter 提取 data 与 body', () => {
    const { data, body } = extractFrontmatter('---\nname: x\n---\nbody');
    expect(data).toContain('name: x');
    expect(body).toBe('body');
  });
});
