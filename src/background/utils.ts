// background 通用工具：tab 等待、状态广播、storage 读写、cookie 清理

import { STORAGE_KEYS, MSG } from '@shared/constants';
import { storage } from '@shared/storage';
import { getTodayDateStr } from '@shared/time';
import {
  normalizeSearchSiteBaseUrl,
  normalizeAutoLoginPageUrl,
  buildSearchResultUrl,
} from '@shared/url';
import type { AccountItem, AccountCollectStats } from '@/types/xhs';

export function setStatus(text: string): Promise<void> {
  return storage.set({ [STORAGE_KEYS.autoTaskStatus]: text || '' });
}

/**
 * 自动任务日志 ring buffer。
 * - 存在 background 内存里，容量 LOG_BUFFER_MAX；
 * - pushLog 同时会广播 runtime 消息，panel 实时收到不会因 storage 覆盖而丢；
 * - panel 打开时通过 MSG.autoTaskLogHistoryRequest 主动拉一次历史填充。
 */
export interface AutoTaskLogEntry {
  time: number;
  text: string;
}
const LOG_BUFFER_MAX = 200;
const logBuffer: AutoTaskLogEntry[] = [];

export function pushLog(text: string): Promise<void> {
  if (!text) return Promise.resolve();
  const entry: AutoTaskLogEntry = { time: Date.now(), text };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) {
    logBuffer.splice(0, logBuffer.length - LOG_BUFFER_MAX);
  }
  // 广播（无接收方时 chrome 会报 "Receiving end does not exist"，按静默处理）
  try {
    chrome.runtime.sendMessage({ type: MSG.autoTaskLogEntry, entry }).catch(() => {});
  } catch {}
  // 兼容老行为：依然写入 storage，作为"最后一条"状态，避免影响现有监听方
  return storage.set({
    [STORAGE_KEYS.autoTaskLogLine]: entry,
  });
}

/** 读取当前 ring buffer 的快照（最新在后） */
export function getLogHistory(): AutoTaskLogEntry[] {
  return logBuffer.slice();
}

/**
 * 向页面浮层发倒计时消息。
 * 优先发到调用方指定的 `tabId`（如自动任务绑定的工作标签页），
 * 若未传则回退到当前激活标签页（兼容老行为）。
 */
export function sendCountdownToPage(
  show: boolean,
  text?: string,
  seconds?: number,
  tabId?: number,
): void {
  const send = (id: number) => {
    // chrome.tabs.sendMessage 在 MV3 下返回 Promise；目标 tab 没有 content script
    // (例如刚切到空白页 / 非 xhs 域 / 注入未完成) 时会 reject 出
    // "Could not establish connection. Receiving end does not exist."
    // 这是预期情况，静默忽略，避免污染未捕获 Promise 日志。
    try {
      const p = chrome.tabs.sendMessage(id, {
        type: MSG.dataCrawlerCountdown,
        show,
        text,
        seconds,
      });
      if (p && typeof (p as any).catch === 'function') {
        (p as Promise<unknown>).catch(() => {});
      }
    } catch {}
  };
  if (typeof tabId === 'number') {
    send(tabId);
    if (!show) broadcastCountdownHide();
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].id) return;
    send(tabs[0].id);
  });
}

/** 向所有小红书标签页广播隐藏倒计时，确保不残留 */
function broadcastCountdownHide(): void {
  chrome.tabs.query(
    { url: ['*://*.xiaohongshu.com/*', '*://*.rednote.com/*'] },
    (tabs) => {
      for (const tab of tabs || []) {
        if (tab.id != null) {
          try {
            const p = chrome.tabs.sendMessage(tab.id, {
              type: MSG.dataCrawlerCountdown,
              show: false,
            });
            if (p && typeof (p as any).catch === 'function') {
              (p as Promise<unknown>).catch(() => {});
            }
          } catch {}
        }
      }
    },
  );
}

export function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0] || null));
  });
}

export function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(done, timeoutMs);
  });
}

export async function buildSearchResultUrlAsync(keyword: string): Promise<string> {
  const o = await storage.get([STORAGE_KEYS.searchSiteBase]);
  const base = normalizeSearchSiteBaseUrl(o[STORAGE_KEYS.searchSiteBase]);
  return buildSearchResultUrl(base, keyword);
}

export async function getAutoLoginPageUrl(): Promise<string> {
  const o = await storage.get([STORAGE_KEYS.autoLoginPage]);
  return normalizeAutoLoginPageUrl(o[STORAGE_KEYS.autoLoginPage]);
}

/** 与侧栏「关键词」中「间隔（秒，随机）」一致，供自动任务在词与词之间等待 */
export async function getRandomIntervalMs(): Promise<number> {
  const o = await storage.get([
    STORAGE_KEYS.orderedExecuteDelayMinSec,
    STORAGE_KEYS.orderedExecuteDelayMaxSec,
  ]);
  let minS = 120;
  let maxS = 130;
  if (o[STORAGE_KEYS.orderedExecuteDelayMinSec] != null) {
    minS = Math.max(0, Math.floor(Number(o[STORAGE_KEYS.orderedExecuteDelayMinSec])) || 120);
  }
  if (o[STORAGE_KEYS.orderedExecuteDelayMaxSec] != null) {
    maxS = Math.max(0, Math.floor(Number(o[STORAGE_KEYS.orderedExecuteDelayMaxSec])) || 130);
  }
  if (minS > maxS) [minS, maxS] = [maxS, minS];
  const sec = minS + Math.floor(Math.random() * (maxS - minS + 1));
  return sec * 1000;
}

// ---------- 账号采集统计 ----------

/** 解析 'HH:mm' 格式为当日分钟数；不合法返回 null */
function parseTimeToMinutes(timeStr: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 检查当前时间是否在允许执行的时间范围内。
 * 支持跨午夜场景（如 22:00-06:00）。
 * @returns { inRange: boolean, nextChangeMinutes: number }
 *   nextChangeMinutes: 距离下次状态变更（进入/离开允许范围）的分钟数
 */
export function isInAllowedTimeRange(start: string, end: string): { inRange: boolean; nextChangeMinutes: number } {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  // 格式不合法时默认允许执行
  if (startMin === null || endMin === null) return { inRange: true, nextChangeMinutes: 60 };

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (startMin <= endMin) {
    // 同一天内，如 10:00-21:00
    const inRange = nowMin >= startMin && nowMin < endMin;
    const nextChangeMinutes = inRange
      ? endMin - nowMin
      : nowMin < startMin ? startMin - nowMin : (24 * 60 - nowMin) + startMin;
    return { inRange, nextChangeMinutes };
  } else {
    // 跨午夜，如 22:00-06:00
    const inRange = nowMin >= startMin || nowMin < endMin;
    const nextChangeMinutes = inRange
      ? (nowMin >= startMin ? (24 * 60 - nowMin) + endMin : endMin - nowMin)
      : startMin - nowMin;
    return { inRange, nextChangeMinutes };
  }
}
export function getAccountTodayCollectCount(stats: AccountCollectStats, idx: number): number {
  const key = String(idx);
  const today = getTodayDateStr();
  if (!stats[key]) return 0;
  return stats[key][today] || 0;
}

export function isAccountExceededToday(
  accs: AccountItem[],
  stats: AccountCollectStats,
  idx: number,
): boolean {
  if (idx < 0 || idx >= accs.length) return true;
  const acc = accs[idx];
  const max = acc.maxCollectCount != null ? acc.maxCollectCount : 200;
  return getAccountTodayCollectCount(stats, idx) >= max;
}

export function areAllAccountsExceededToday(
  accs: AccountItem[],
  stats: AccountCollectStats,
): boolean {
  for (let i = 0; i < accs.length; i++) {
    if (!isAccountExceededToday(accs, stats, i)) return false;
  }
  return true;
}

export function findNextAvailableAccount(
  accs: AccountItem[],
  stats: AccountCollectStats,
  current: number,
): number {
  if (!accs.length) return -1;
  for (let i = 1; i <= accs.length; i++) {
    const next = (current + i) % accs.length;
    if (!isAccountExceededToday(accs, stats, next)) return next;
  }
  return -1;
}

export function clearXhsCookies(): Promise<number> {
  return new Promise((resolve) => {
    const domains = ['.xiaohongshu.com', 'www.xiaohongshu.com', '.rednote.com', 'www.rednote.com'];
    let total = 0;
    let pending = domains.length;
    domains.forEach((domain) => {
      chrome.cookies.getAll({ domain }, (cookies) => {
        if (!cookies?.length) {
          pending--;
          if (pending <= 0) resolve(total);
          return;
        }
        let dp = cookies.length;
        cookies.forEach((cookie) => {
          const protocol = cookie.secure ? 'https://' : 'http://';
          const removeUrl = protocol + cookie.domain.replace(/^\./, '') + cookie.path;
          chrome.cookies.remove({ url: removeUrl, name: cookie.name }, () => {
            total++;
            dp--;
            if (dp <= 0) {
              pending--;
              if (pending <= 0) resolve(total);
            }
          });
        });
      });
    });
  });
}

export function executeInPageMain<T extends (...args: any[]) => any>(
  tabId: number,
  func: T,
  args: Parameters<T> = [] as any,
  timeoutMs: number = 8000,
): Promise<ReturnType<T> | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: ReturnType<T> | undefined) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    // 兜底超时：避免页面跳转 / iframe 异常导致回调永不触发，整个自动登录卡死
    const timer = setTimeout(() => {
      console.warn('[executeInPageMain] timeout', { tabId, func: (func as any).name });
      done(undefined);
    }, timeoutMs);
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          world: 'MAIN',
          func: func as any,
          args: args as any,
        },
        (results) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            console.warn('[executeInPageMain] lastError:', chrome.runtime.lastError.message);
            done(undefined);
            return;
          }
          done(results?.[0]?.result as ReturnType<T> | undefined);
        },
      );
    } catch (e) {
      clearTimeout(timer);
      console.warn('[executeInPageMain] throw:', e);
      done(undefined);
    }
  });
}

export function ensureContentScriptReady(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: MSG.dataCrawlerPing }, (response) => {
        if (chrome.runtime.lastError || !response?.pong) {
          pushLog('content script 未就绪，刷新页面…');
          chrome.tabs.reload(tabId, {}, () => {
            waitForTabComplete(tabId).then(() => setTimeout(resolve, 2000));
          });
        } else {
          resolve();
        }
      });
    } catch {
      chrome.tabs.reload(tabId, {}, () => {
        waitForTabComplete(tabId).then(() => setTimeout(resolve, 2000));
      });
    }
  });
}
