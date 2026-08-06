/**
 * Profile（Agent Dir 隔离，README 8.8.3 / 4.15）：
 * - 默认档直接用 ~/.pi/agent（与终端 pi 完全共享）
 * - 隔离档：~/.agentdesk/profiles/<id>/agent，spawn 时设 PI_CODING_AGENT_DIR
 * - 激活状态存 ~/.agentdesk/profile.json（{ activeId }），原子写（tmp + rename）
 * - 切换只持久化状态；sidecar 在应用重启后按新激活档装配（README：切换需重启所有 sidecar）
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const DEFAULT_PROFILE_ID = 'default';

export interface ProfileView {
  id: string;
  name: string;
  agentDir: string;
  isDefault: boolean;
  active: boolean;
  exists: boolean;
}

export interface ProfileManagerOptions {
  /** 隔离档根目录，默认 ~/.agentdesk/profiles */
  profilesRoot?: string;
  /** 激活状态文件，默认 ~/.agentdesk/profile.json */
  stateFile?: string;
  /** 默认档 Agent Dir，默认 PI_CODING_AGENT_DIR ?? ~/.pi/agent */
  defaultAgentDir?: string;
}

interface ProfileState {
  activeId: string;
}

export function defaultProfilesRoot(): string {
  return path.join(homedir(), '.agentdesk', 'profiles');
}

export function defaultProfileStateFile(): string {
  return path.join(homedir(), '.agentdesk', 'profile.json');
}

export function defaultProfileAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), '.pi', 'agent');
}

const SAFE_ID_RE = /^[a-z0-9](?:[a-z0-9_-]{0,63})$/;

/** id 白名单校验：小写字母/数字/下划线/连字符，禁止路径穿越。 */
export function isSafeProfileId(id: string): boolean {
  return SAFE_ID_RE.test(id);
}

/** 目录名 slug：小写、非字母数字下划线连字符统一成 -、折叠并去首尾 -；空则回退 profile。 */
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug.slice(0, 64) : 'profile';
}

export class ProfileManager {
  private readonly profilesRoot: string;
  private readonly stateFile: string;
  private readonly defaultAgentDir: string;

  constructor(options: ProfileManagerOptions = {}) {
    this.profilesRoot = options.profilesRoot ?? defaultProfilesRoot();
    this.stateFile = options.stateFile ?? defaultProfileStateFile();
    this.defaultAgentDir = options.defaultAgentDir ?? defaultProfileAgentDir();
  }

  private readState(): ProfileState {
    try {
      const raw = readFileSync(this.stateFile, 'utf8');
      const parsed = JSON.parse(raw) as { activeId?: unknown };
      if (parsed && typeof parsed === 'object' && typeof parsed.activeId === 'string') {
        if (parsed.activeId === DEFAULT_PROFILE_ID || isSafeProfileId(parsed.activeId)) {
          return { activeId: parsed.activeId };
        }
      }
    } catch {
      // 无状态文件 / 损坏 → 默认档
    }
    return { activeId: DEFAULT_PROFILE_ID };
  }

  private writeState(activeId: string): void {
    mkdirSync(path.dirname(this.stateFile), { recursive: true });
    const tmp = `${this.stateFile}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ activeId }, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.stateFile);
  }

  /** 激活档 id（缺省/损坏时回退 default）。 */
  activeId(): string {
    return this.readState().activeId;
  }

  /** 某档的 Agent Dir：默认档 → 共享 ~/.pi/agent；隔离档 → profilesRoot/<id>/agent。 */
  agentDirOf(id: string): string {
    if (id === DEFAULT_PROFILE_ID) return this.defaultAgentDir;
    return path.join(this.profilesRoot, id, 'agent');
  }

  /** 当前激活档的 Agent Dir。 */
  currentAgentDir(): string {
    return this.agentDirOf(this.activeId());
  }

  list(): ProfileView[] {
    const activeId = this.activeId();
    const views: ProfileView[] = [
      {
        id: DEFAULT_PROFILE_ID,
        name: '默认（共享 ~/.pi/agent）',
        agentDir: this.defaultAgentDir,
        isDefault: true,
        active: activeId === DEFAULT_PROFILE_ID,
        exists: existsSync(this.defaultAgentDir),
      },
    ];
    let ids: string[] = [];
    try {
      ids = readdirSync(this.profilesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((id) => isSafeProfileId(id))
        .sort();
    } catch {
      // 尚无隔离档目录
    }
    for (const id of ids) {
      views.push({
        id,
        name: this.readProfileName(id),
        agentDir: this.agentDirOf(id),
        isDefault: false,
        active: activeId === id,
        exists: existsSync(this.agentDirOf(id)),
      });
    }
    return views;
  }

  private readProfileName(id: string): string {
    try {
      const parsed = JSON.parse(
        readFileSync(path.join(this.profilesRoot, id, 'profile.json'), 'utf8'),
      ) as { name?: unknown };
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.name === 'string' &&
        parsed.name.trim()
      ) {
        return parsed.name;
      }
    } catch {
      // 回退 id
    }
    return id;
  }

  create(name: string): ProfileView {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Profile 名称不能为空');
    const id = slugify(trimmed);
    if (id === DEFAULT_PROFILE_ID) throw new Error(`不能创建名为 ${DEFAULT_PROFILE_ID} 的 Profile`);
    const dir = path.join(this.profilesRoot, id);
    if (existsSync(dir)) throw new Error(`Profile 已存在：${id}`);
    mkdirSync(path.join(dir, 'agent'), { recursive: true });
    const meta = { name: trimmed, createdAt: new Date().toISOString() };
    writeFileSync(path.join(dir, 'profile.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    return {
      id,
      name: trimmed,
      agentDir: this.agentDirOf(id),
      isDefault: false,
      active: this.activeId() === id,
      exists: true,
    };
  }

  /** 切换激活档并返回新 Agent Dir（只持久化；sidecar 需重启后生效）。 */
  switch(id: string): string {
    if (id !== DEFAULT_PROFILE_ID) {
      if (!isSafeProfileId(id)) throw new Error(`非法 Profile id：${id}`);
      if (!existsSync(path.join(this.profilesRoot, id))) throw new Error(`Profile 不存在：${id}`);
    }
    this.writeState(id);
    return this.agentDirOf(id);
  }

  /** 删除隔离档：拒绝默认档、当前激活档、非法 id 与路径穿越。 */
  delete(id: string): void {
    if (id === DEFAULT_PROFILE_ID) throw new Error('默认 Profile 不能删除');
    if (!isSafeProfileId(id)) throw new Error(`非法 Profile id：${id}`);
    if (this.activeId() === id) throw new Error('不能删除当前激活的 Profile');
    const root = path.resolve(this.profilesRoot);
    const target = path.resolve(path.join(root, id));
    if (target !== path.join(root, id) || !target.startsWith(`${root}${path.sep}`)) {
      throw new Error('非法删除目标');
    }
    if (!existsSync(target)) throw new Error(`Profile 不存在：${id}`);
    rmSync(target, { recursive: true, force: true });
  }
}
