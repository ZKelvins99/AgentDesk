/** Skill 脚手架模板（README 8.4.2）：脚本型 / 文档型 / API 型。 */
export type SkillTemplate = 'script' | 'docs' | 'api';

export interface SkillSkeletonFile {
  path: string;
  content: string;
}

export interface SkillSkeleton {
  files: SkillSkeletonFile[];
}

const SECTIONS: Record<SkillTemplate, string> = {
  script:
    '## 用法\n\n通过 `/skill:<name>` 或模型自动调用。可执行脚本放在 `scripts/` 目录，SKILL.md 内用相对路径引用。\n',
  docs: '## 内容\n\n参考文档放在 `references/` 目录。\n',
  api: '## API\n\n接口说明与示例放在 `references/` 目录。\n',
};

/** 生成合规的 SKILL.md + 目录骨架。description 长度由调用方校验。 */
export function skillSkeleton(
  name: string,
  description: string,
  template: SkillTemplate,
): SkillSkeleton {
  const frontmatter = `---\nname: ${name}\ndescription: ${description}\n---\n`;
  const body = `\n# ${name}\n\n${SECTIONS[template].replaceAll('<name>', name)}`;
  const files: SkillSkeletonFile[] = [{ path: 'SKILL.md', content: frontmatter + body }];
  if (template === 'script') {
    files.push({
      path: 'scripts/README.md',
      content: '# scripts\n\n把可执行脚本放在这里，SKILL.md 内用相对路径引用。\n',
    });
  } else {
    files.push({
      path: 'references/README.md',
      content: `# references\n\n${template === 'api' ? '记录 API 端点、参数与示例。' : '存放参考资料。'}\n`,
    });
  }
  return { files };
}
