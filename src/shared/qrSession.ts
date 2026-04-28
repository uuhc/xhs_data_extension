// 扫码登录（QR）模式下，以 web_session cookie 的 SHA-256 前缀作为账号 ID，
// 在 STORAGE_KEYS.qrSessionStats 里维护每个账号的别名 / 日采集计数 / 单账号上限覆盖。
//
// 统一在这里提供：
//   - sessionHash 计算
//   - getCurrentSessionHash / setCurrentSessionHash
//   - registerQrSession：扫码登录成功后首次登记 / 更新 lastUsedAt
//   - getQrSessionTodayCount / incrementQrSessionToday
//   - isQrSessionExceededToday
//   - QR 模式下的全局默认 max 读取

import { STORAGE_KEYS, QR_LOGIN_DEFAULT_MAX } from './constants';
import { storage } from './storage';
import { getTodayDateStr } from './time';
import type { QrSessionStat, QrSessionStatsMap } from '@/types/xhs';

const COOKIE_DOMAINS = ['.xiaohongshu.com', '.rednote.com'];
const COOKIE_NAME = 'web_session';
/** sessionHash 取 SHA-256 前 16 hex（8 字节），足够唯一、UI 展示也简短 */
const SESSION_HASH_HEX_LEN = 16;

async function sha256Hex(value: string): Promise<string> {
  const enc = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/** 从 cookie 里读出当前 web_session 值；读不到返回 '' */
export async function getCurrentWebSessionValue(): Promise<string> {
  for (const domain of COOKIE_DOMAINS) {
    const cookies = await new Promise<chrome.cookies.Cookie[]>((resolve) =>
      chrome.cookies.getAll({ domain, name: COOKIE_NAME }, (c) => resolve(c || [])),
    );
    for (const c of cookies) {
      if (c.value && c.value.length > 8) return c.value;
    }
  }
  return '';
}

/** 对 web_session 值算 sessionHash（前 16 hex）；传入空字符串返回 '' */
export async function computeSessionHash(webSessionValue: string): Promise<string> {
  if (!webSessionValue) return '';
  const hex = await sha256Hex(webSessionValue);
  return hex.slice(0, SESSION_HASH_HEX_LEN);
}

/** 读当前登录账号的 sessionHash：优先读 cookie 实时计算；无 cookie 返回空 */
export async function getCurrentSessionHashFromCookie(): Promise<string> {
  const val = await getCurrentWebSessionValue();
  return computeSessionHash(val);
}

/** 读 storage 里记忆的 sessionHash（不查 cookie，比较快） */
export async function getStoredCurrentSessionHash(): Promise<string> {
  const v = await storage.getOne<string>(STORAGE_KEYS.currentQrSessionHash);
  return v || '';
}

/** 设置 storage 里记忆的 sessionHash；isolate 写回传计数时会读这个值 */
export async function setCurrentSessionHash(hash: string): Promise<void> {
  await storage.setOne(STORAGE_KEYS.currentQrSessionHash, hash || '');
}

/** 读 QR 全局默认单日上限；未配置或非法时 fallback 到 200 */
export async function getQrLoginDefaultMax(): Promise<number> {
  const raw = await storage.getOne<any>(STORAGE_KEYS.qrLoginDefaultMax);
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return QR_LOGIN_DEFAULT_MAX;
  return n;
}

export async function getQrSessionStats(): Promise<QrSessionStatsMap> {
  const v = await storage.getOne<QrSessionStatsMap>(STORAGE_KEYS.qrSessionStats);
  return v || {};
}

export async function setQrSessionStats(map: QrSessionStatsMap): Promise<void> {
  await storage.setOne(STORAGE_KEYS.qrSessionStats, map);
}

/**
 * 扫码登录成功后登记 / 更新一个 session：
 *   - 若 hash 尚不存在：初始化 firstSeenAt + 空 daily
 *   - 若已存在：只更新 lastUsedAt
 * 不会覆盖用户配置的 alias / maxCollectCount。
 */
export async function registerQrSession(hash: string): Promise<void> {
  if (!hash) return;
  const map = await getQrSessionStats();
  const now = Date.now();
  const existed = map[hash];
  if (existed) {
    existed.lastUsedAt = now;
  } else {
    map[hash] = {
      firstSeenAt: now,
      lastUsedAt: now,
      daily: {},
    };
  }
  await setQrSessionStats(map);
}

/** 读指定 session 今日的采集次数 */
export function qrSessionTodayCount(map: QrSessionStatsMap, hash: string): number {
  if (!hash) return 0;
  const s = map[hash];
  if (!s) return 0;
  return s.daily[getTodayDateStr()] || 0;
}

/**
 * 某个 session 的单日上限（QR 模式）：逐行覆盖 > 全局默认。
 * defaultMax 通常由调用方一次性读取传入，避免并发里反复查 storage。
 */
export function qrSessionMax(map: QrSessionStatsMap, hash: string, defaultMax: number): number {
  if (!hash) return defaultMax;
  const s = map[hash];
  const override = s?.maxCollectCount;
  if (override != null && Number.isFinite(override) && override >= 0) return override;
  return defaultMax;
}

export function isQrSessionExceededToday(
  map: QrSessionStatsMap,
  hash: string,
  defaultMax: number,
): boolean {
  if (!hash) return true;
  return qrSessionTodayCount(map, hash) >= qrSessionMax(map, hash, defaultMax);
}

/**
 * 回传一条数据时 +1；同时保证 sessionHash 已注册（防止 isolate 先于 qr-login.ts 写入）。
 * 返回更新后的 today / max，便于 UI 日志展示。
 */
export async function incrementQrSessionToday(
  hash: string,
): Promise<{ today: number; max: number } | null> {
  if (!hash) return null;
  const [map, defaultMax] = await Promise.all([getQrSessionStats(), getQrLoginDefaultMax()]);
  const now = Date.now();
  const today = getTodayDateStr();
  let s: QrSessionStat | undefined = map[hash];
  if (!s) {
    s = { firstSeenAt: now, lastUsedAt: now, daily: {} };
    map[hash] = s;
  }
  s.lastUsedAt = now;
  s.daily[today] = (s.daily[today] || 0) + 1;
  await setQrSessionStats(map);
  const max = qrSessionMax(map, hash, defaultMax);
  return { today: s.daily[today], max };
}
