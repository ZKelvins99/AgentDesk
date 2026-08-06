/**
 * SKILL.md frontmatter 解析与校验（README 4.11 / 8.4.3）：
 * - name 必填（≤64，小写字母/数字/连字符，无首尾/连续连字符）
 * - description 必填（≤1024，缺 description pi 不加载）
 * - 其余字段宽松解析（license / compatibility / metadata / allowed-tools / disable-model-invocation）
 */

export interface SkillFrontmatter {
  name: string | null;
  description: string | null;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  allowedTools?: string[];
  disableModelInvocation?: boolean;
}

export interface FrontmatterParseResult {
  frontmatter: SkillFrontmatter;
  errors: string[];
  warnings: string[];
  infos: string[];
  raw: Record<string, unknown>;
}

export const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function stripComment(value: string): string {
  return value.replace(/(^|\s)\/\/.*$/, '$1').trim();
}

function parseScalar(value: string): string | number | boolean {
  const v = value.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v.replace(/^['"]|['"]$/g, '');
}

/** YAML-lite：只支持标量、内联数组/对象与缩进的简单 KV，足够 frontmatter 校验与展示。 */
export function parseYamlLite(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentMap: Record<string, unknown> = {};
  const flushMap = (): void => {
    if (currentKey && Object.keys(currentMap).length > 0) {
      out[currentKey] = currentMap;
    }
    currentKey = null;
    currentMap = {};
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line.trim()) continue;
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const content = line.trim();
    if (indent > 0 && currentKey) {
      const idx = content.indexOf(':');
      if (idx > 0) {
        currentMap[content.slice(0, idx).trim()] = parseScalar(content.slice(idx + 1));
        continue;
      }
      const current = out[currentKey];
      if (Array.isArray(current)) {
        current.push(parseScalar(content.replace(/^-\s*/, '')));
        continue;
      }
      if (current === undefined) out[currentKey] = [parseScalar(content.replace(/^-\s*/, ''))];
      continue;
    }
    flushMap();
    const idx = content.indexOf(':');
    if (idx <= 0) continue;
    const key = content.slice(0, idx).trim();
    const rawValue = content.slice(idx + 1).trim();
    if (!rawValue) {
      currentKey = key;
      out[key] = undefined;
      continue;
    }
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      out[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((s) => parseScalar(s))
        .filter((v) => v !== '');
      continue;
    }
    out[key] = parseScalar(rawValue);
  }
  flushMap();
  return out;
}

export function extractFrontmatter(markdown: string): { data: string | null; body: string } {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { data: null, body: markdown };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return { data: null, body: markdown };
  return { data: lines.slice(1, end).join('\n'), body: lines.slice(end + 1).join('\n') };
}

export function parseSkillFrontmatter(markdown: string, dirName?: string): FrontmatterParseResult {
  const { data } = extractFrontmatter(markdown);
  const raw = data ? parseYamlLite(data) : {};
  const errors: string[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
  const description =
    typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null;

  if (!name) errors.push('缺少 name');
  else if (name.length > 64) errors.push('name 超过 64 字符');
  else if (!SKILL_NAME_RE.test(name))
    errors.push('name 仅允许小写字母/数字/连字符（无首尾或连续连字符）');

  if (!description) errors.push('缺少 description（pi 不加载）');
  else if (description.length > 1024) warnings.push('description 超过 1024 字符');

  const frontmatter: SkillFrontmatter = { name, description };
  if (typeof raw.license === 'string') frontmatter.license = raw.license.trim();
  if (typeof raw.compatibility === 'string') {
    const compatibility = raw.compatibility.trim();
    if (compatibility.length > 500) warnings.push('compatibility 超过 500 字符');
    frontmatter.compatibility = compatibility;
  }
  if (raw.metadata && typeof raw.metadata === 'object') {
    frontmatter.metadata = raw.metadata as Record<string, unknown>;
  }
  if (typeof raw['allowed-tools'] === 'string') {
    frontmatter.allowedTools = raw['allowed-tools'].split(/\s+/).filter(Boolean);
  } else if (Array.isArray(raw['allowed-tools'])) {
    frontmatter.allowedTools = raw['allowed-tools'].map((v) => String(v)).filter(Boolean);
  }
  if (raw['disable-model-invocation'] === true || raw['disable-model-invocation'] === 'true') {
    frontmatter.disableModelInvocation = true;
  }

  // info 级诊断（README 8.4.3）：不阻塞加载，但提示跨 harness / 触发时机问题
  if (name && dirName && name !== dirName) {
    infos.push(`name 与父目录名（${dirName}）不一致（pi 允许，Agent Skills 标准不允许）`);
  }
  if (description && description.length < 40) {
    infos.push('description 少于 40 字符（模型难以判断何时加载）');
  }
  if (frontmatter.allowedTools && frontmatter.allowedTools.length > 0) {
    infos.push('使用了 allowed-tools（实验性字段，行为可能变化）');
  }

  return { frontmatter, errors, warnings, infos, raw };
}
