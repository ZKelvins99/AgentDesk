/**
 * Skill 可管理清单（README 8.4.1 / 4.11）：
 * 扫描全局（~/.pi/agent/skills、~/.agents/skills）与项目（.pi/skills、.agents/skills）的
 * 磁盘 skill，解析 frontmatter 并校验，与 settings.skills[] 排除规则做 diff，
 * 标注 active / disabled / invalid / shadowed。启停只写 settings.json，不删用户文件。
 */
import { type Dirent, existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { McpScope } from '@agentdesk/ipc';
import { parseSkillFrontmatter, type SkillFrontmatter } from './frontmatter';
import {
  addSkillExclusion,
  isSkillExcluded,
  readPiSettings,
  relativeSkillPath,
  removeSkillExclusion,
  writePiSettings,
} from './pi-settings';

export type SkillSource = 'global' | 'project';
export type SkillStatus = 'active' | 'disabled' | 'invalid' | 'shadowed';

export interface SkillView extends SkillFrontmatter {
  id: string;
  source: SkillSource;
  scope: McpScope;
  kind: 'dir' | 'file';
  path: string;
  dir: string;
  files: string[];
  status: SkillStatus;
  errors: string[];
  warnings: string[];
}

interface DiscoveredSkill {
  kind: 'dir' | 'file';
  path: string;
  dir: string;
}

export interface SkillManagerOptions {
  agentDir?: string;
  homeDir?: string;
}

const MAX_READ_CHARS = 50_000;

function normalize(p: string): string {
  return p.split('\\').join('/');
}

function listTopLevel(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name !== '.git')
      .slice(0, 50);
  } catch {
    return [];
  }
}

export class SkillManager {
  private readonly agentDir: string;
  private readonly homeDir: string;

  constructor(options: SkillManagerOptions = {}) {
    this.agentDir =
      options.agentDir ?? process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), '.pi', 'agent');
    this.homeDir = options.homeDir ?? homedir();
  }

  list(workspacePath?: string): SkillView[] {
    const discovered: Array<{
      skill: DiscoveredSkill;
      source: SkillSource;
      scope: McpScope;
      settingsDir: string;
    }> = [];
    const pushRoot = (
      root: string,
      allowFileSkills: boolean,
      source: SkillSource,
      scope: McpScope,
      settingsDir: string,
    ): void => {
      if (!existsSync(root)) return;
      if (existsSync(path.join(root, 'SKILL.md'))) {
        discovered.push({
          skill: { kind: 'dir', path: path.join(root, 'SKILL.md'), dir: root },
          source,
          scope,
          settingsDir,
        });
      }
      this.walk(root, allowFileSkills, (skill) =>
        discovered.push({ skill, source, scope, settingsDir }),
      );
    };

    pushRoot(path.join(this.agentDir, 'skills'), true, 'global', 'global', this.agentDir);
    pushRoot(
      path.join(this.homeDir, '.agents', 'skills'),
      false,
      'global',
      'global',
      this.agentDir,
    );
    if (workspacePath) {
      const projectSettingsDir = path.join(workspacePath, '.pi');
      pushRoot(
        path.join(projectSettingsDir, 'skills'),
        true,
        'project',
        'workspace',
        projectSettingsDir,
      );
      pushRoot(
        path.join(workspacePath, '.agents', 'skills'),
        false,
        'project',
        'workspace',
        projectSettingsDir,
      );
    }

    const globalSettings = readPiSettings(path.join(this.agentDir, 'settings.json'));
    const projectSettings = workspacePath
      ? readPiSettings(path.join(workspacePath, '.pi', 'settings.json'))
      : null;
    const exclusionEntries = [...(globalSettings.skills ?? []), ...(projectSettings?.skills ?? [])];

    const views: SkillView[] = discovered.map(({ skill, source, scope, settingsDir }) =>
      this.toView(skill, source, scope, settingsDir, exclusionEntries),
    );

    // 重名让位：pi 保留先找到的（全局先于项目），后续同名校验通过项标 shadowed
    const byName = new Map<string, SkillView>();
    for (const view of views) {
      if (view.status === 'invalid' || !view.name) continue;
      if (byName.has(view.name)) {
        view.status = 'shadowed';
        view.warnings.push(`与 ${byName.get(view.name)?.path} 重名，pi 保留先找到的`);
      } else {
        byName.set(view.name, view);
      }
    }
    return views;
  }

  read(id: string, workspacePath?: string): { content: string } | null {
    const view = this.list(workspacePath).find((v) => v.id === id);
    if (!view) return null;
    try {
      return { content: readFileSync(view.path, 'utf8').slice(0, MAX_READ_CHARS) };
    } catch {
      return null;
    }
  }

  setEnabled(id: string, enabled: boolean, workspacePath?: string): SkillView {
    const view = this.list(workspacePath).find((v) => v.id === id);
    if (!view) throw new Error(`Skill ${id} 不存在`);
    const settingsFile =
      view.scope === 'global'
        ? path.join(this.agentDir, 'settings.json')
        : path.join(workspacePath ?? '', '.pi', 'settings.json');
    const settingsDir =
      view.scope === 'global' ? this.agentDir : path.join(workspacePath ?? '', '.pi');
    const target = view.kind === 'dir' ? view.dir : view.path;
    const relPath = relativeSkillPath(settingsDir, target);
    const settings = readPiSettings(settingsFile);
    const skills = settings.skills ?? [];
    const nextSkills = enabled
      ? removeSkillExclusion(skills, relPath, target)
      : addSkillExclusion(skills, relPath);
    writePiSettings(settingsFile, { ...settings, skills: nextSkills });
    const refreshed = this.list(workspacePath).find((v) => v.id === id);
    if (!refreshed) throw new Error(`Skill ${id} 刷新失败`);
    return refreshed;
  }

  private walk(
    root: string,
    allowFileSkills: boolean,
    onFound: (skill: DiscoveredSkill) => void,
  ): void {
    const visit = (dir: string): void => {
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (existsSync(path.join(full, 'SKILL.md'))) {
            onFound({ kind: 'dir', path: path.join(full, 'SKILL.md'), dir: full });
          } else {
            visit(full);
          }
        } else if (allowFileSkills && entry.name.endsWith('.md') && dir === root) {
          onFound({ kind: 'file', path: full, dir });
        }
      }
    };
    visit(root);
  }

  private toView(
    skill: DiscoveredSkill,
    source: SkillSource,
    scope: McpScope,
    settingsDir: string,
    exclusionEntries: string[],
  ): SkillView {
    let markdown = '';
    try {
      markdown = readFileSync(skill.path, 'utf8').slice(0, MAX_READ_CHARS);
    } catch {
      // 读取失败按 invalid 处理
    }
    const parsed = parseSkillFrontmatter(markdown);
    const target = skill.kind === 'dir' ? skill.dir : skill.path;
    const relPath = relativeSkillPath(settingsDir, target);
    const disabled = isSkillExcluded(exclusionEntries, relPath, target);
    const status: SkillStatus =
      parsed.errors.length > 0 ? 'invalid' : disabled ? 'disabled' : 'active';
    return {
      id: `${scope}:${skill.kind}:${normalize(target)}`,
      ...parsed.frontmatter,
      source,
      scope,
      kind: skill.kind,
      path: skill.path,
      dir: skill.dir,
      files: skill.kind === 'dir' ? listTopLevel(skill.dir) : [path.basename(skill.path)],
      status,
      errors: parsed.errors,
      warnings: parsed.warnings,
    };
  }
}
