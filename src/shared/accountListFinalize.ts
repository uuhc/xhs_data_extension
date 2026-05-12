// 账号列表规范化：无任何有效手机号时保留一条匿名占位槽，便于 SMS 模式下仍能走每日计数与上限。

import type { AccountItem } from '@/types/xhs';
import { storage } from './storage';
import { STORAGE_KEYS } from './constants';

/** 占位行默认上限（可被用户修改为 0） */
export const DEFAULT_ANONYMOUS_MAX_COLLECT = 200;

export const DEFAULT_ANONYMOUS_ACCOUNT: AccountItem = {
  phone: '',
  codeUrl: '',
  maxCollectCount: DEFAULT_ANONYMOUS_MAX_COLLECT,
};

export function normalizeAccountRow(x: unknown): AccountItem | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  return {
    phone: String(o.phone ?? '').trim(),
    codeUrl: String(o.codeUrl ?? '').trim(),
    maxCollectCount: Number.isFinite(+String(o.maxCollectCount))
      ? +String(o.maxCollectCount)
      : DEFAULT_ANONYMOUS_MAX_COLLECT,
  };
}

/** 抽取 storage 数组中的账号行（不应用占位规则） */
export function extractAccountRows(raw: unknown): AccountItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeAccountRow).filter((r): r is AccountItem => r != null);
}

/**
 * - 若有任意非空手机号，则只保留这些行（去掉误存的空手机号行）。
 * - 否则保留一条匿名槽；若原先有空手机号行则合并保留其 codeUrl / maxCollectCount。
 */
export function finalizeAccountList(raw: unknown): AccountItem[] {
  const rows = extractAccountRows(raw);
  const withPhone = rows.filter((a) => a.phone.trim() !== '');
  if (withPhone.length > 0) return withPhone;

  const emptyRows = rows.filter((a) => a.phone.trim() === '');
  if (emptyRows.length === 0) return [{ ...DEFAULT_ANONYMOUS_ACCOUNT }];

  let acc = { ...DEFAULT_ANONYMOUS_ACCOUNT };
  for (const cur of emptyRows) {
    acc = {
      phone: '',
      codeUrl: acc.codeUrl || cur.codeUrl || '',
      maxCollectCount:
        Number.isFinite(cur.maxCollectCount) && cur.maxCollectCount >= 0
          ? cur.maxCollectCount
          : acc.maxCollectCount,
    };
  }
  return [acc];
}

function listsEqualJson(a: AccountItem[], b: AccountItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 读到账号列表后与 finalize 对齐；不一致则写回 storage（供 panel background 共用）。 */
export async function ensureAccountListHydrated(): Promise<AccountItem[]> {
  const raw = await storage.getOne<unknown>(STORAGE_KEYS.accountList);
  const finalized = finalizeAccountList(raw);
  const previous = extractAccountRows(raw);
  if (!listsEqualJson(previous, finalized)) {
    await storage.setOne(STORAGE_KEYS.accountList, finalized);
  }
  return finalized;
}
