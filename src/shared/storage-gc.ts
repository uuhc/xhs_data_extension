// chrome.storage.local 过期数据淘汰：定期清理无限增长的历史统计数据

import { storage } from './storage';
import { STORAGE_KEYS } from './constants';

function pruneDayKeys(obj: Record<string, any>, keepDays: number): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  const minKey = cutoff.toISOString().slice(0, 10);
  let changed = false;
  for (const k of Object.keys(obj)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k < minKey) {
      delete obj[k];
      changed = true;
    }
  }
  return changed;
}

async function pruneAccountCollectStats(keepDays = 7): Promise<void> {
  const raw = await storage.getOne<Record<string, Record<string, number>>>(
    STORAGE_KEYS.accountCollectStats,
  );
  if (!raw || typeof raw !== 'object') return;
  let changed = false;
  for (const accKey of Object.keys(raw)) {
    if (raw[accKey] && typeof raw[accKey] === 'object') {
      if (pruneDayKeys(raw[accKey], keepDays)) changed = true;
    }
  }
  if (changed) await storage.setOne(STORAGE_KEYS.accountCollectStats, raw);
}

async function pruneCallbackDailyStats(keepDays = 7): Promise<void> {
  const raw = await storage.getOne<Record<string, any>>(STORAGE_KEYS.callbackDailyStats);
  if (!raw || typeof raw !== 'object') return;
  if (pruneDayKeys(raw, keepDays)) {
    await storage.setOne(STORAGE_KEYS.callbackDailyStats, raw);
  }
}

async function pruneExecutedKeywords(maxSize = 2000): Promise<void> {
  const arr = await storage.getOne<string[]>(STORAGE_KEYS.orderedSearchExecutedKeywords);
  if (!Array.isArray(arr) || arr.length <= maxSize) return;
  await storage.setOne(STORAGE_KEYS.orderedSearchExecutedKeywords, arr.slice(-maxSize));
}

/** 一次性执行所有清理，适合在自动任务启动时调用 */
export async function runStorageGC(): Promise<void> {
  await Promise.all([
    pruneAccountCollectStats(),
    pruneCallbackDailyStats(),
    pruneExecutedKeywords(),
  ]);
}
