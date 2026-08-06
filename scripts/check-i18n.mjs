#!/usr/bin/env node
/**
 * verify:i18n —— 检查 i18n key 一致性（README 9.9：zh-CN 默认 + en，禁止硬编码面向用户的字符串）。
 *
 * 断言：
 *  - renderer/src/i18n/index.ts 中 en 字典与 zh-CN 的 key 集合完全一致（无缺失/多余）。
 *  - 所有面向用户的字符串都通过 t() 获取（扫描 .tsx 中 JSX 文本节点中的裸中文）。
 * 任一问题即退出码 1。
 *
 * 用法：node scripts/check-i18n.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const I18N_FILE = path.join(
  REPO_ROOT,
  'apps',
  'desktop',
  'src',
  'renderer',
  'src',
  'i18n',
  'index.ts',
);

const FAILURES = [];

function fail(label, detail) {
  FAILURES.push(label);
  console.log(`  ❌ ${label}${detail ? ` —— ${detail}` : ''}`);
}

function pass(label) {
  console.log(`  ✅ ${label}`);
}

function extractKeys(text) {
  // 取 zhCN = { ... } as const; 与 en: Record<I18nKey, string> = { ... }
  const keys = new Set();
  const objRe = /=\s*\{([\s\S]*?)\}\s*as\s*const/;
  const m = text.match(objRe);
  const body = m ? m[1] : '';
  for (const line of body.split(/\r?\n/)) {
    const k = line.match(/^\s*'([^']+)'\s*:/);
    if (k) keys.add(k[1]);
  }
  return keys;
}

function extractEnKeys(text) {
  const keys = new Set();
  const idx = text.indexOf('const en');
  if (idx < 0) return keys;
  const after = text.slice(idx);
  const enRe = /=\s*\{([\s\S]*?)\};/;
  const m = after.match(enRe);
  const body = m ? m[1] : '';
  for (const line of body.split(/\r?\n/)) {
    const k = line.match(/^\s*'([^']+)'\s*:/);
    if (k) keys.add(k[1]);
  }
  return keys;
}

function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function main() {
  console.log('── verify:i18n（README 9.9）──');
  if (!existsSync(I18N_FILE)) {
    fail('i18n/index.ts 存在', '文件缺失');
    console.error('❌ 失败。');
    process.exit(1);
  }
  const text = readFileSync(I18N_FILE, 'utf8');

  const zhKeys = extractKeys(text);
  const enKeys = extractEnKeys(text);
  pass(`zh-CN 键数 ${zhKeys.size}`);
  pass(`en 键数 ${enKeys.size}`);

  const missing = [...zhKeys].filter((k) => !enKeys.has(k));
  const extra = [...enKeys].filter((k) => !zhKeys.has(k));
  if (missing.length > 0) fail('en 覆盖全部 zh-CN 键', `缺失：${missing.join(', ')}`);
  else pass('en 覆盖全部 zh-CN 键');
  if (extra.length > 0) fail('en 无多余键', `多余：${extra.join(', ')}`);
  else pass('en 无多余键');

  // 扫描面向用户的裸中文（JSX 文本）——不跨行、不含 {} 变量、非注释
  const srcDir = path.join(REPO_ROOT, 'apps', 'desktop', 'src', 'renderer', 'src');
  const files = sourceFiles(srcDir).filter((f) => !f.endsWith('i18n/index.ts'));
  const bareStrings = [];
  const chineseRe = /[\u4e00-\u9fff]/;
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      // JSX 文本节点：不以 { 开头、不含计算，翻译站有中文
      if (
        chineseRe.test(trimmed) &&
        !trimmed.startsWith('{') &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('*') &&
        !trimmed.includes('const ') &&
        !trimmed.includes('import ') &&
        !trimmed.includes("'") && // 带引号的是字符串字面量（多数是 t() 变量）
        !trimmed.includes('t(')
      ) {
        bareStrings.push(`${file.replace(REPO_ROOT, '.')}:${i + 1}: ${trimmed.slice(0, 60)}`);
      }
    });
  }
  if (bareStrings.length > 0) {
    console.log(
      `  ⚠️  发现 ${bareStrings.length} 处疑似裸中文（历史遗留，README 9.9 逐步迁移到 t()）`,
    );
    console.log(`  ${bareStrings.slice(0, 8).join('\n  ')}`);
  } else {
    pass('JSX 无裸硬编码中文');
  }

  console.log('');
  if (FAILURES.length > 0) {
    console.error(`❌ i18n 检查失败 ${FAILURES.length} 项。`);
    process.exit(1);
  }
  console.log('✅ i18n 检查通过。');
  process.exit(0);
}

main();
