/**
 * 模型标签归一化。
 *
 * pi 在未配置供应商 / 密钥时，session.state 会带一个占位模型 id（实测为 `unknown`），
 * 直接渲染会让界面到处出现「unknown」。这里统一收口：占位值一律当作「未选择模型」。
 */
import { t } from '../i18n';

const PLACEHOLDER_MODEL_IDS = new Set(['unknown', 'unset', 'none', 'default', 'null']);

/** 是否是一个真正可用的模型 id（而非 pi 的占位值）。 */
export function isRealModel(model: string | null | undefined): boolean {
  if (!model) return false;
  return !PLACEHOLDER_MODEL_IDS.has(model.trim().toLowerCase());
}

/** 去掉 provider 前缀，只留可辨识的模型名（`openai/gpt-4o` → `gpt-4o`）。 */
export function shortModelName(model: string): string {
  const slash = model.lastIndexOf('/');
  return slash >= 0 ? model.slice(slash + 1) : model;
}

/** 徽标文案：可用模型显示简洁名，占位 / 缺失时显示「选择模型」。 */
export function modelLabel(model: string | null | undefined): string {
  if (!isRealModel(model) || !model) return t('composer.selectModel');
  return shortModelName(model);
}

/** 详情场景（右侧面板等）用的完整文案，未选择时给出破折号。 */
export function modelDetail(model: string | null | undefined): string {
  return isRealModel(model) && model ? model : '—';
}
