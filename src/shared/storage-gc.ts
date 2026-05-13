// chrome.storage.local 过期数据淘汰：定期清理无限增长的历史统计数据

import { ALARM_NAMES, STORAGE_KEYS } from './constants';
import { getTodayDateStr } from './time';
import { sessionStore, storage } from './storage';

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

/**
 * 一次性执行所有清理，适合在自动任务启动时调用。
 * 注：`accountCollectStats` 的日桶清理由 background/statsBroker.smsPruneOldDays 负责，
 * 走统计写者串行队列与 +1 / reset 互斥；这里不再直写。
 */
export async function runStorageGC(): Promise<void> {
  await Promise.all([pruneCallbackDailyStats(), pruneExecutedKeywords()]);
}

/**
 * 新日历日时清理「业务临时数据」（不触碰账号 / 登录 / 站点配置 / 关键词配置）。
 * - session：采集中间产物、最后一行会话日志、回调状态快照、当前任务元数据。
 * - local：清空「已执行关键词」与任务缓存字典；清除跨日无用的自动任务恢复点。
 */
export async function runDailyBusinessDataPrune(): Promise<void> {
  await sessionStore.remove([
    STORAGE_KEYS.searchNotesPages,
    STORAGE_KEYS.searchNotesResult,
    STORAGE_KEYS.creatorListPages,
    STORAGE_KEYS.creatorListResult,
    STORAGE_KEYS.currentKeywordTask,
    STORAGE_KEYS.autoTaskLogLine,
    STORAGE_KEYS.autoTaskCallbackStatus,
  ]);
  await storage.remove(STORAGE_KEYS.autoTaskResumeState);
  try {
    await chrome.alarms.clear(ALARM_NAMES.autoTaskResume);
  } catch {}
  await storage.set({
    [STORAGE_KEYS.orderedSearchExecutedKeywords]: [],
    [STORAGE_KEYS.pluginKeywordTaskInfos]: {},
  });
}

/** 当日仅执行一次日历日清理；返回是否刚执行 */
export async function maybeRunDailyBusinessPrune(): Promise<boolean> {
  const today = getTodayDateStr();
  const last = await storage.getOne<string>(STORAGE_KEYS.autoTaskLastDailyPruneDate);
  if (last === today) return false;
  await runDailyBusinessDataPrune();
  await storage.setOne(STORAGE_KEYS.autoTaskLastDailyPruneDate, today);
  return true;
}
