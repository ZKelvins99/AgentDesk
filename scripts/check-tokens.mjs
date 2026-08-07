/**
 * 样式 token 一致性检查（前端现代化提示词 6.2）。
 * 硬编码字号 / 颜色超阈则失败；间距走 var 比例过低则警告。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve('apps/desktop/src/renderer/src/styles.css');
const css = readFileSync(file, 'utf8');

const hardFont = (css.match(/font-size:\s*[\d.]+px/g) || []).length;
const hardHex = (css.match(/:\s*#[0-9a-fA-F]{3,8}/g) || []).length;
const spaceAll = (css.match(/(?:gap|padding|margin)[a-z-]*:/g) || []).length;
const spaceVar = (css.match(/(?:gap|padding|margin)[a-z-]*:[^;]*var\(/g) || []).length;
const fffd = (css.match(/\uFFFD/g) || []).length;
const fontKinds = new Set([...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => m[1])).size;
const negLetter = (css.match(/letter-spacing:\s*-/g) || []).length;
const lineHeightOne = (css.match(/line-height:\s*1\s*;/g) || []).length;

const report = { hardFont, hardHex, spaceAll, spaceVar, fontKinds, fffd, negLetter, lineHeightOne };
console.log(JSON.stringify(report, null, 2));

let failed = false;
if (hardFont > 0) {
  console.error(`FAIL: hard-coded font-size = ${hardFont} (target 0)`);
  failed = true;
}
if (hardHex > 0) {
  console.error(`FAIL: hard-coded hex color = ${hardHex} (target 0)`);
  failed = true;
}
if (fffd > 0) {
  console.error(`FAIL: U+FFFD present = ${fffd}`);
  failed = true;
}
if (negLetter > 0) {
  console.error(`FAIL: negative letter-spacing = ${negLetter}`);
  failed = true;
}
if (lineHeightOne > 0) {
  console.error(`FAIL: line-height:1 = ${lineHeightOne}`);
  failed = true;
}
if (spaceAll > 0 && spaceVar / spaceAll < 0.9) {
  console.error(`FAIL: spacing var ratio ${spaceVar}/${spaceAll} < 90%`);
  failed = true;
}

if (failed) process.exit(1);
console.log('OK: token consistency checks passed');
