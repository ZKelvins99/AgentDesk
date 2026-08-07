/**
 * 将 styles.css 中的硬编码字号 / 颜色吸附到 tokens.css。
 * 用法：node scripts/migrate-styles-tokens.mjs
 * 编码：UTF-8 无 BOM；行尾保持文件原有（LF）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve('apps/desktop/src/renderer/src/styles.css');
let css = readFileSync(file, 'utf8');
const hadCrlf = css.includes('\r\n');
css = css.replace(/\r\n/g, '\n');

/** 字号 → token（吸附到 6 级阶梯） */
const FONT_MAP = {
  '10px': 'var(--font-size-xs)',
  '11px': 'var(--font-size-xs)',
  '11.5px': 'var(--font-size-xs)',
  '12px': 'var(--font-size-sm)',
  '12.5px': 'var(--font-size-sm)',
  '13px': 'var(--font-size-sm)',
  '14px': 'var(--font-size-base)',
  '14.5px': 'var(--font-size-base)',
  '15px': 'var(--font-size-md)',
  '16px': 'var(--font-size-lg)',
  '18px': 'var(--font-size-lg)',
  '20px': 'var(--font-size-xl)',
  '22px': 'var(--font-size-xl)',
};

/** 颜色字面量 → 语义 token */
const COLOR_REPLACERS = [
  [/color-mix\(\s*in srgb,\s*#000\s+45%,\s*transparent\s*\)/gi, 'var(--overlay-scrim)'],
  [/var\(--ok,\s*#22c55e\)/gi, 'var(--ok)'],
  [/var\(--danger,\s*#e74c3c\)/gi, 'var(--danger)'],
  [/var\(--warn,\s*#e67e22\)/gi, 'var(--warn)'],
  [/var\(--accent,\s*#3b82f6\)/gi, 'var(--accent)'],
  [
    /color-mix\(\s*in srgb,\s*#e74c3c\s+(\d+%),\s*transparent\s*\)/gi,
    'color-mix(in srgb, var(--danger) $1, transparent)',
  ],
  [
    /color-mix\(\s*in srgb,\s*#27ae60\s+(\d+%),\s*transparent\s*\)/gi,
    'color-mix(in srgb, var(--ok) $1, transparent)',
  ],
  [
    /color-mix\(\s*in srgb,\s*#27ae60\s+(\d+%),\s*var\(--border-subtle\)\s*\)/gi,
    'color-mix(in srgb, var(--ok) $1, var(--border-subtle))',
  ],
  [
    /color-mix\(\s*in srgb,\s*#3b82f6\s+(\d+%),\s*(?:transparent|var\(--border-subtle\)|var\(--bg\))\s*\)/gi,
    'color-mix(in srgb, var(--accent) $1, transparent)',
  ],
  [
    /color-mix\(\s*in srgb,\s*#e67e22\s+(\d+%),\s*(?:transparent|var\(--border-subtle\))\s*\)/gi,
    'color-mix(in srgb, var(--warn) $1, transparent)',
  ],
  [/(?<![\w-])#2ecc71\b/gi, 'var(--ok)'],
  [/(?<![\w-])#27ae60\b/gi, 'var(--ok)'],
  [/(?<![\w-])#22c55e\b/gi, 'var(--ok)'],
  [/(?<![\w-])#3498db\b/gi, 'var(--info)'],
  [/(?<![\w-])#2980b9\b/gi, 'var(--info)'],
  [/(?<![\w-])#3b82f6\b/gi, 'var(--accent)'],
  [/(?<![\w-])#f1c40f\b/gi, 'var(--warn)'],
  [/(?<![\w-])#e67e22\b/gi, 'var(--warn)'],
  [/(?<![\w-])#e74c3c\b/gi, 'var(--danger)'],
  [/(?<![\w-])#7f8c8d\b/gi, 'var(--fg-muted)'],
  [/(?<![\w-])#fff\b/gi, 'var(--fg-on-accent)'],
  [/(?<![\w-])#ffffff\b/gi, 'var(--fg-on-accent)'],
];

/** 常见间距字面量 → space token（仅替换独立声明值） */
const SPACE_MAP = {
  '2px': 'var(--space-1)', // 吸附到 4
  '3px': 'var(--space-1)',
  '4px': 'var(--space-1)',
  '5px': 'var(--space-1)',
  '6px': 'var(--space-2)',
  '8px': 'var(--space-2)',
  '9px': 'var(--space-2)',
  '10px': 'var(--space-3)',
  '11px': 'var(--space-3)',
  '12px': 'var(--space-3)',
  '14px': 'var(--space-4)',
  '16px': 'var(--space-4)',
  '18px': 'var(--space-5)',
  '20px': 'var(--space-5)',
  '24px': 'var(--space-6)',
  '28px': 'var(--space-7)',
  '32px': 'var(--space-8)',
  '40px': 'var(--space-10)',
  '48px': 'var(--space-12)',
};

css = css.replace(/font-size:\s*([\d.]+px)/g, (full, size) => {
  const tok = FONT_MAP[size];
  return tok ? `font-size: ${tok}` : full;
});

for (const [re, rep] of COLOR_REPLACERS) {
  css = css.replace(re, rep);
}

// gap / padding / margin 单值替换（跳过已含 var( 的）
css = css.replace(
  /(^|[;\s{])((?:gap|padding|margin)(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?)\s*:\s*([^;{}]+);/gm,
  (full, pre, prop, value) => {
    const v = value.trim();
    if (v.includes('var(') || v.includes('calc(') || v.includes('env(')) return full;
    // 多值：逐段映射
    const parts = v.split(/\s+/).map((p) => {
      if (/^\d+(\.\d+)?px$/.test(p)) return SPACE_MAP[p] ?? p;
      if (p === '0' || p === '0px') return 'var(--space-0)';
      if (p === 'auto') return 'auto';
      return p;
    });
    // 若无任何 token 化则保持原样（避免把 1px 边框间距误伤；1px 不在 map 里）
    if (parts.every((p, i) => p === v.split(/\s+/)[i])) return full;
    return `${pre}${prop}: ${parts.join(' ')};`;
  },
);

// 负字距：去掉会作用于中文的收紧
css = css.replace(/\s*letter-spacing:\s*-[\d.]+em;\n?/g, '\n');

// line-height: 1 → tight（保留在需要垂直居中处改用 flex，但先抬到 tight 防 CJK 贴死）
css = css.replace(/line-height:\s*1\s*;/g, 'line-height: var(--line-height-tight);');
css = css.replace(/line-height:\s*1\.5\s*;/g, 'line-height: var(--line-height-base);');
css = css.replace(/line-height:\s*1\.6\s*;/g, 'line-height: var(--line-height-base);');

// outline: none → 仅在 :focus 上改用透明，保留 focus-visible
css = css.replace(/outline:\s*none\s*;/g, 'outline: 2px solid transparent;');

// 全局补强：input/textarea inherit + text-rendering（若尚未存在）
if (!css.includes('text-rendering: optimizeLegibility')) {
  css = css.replace(
    /-webkit-font-smoothing: antialiased;/,
    `-webkit-font-smoothing: antialiased;\n  text-rendering: optimizeLegibility;`,
  );
}
if (!css.includes('input,\ntextarea') && !css.includes('input,\r\ntextarea')) {
  css = css.replace(
    /button \{\n {2}font-family: inherit;/,
    `input,\ntextarea,\nselect,\nbutton {\n  font-family: inherit;\n  font-size: inherit;\n}\n\nbutton {\n  font-family: inherit;`,
  );
}

// z-index 常见弹层字面量
css = css.replace(/z-index:\s*1000\b/g, 'z-index: var(--z-modal)');
css = css.replace(/z-index:\s*999\b/g, 'z-index: var(--z-modal)');
css = css.replace(/z-index:\s*200\b/g, 'z-index: var(--z-overlay)');
css = css.replace(/z-index:\s*100\b/g, 'z-index: var(--z-dropdown)');
css = css.replace(/z-index:\s*50\b/g, 'z-index: var(--z-dropdown)');

const out = hadCrlf ? css.replace(/\n/g, '\r\n') : css;
writeFileSync(file, out, { encoding: 'utf8' });

// 报告
const hardFont = (out.match(/font-size:\s*[\d.]+px/g) || []).length;
const hardHex = (out.match(/:\s*#[0-9a-fA-F]{3,8}/g) || []).length;
const spaceVar = (out.match(/(?:gap|padding|margin)[a-z-]*:[^;]*var\(/g) || []).length;
const spaceAll = (out.match(/(?:gap|padding|margin)[a-z-]*:/g) || []).length;
console.log(
  JSON.stringify(
    { hardFont, hardHex, spaceVar, spaceAll, fffd: (out.match(/\uFFFD/g) || []).length },
    null,
    2,
  ),
);
