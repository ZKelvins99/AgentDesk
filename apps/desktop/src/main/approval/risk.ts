import path from 'node:path';
import type { RiskLevel } from './types';

/**
 * 风险分级（README 8.7.2）：
 * 高危 —— rm -rf / sudo / 磁盘分区 / curl|sh / git push --force / 系统目录与凭据文件 / 外发数据；
 * 中危 —— 工作区外写入、安装依赖、长驻进程、未白名单 MCP 工具；
 * 低危 —— 工作区内读写、格式化/构建/测试命令。
 */

export function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

const SENSITIVE_PATH_PATTERNS = [
  /(^|[\\/])\.env([\\/.]|$)/i,
  /(^|[\\/])id_rsa([\\/.]|$)/i,
  /(^|[\\/])\.pem([\\/.]|$)/i,
  /(^|[\\/])auth\.json([\\/.]|$)/i,
  /(^|[\\/])\.ssh([\\/.]|$)/i,
  /(^|[\\/])\.aws([\\/.]|$)/i,
  /(^|[\\/])\.git[\\/]config([\\/.]|$)/i,
];

const SYSTEM_DIR_PREFIXES = [
  /^C:\\Windows/i,
  /^C:\\Program Files/i,
  /^C:\\Program Files \(x86\)/i,
  /^\/(etc|usr|var|System|sbin|bin)\//i,
];

function looksLikeSensitivePath(p: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((re) => re.test(p));
}

function isSystemPath(p: string): boolean {
  return SYSTEM_DIR_PREFIXES.some((re) => re.test(p));
}

function isHighBash(cmd: string): boolean {
  if (/(^|\s)rm\s+(-[a-z0-9]*\s+)*(-[a-z0-9]*r[a-z0-9]*\b|--recursive\b|-r\b)/i.test(cmd))
    return true;
  if (/(^|\s)sudo\b/i.test(cmd)) return true;
  if (/(^|\s)(mkfs|fdisk|parted|format)\b/i.test(cmd)) return true;
  if (/(curl|wget)\b[^|]*\|\s*(sh|bash)\b/i.test(cmd)) return true;
  if (/\bgit\s+push\b[^|]*--force\b/i.test(cmd)) return true;
  if (/\b(curl|wget)\b[^|]*(--data|-d\s|--upload|-T\s)/i.test(cmd)) return true;
  return false;
}

function isMediumBash(cmd: string): boolean {
  if (/(npm|pnpm|yarn|pip|pip3|pipx|gem|brew|cargo|uv)\s+(install|add|i|uninstall)\b/i.test(cmd))
    return true;
  if (/(npm|pnpm|yarn)\s+(run|start|dev)\b/i.test(cmd)) return true;
  if (/[^\n|]*(node|python|python3|npx)\b[^\n|]*(serve|server|watch|--watch|dev)\b/i.test(cmd))
    return true;
  return false;
}

function commandOf(input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  return typeof i.command === 'string' ? i.command : '';
}

function pathOf(input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  return typeof i.path === 'string' ? i.path : '';
}

export function classifyRisk(
  tool: string,
  input: unknown,
  cwd: string,
  workspacePath: string | null,
): RiskLevel {
  if (tool === 'bash') {
    const cmd = commandOf(input);
    if (isHighBash(cmd)) return 'high';
    if (isMediumBash(cmd)) return 'medium';
    return 'low';
  }
  if (tool === 'read') {
    return looksLikeSensitivePath(pathOf(input)) ? 'high' : 'low';
  }
  if (tool === 'write' || tool === 'edit') {
    const p = path.resolve(cwd, pathOf(input));
    if (looksLikeSensitivePath(p) || isSystemPath(p)) return 'high';
    if (workspacePath && !isPathInside(workspacePath, p)) return 'medium';
    return 'low';
  }
  if (tool.startsWith('mcp__')) return 'medium';
  return 'low';
}
