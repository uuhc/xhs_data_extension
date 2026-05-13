// 中央采集统计写者：把所有 read-modify-write 操作串行化，消除并发覆盖。
//
// 背景：
//   - 旧实现里 `panel.resetCount` 和 `isolate.+1` 分别直接写 chrome.storage，
//     get → set 间无法上锁，两个 context 写回的瞬间可能互相覆盖。
//   - 这里把所有 stats 写入收敛到 background SW；SW 是单线程 JS，
//     `runSerial()` 用一条 Promise 链让队列里的 op 串行执行；
//     `chrome.storage.local.get → set` 之间不再被另一个写者插入。
//
// 入口：`handleStatsOp(payload)`，由 onMessage 调用。
// 写者：isolate（+1）/ panel（reset / clearAll）。

import { storage } from '@shared/storage';
import { STORAGE_KEYS } from '@shared/constants';
import { getTodayDateStr } from '@shared/time';
import {
  getQrSessionStats,
  setQrSessionStats,
  getQrLoginDefaultMax,
  qrSessionMax,
} from '@shared/qrSession';
import type { AccountCollectStats, QrSessionStat, AccountItem } from '@/types/xhs';
import type { StatsOpPayload } from '@/types/messages';

export interface StatsOpResult {
  ok: boolean;
  /** 当 op=increment（sms）时返回的最新累计 + 上限，便于调用方打日志 */
  smsIncrement?: { accIdx: number; newCount: number; maxC: number };
  /** 当 op=increment（qr）时返回最新累计 + 上限 */
  qrIncrement?: { today: number; max: number } | null;
  error?: string;
}

let queue: Promise<unknown> = Promise.resolve();

function runSerial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  // 把 queue 推进到「当前 op 完成」之后；不冒泡错误，确保下一 op 不被前面失败阻断。
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function smsIncrement(): Promise<StatsOpResult> {
  const so = await storage.get([
    STORAGE_KEYS.selectedAccountIndex,
    STORAGE_KEYS.accountList,
    STORAGE_KEYS.accountCollectStats,
  ]);
  const accIdx = parseInt(so[STORAGE_KEYS.selectedAccountIndex], 10) || 0;
  const accs: AccountItem[] = so[STORAGE_KEYS.accountList] || [];
  const accKey = String(accIdx);
  const todayStr = getTodayDateStr();
  const stats: AccountCollectStats = so[STORAGE_KEYS.accountCollectStats] || {};
  if (!stats[accKey]) stats[accKey] = {};
  stats[accKey][todayStr] = (stats[accKey][todayStr] || 0) + 1;
  const newCount = stats[accKey][todayStr];
  await storage.set({ [STORAGE_KEYS.accountCollectStats]: stats });
  const maxC = accs[accIdx]?.maxCollectCount != null ? accs[accIdx].maxCollectCount : 200;
  return { ok: true, smsIncrement: { accIdx, newCount, maxC } };
}

async function smsReset(idx: number): Promise<StatsOpResult> {
  const raw =
    (await storage.getOne<AccountCollectStats>(STORAGE_KEYS.accountCollectStats)) || {};
  const next: AccountCollectStats = {};
  for (const k of Object.keys(raw)) next[k] = { ...(raw[k] || {}) };
  const key = String(idx);
  if (!next[key]) next[key] = {};
  delete next[key][getTodayDateStr()];
  await storage.setOne(STORAGE_KEYS.accountCollectStats, next);
  return { ok: true };
}

async function smsClearAll(): Promise<StatsOpResult> {
  await storage.setOne(STORAGE_KEYS.accountCollectStats, {});
  return { ok: true };
}

/** 把当前选中账号今日计数强制设为 maxC，用来在打开搜索页失败时尽快进入「今日暂停」 */
async function smsForceQuotaReached(): Promise<StatsOpResult> {
  const so = await storage.get([
    STORAGE_KEYS.selectedAccountIndex,
    STORAGE_KEYS.accountList,
    STORAGE_KEYS.accountCollectStats,
  ]);
  const accIdx = parseInt(so[STORAGE_KEYS.selectedAccountIndex], 10) || 0;
  const accs: AccountItem[] = so[STORAGE_KEYS.accountList] || [];
  const maxC = accs[accIdx]?.maxCollectCount != null ? accs[accIdx].maxCollectCount : 200;
  const accKey = String(accIdx);
  const today = getTodayDateStr();
  const stats: AccountCollectStats = so[STORAGE_KEYS.accountCollectStats] || {};
  if (!stats[accKey]) stats[accKey] = {};
  stats[accKey][today] = maxC;
  await storage.set({ [STORAGE_KEYS.accountCollectStats]: stats });
  return { ok: true, smsIncrement: { accIdx, newCount: maxC, maxC } };
}

/** 删除 N 天前的历史日桶（仅 BG GC 调用），在串行队列里执行避免覆盖 +1 / reset */
async function smsPruneOldDays(keepDays: number): Promise<StatsOpResult> {
  const raw =
    (await storage.getOne<AccountCollectStats>(STORAGE_KEYS.accountCollectStats)) || {};
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  const minKey = cutoff.toISOString().slice(0, 10);
  let changed = false;
  for (const accKey of Object.keys(raw)) {
    const bucket = raw[accKey];
    if (!bucket || typeof bucket !== 'object') continue;
    for (const day of Object.keys(bucket)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < minKey) {
        delete bucket[day];
        changed = true;
      }
    }
  }
  if (changed) await storage.setOne(STORAGE_KEYS.accountCollectStats, raw);
  return { ok: true };
}

async function qrIncrement(hash: string): Promise<StatsOpResult> {
  if (!hash) return { ok: false, error: 'no_hash' };
  // 与 shared/qrSession 的 incrementQrSessionToday 同语义，但在串行队列内完成读改写。
  const defaultMax = await getQrLoginDefaultMax();
  const now = Date.now();
  const today = getTodayDateStr();
  const map = await getQrSessionStats();
  let s: QrSessionStat | undefined = map[hash];
  if (!s) {
    s = { firstSeenAt: now, lastUsedAt: now, daily: {} };
    map[hash] = s;
  }
  s.lastUsedAt = now;
  s.daily[today] = (s.daily[today] || 0) + 1;
  await setQrSessionStats(map);
  const max = qrSessionMax(map, hash, defaultMax);
  return { ok: true, qrIncrement: { today: s.daily[today], max } };
}

async function qrReset(hash: string): Promise<StatsOpResult> {
  if (!hash) return { ok: false, error: 'no_hash' };
  const map = await getQrSessionStats();
  const s = map[hash];
  if (!s) return { ok: false, error: 'no_session' };
  const today = getTodayDateStr();
  s.daily = { ...(s.daily || {}) };
  delete s.daily[today];
  map[hash] = s;
  await setQrSessionStats(map);
  return { ok: true };
}

async function qrClearAll(): Promise<StatsOpResult> {
  const map = await getQrSessionStats();
  for (const h of Object.keys(map)) {
    map[h] = { ...map[h], daily: {} };
  }
  await setQrSessionStats(map);
  return { ok: true };
}

/** 登记一个 sessionHash（扫码成功后首次注册 / 更新 lastUsedAt）；不覆盖 alias / max */
async function qrRegister(hash: string): Promise<StatsOpResult> {
  if (!hash) return { ok: false, error: 'no_hash' };
  const map = await getQrSessionStats();
  const now = Date.now();
  const existed = map[hash];
  if (existed) {
    existed.lastUsedAt = now;
  } else {
    map[hash] = { firstSeenAt: now, lastUsedAt: now, daily: {} };
  }
  await setQrSessionStats(map);
  return { ok: true };
}

/** 部分更新 alias / maxCollectCount，保留其他字段（包括 daily 计数） */
async function qrUpdate(
  hash: string,
  alias: string | null | undefined,
  maxCollectCount: number | null | undefined,
): Promise<StatsOpResult> {
  if (!hash) return { ok: false, error: 'no_hash' };
  const map = await getQrSessionStats();
  const now = Date.now();
  const cur: QrSessionStat =
    map[hash] != null
      ? { ...map[hash], daily: { ...(map[hash].daily || {}) } }
      : { firstSeenAt: now, lastUsedAt: now, daily: {} };
  if (alias !== undefined && alias !== null) {
    cur.alias = String(alias).trim();
  }
  if (maxCollectCount !== undefined) {
    if (maxCollectCount === null) {
      delete cur.maxCollectCount;
    } else if (Number.isFinite(maxCollectCount) && maxCollectCount >= 0) {
      cur.maxCollectCount = maxCollectCount;
    }
  }
  map[hash] = cur;
  await setQrSessionStats(map);
  return { ok: true };
}

async function qrRemove(hash: string): Promise<StatsOpResult> {
  if (!hash) return { ok: false, error: 'no_hash' };
  const map = await getQrSessionStats();
  if (!map[hash]) return { ok: true };
  delete map[hash];
  await setQrSessionStats(map);
  return { ok: true };
}

export function handleStatsOp(payload: StatsOpPayload): Promise<StatsOpResult> {
  return runSerial(async () => {
    if (payload.kind === 'sms') {
      switch (payload.op) {
        case 'increment':
          return smsIncrement();
        case 'reset':
          return smsReset(payload.idx);
        case 'clearAll':
          return smsClearAll();
        case 'pruneOldDays':
          return smsPruneOldDays(payload.keepDays);
        case 'forceQuotaReached':
          return smsForceQuotaReached();
      }
    }
    if (payload.kind === 'qr') {
      switch (payload.op) {
        case 'increment':
          return qrIncrement(payload.hash);
        case 'reset':
          return qrReset(payload.hash);
        case 'clearAll':
          return qrClearAll();
        case 'register':
          return qrRegister(payload.hash);
        case 'update':
          return qrUpdate(payload.hash, payload.alias, payload.maxCollectCount);
        case 'remove':
          return qrRemove(payload.hash);
      }
    }
    return { ok: false, error: 'unknown_op' };
  });
}
