// ISOLATED world：接收 MAIN postMessage → storage；调 background 回传；登录弹窗探测；倒计时浮层
import {
  STORAGE_KEYS,
  MAX_PAGES_IN_STORAGE,
  CALLBACK_MAX_RETRIES,
  MSG,
  LOGIN_MODE_DEFAULT,
  isLoginMode,
} from '@shared/constants';
import { storage } from '@shared/storage';
import { incrementQrSessionToday } from '@shared/qrSession';
import { normalizePublishTime, getTodayDateStr } from '@shared/time';
import { buildCallbackBody, buildCallbackUrl } from '@shared/api';
import type {
  SearchResultMessage,
  CreatorListResultMessage,
  SearchFirstPageHitWindowMessage,
  RuntimeMessage,
} from '@/types/messages';
import type {
  SearchNotesResponse,
  SearchNoteItem,
  KeywordTaskInfo,
  AccountItem,
  AccountCollectStats,
  NoteUser,
} from '@/types/xhs';

// ---------- 页面刷新清空当前页相关数据 ----------
if (location.href.indexOf('search_result') !== -1) {
  storage.remove([STORAGE_KEYS.searchNotesResult, STORAGE_KEYS.searchNotesPages]);
}
if (location.href.indexOf('user/profile') !== -1) {
  storage.remove([STORAGE_KEYS.creatorListResult, STORAGE_KEYS.creatorListPages]);
}

// ---------- 解析单条搜索结果（与 Python add_xhs_app_search_result 一致格式） ----------
export function parseXhsSearchResultItem(item: SearchNoteItem): any | null {
  if (!item || item.model_type !== 'note') return null;
  const noteCard = item.note_card || {};
  const type = noteCard.type || 'normal';
  let publishTimeRaw = '';
  const tags = noteCard.corner_tag_info || [];
  for (let i = 0; i < tags.length; i++) {
    if (tags[i].type === 'publish_time') {
      publishTimeRaw = (tags[i].text || '').trim();
      break;
    }
  }
  const publishTime = normalizePublishTime(publishTimeRaw);
  const interact = noteCard.interact_info || {};
  const noteId = item.id || '';
  const xsecToken = item.xsec_token || '';
  const url = noteId ? 'https://www.xiaohongshu.com/explore/' + noteId : '';
  return {
    XsecToken: xsecToken,
    IsAds: 0,
    PublishTime: publishTime,
    ArticleType: type,
    ThumbsUpQty: interact.liked_count != null ? String(interact.liked_count) : '0',
    ReviewQty: interact.comment_count != null ? String(interact.comment_count) : '0',
    CollectQty: interact.collected_count != null ? String(interact.collected_count) : '0',
    ShareQty: interact.shared_count != null ? String(interact.shared_count) : '0',
    Url: url,
  };
}

// ---------- 单次回传由 background 发起，避免页面环境下的 CORS / 混合内容 ----------
function doOneCallbackRequest(url: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: MSG.xhsCallbackFetch, url, body }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Extension context invalid'));
        return;
      }
      if (response?.ok) resolve(response.data);
      else reject(new Error(response?.error || '回传失败'));
    });
  });
}

async function sendXhsSearchResult(body: any): Promise<{ data: any; attempt: number }> {
  const url = await buildCallbackUrl();
  const max = 1 + CALLBACK_MAX_RETRIES;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const data = await doOneCallbackRequest(url, body);
      return { data, attempt };
    } catch (err: any) {
      if (attempt >= max) {
        throw new Error(
          `回传失败（已重试${CALLBACK_MAX_RETRIES}次）: ${err?.message || String(err)}`,
        );
      }
    }
  }
  throw new Error('回传失败');
}

// ---------- 达人响应取列表 ----------
function getCreatorList(obj: any): any[] | null {
  if (!obj?.data) return null;
  const d = obj.data;
  if (Array.isArray(d.notes) && d.notes.length) return d.notes;
  if (Array.isArray(d.users) && d.users.length) return d.users;
  if (Array.isArray(d.items) && d.items.length) return d.items;
  return null;
}

function getCreatorId(user: NoteUser | any): string {
  if (!user) return '';
  return user.user_id || user.id || user.user_info?.user_id || user.user_info?.id || '';
}

// ---------- 接收 postMessage ----------
window.addEventListener('message', async (event: MessageEvent) => {
  if (event.source !== window) return;
  const msg = event.data as
    | SearchResultMessage
    | CreatorListResultMessage
    | SearchFirstPageHitWindowMessage;
  if (!msg || !msg.type) return;

  if (msg.type === 'XHS_SEARCH_RESULT') {
    await handleSearchResult(msg);
  } else if (msg.type === 'XHS_CREATOR_LIST_RESULT') {
    await handleCreatorResult(msg);
  } else if (msg.type === 'XHS_FIRST_PAGE_HIT') {
    // 转发给 background：拟人 / 速填模式靠这个信号知道触发已生效，可以推进下一关键词
    try {
      chrome.runtime.sendMessage(
        { type: MSG.searchFirstPageHit, keyword: msg.keyword },
        () => {
          void chrome.runtime.lastError;
        },
      );
    } catch {}
  }
});

async function handleSearchResult(msg: SearchResultMessage) {
  const raw = msg.data as any;
  const obj: SearchNotesResponse | null =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : raw;
  if (!obj?.data || !Array.isArray(obj.data.items) || !obj.data.items.length) return;
  const items = obj.data.items;
  const firstId = items[0].id;
  const pageNum = msg.pageNum != null ? msg.pageNum : 1;
  obj._pageNum = pageNum;
  const isFirstPage = !!msg.isFirstPage;

  const res = await storage.get([STORAGE_KEYS.searchNotesPages]);
  let pages: SearchNotesResponse[] = res[STORAGE_KEYS.searchNotesPages] || [];
  if (isFirstPage) {
    pages = [obj];
  } else {
    const sameAsFirst =
      pages.length &&
      pages[0]?.data?.items?.[0]?.id === firstId;
    if (sameAsFirst) pages = [obj];
    else pages.push(obj);
  }
  if (pages.length > MAX_PAGES_IN_STORAGE) pages = pages.slice(-MAX_PAGES_IN_STORAGE);
  await storage.set({
    [STORAGE_KEYS.searchNotesPages]: pages,
    [STORAGE_KEYS.searchNotesResult]: JSON.stringify(obj, null, 2),
  });

  // 回传
  const interceptedKeyword = msg.interceptedKeyword || '';
  const k = await storage.get([STORAGE_KEYS.currentKeywordTask]);
  const kwInfoRaw: KeywordTaskInfo | undefined = k[STORAGE_KEYS.currentKeywordTask];
  const kwInfo = (kwInfoRaw && typeof kwInfoRaw === 'object')
    ? kwInfoRaw
    : { Keywords: interceptedKeyword, Platform: '小红书' } as KeywordTaskInfo;
  const body = buildCallbackBody(kwInfo, items, interceptedKeyword);

  const taskKw = kwInfo.Keywords || '';
  const kwMatch = interceptedKeyword && taskKw ? interceptedKeyword === taskKw : null;
  const kwTag = interceptedKeyword
    ? `「${interceptedKeyword}」${kwMatch === false ? `（≠任务词「${taskKw}」）` : ''}`
    : taskKw
      ? `「${taskKw}」`
      : '';
  const pageTag = `（第${pageNum}页）`;
  console.log('[DataCrawler] 回传关键词（拦截）:', interceptedKeyword || '(无)', '| 任务关键词:', taskKw || '(无)', '| 页码:', pageNum);

  try {
    const result = await sendXhsSearchResult(body);
    const { data, attempt } = result;
    let text =
      '回传成功' + (attempt > 1 ? `（重试${attempt - 1}次）` : '') + (kwTag ? ' ' + kwTag : '') + ' ' + pageTag;
    if (data && (data.code != null || (data.message != null && data.message !== ''))) {
      text += ` code=${data.code != null ? data.code : '-'}`;
      text += ` message=${data.message != null && data.message !== '' ? data.message : '-'}`;
    }
    if (pageNum === 1) {
      // 跨日临界 fix：
      // 1) todayStr 放到 set 之前再算一次，避免回传卡几秒后跨过 0 点，把今天的采集数写到昨天的 key 上。
      // 2) 写入 stats 整体之前重新 get 一次，缩小多 tab 并发覆盖的窗口（read-modify-write）。
      const modeRaw = await storage.getOne(STORAGE_KEYS.loginMode);
      const mode = isLoginMode(modeRaw) ? modeRaw : LOGIN_MODE_DEFAULT;
      let countMsg = '';
      if (mode === 'qrcode') {
        const hash = (await storage.getOne<string>(STORAGE_KEYS.currentQrSessionHash)) || '';
        if (hash) {
          const r = await incrementQrSessionToday(hash);
          if (r) {
            countMsg = `QR账号 ${hash.slice(0, 8)}… 今日累计采集：${r.today}/${r.max}`;
          }
        } else {
          countMsg = 'QR 模式下未检测到 sessionHash，跳过计数';
        }
      } else {
        const so = await storage.get([
          STORAGE_KEYS.selectedAccountIndex,
          STORAGE_KEYS.accountList,
        ]);
        const accIdx = parseInt(so[STORAGE_KEYS.selectedAccountIndex], 10) || 0;
        const accs: AccountItem[] = so[STORAGE_KEYS.accountList] || [];
        const accKey = String(accIdx);
        const fresh = await storage.get([STORAGE_KEYS.accountCollectStats]);
        const stats: AccountCollectStats = fresh[STORAGE_KEYS.accountCollectStats] || {};
        const todayStr = getTodayDateStr();
        if (!stats[accKey]) stats[accKey] = {};
        stats[accKey][todayStr] = (stats[accKey][todayStr] || 0) + 1;
        const newCount = stats[accKey][todayStr];
        await storage.set({ [STORAGE_KEYS.accountCollectStats]: stats });
        const maxC = accs[accIdx]?.maxCollectCount != null ? accs[accIdx].maxCollectCount : 200;
        countMsg = `账号${accIdx + 1} 今日累计采集：${newCount}/${maxC}`;
      }
      if (countMsg) {
        console.log('[DataCrawler] ' + countMsg);
        await storage.set({
          [STORAGE_KEYS.autoTaskLogLine]: {
            time: Date.now(),
            text: '✓ ' + text + ' | ' + countMsg,
          },
        });
      }
    }
    console.log('[DataCrawler] 搜索数据回传:', text, result);
    await storage.set({
      [STORAGE_KEYS.autoTaskCallbackStatus]: { success: true, message: text, time: Date.now() },
    });
    // 今日回传成功计数 +1（按日期分桶；所有页都计数，用于观察吞吐）
    try {
      const today = getTodayDateStr();
      const cur = (await storage.getOne<Record<string, { ok: number; fail: number }>>(
        STORAGE_KEYS.callbackDailyStats,
      )) || {};
      const b = cur[today] || { ok: 0, fail: 0 };
      b.ok = (b.ok || 0) + 1;
      cur[today] = b;
      await storage.setOne(STORAGE_KEYS.callbackDailyStats, cur);
    } catch {}
    // 回传成功 → 把当前任务关键词记入「已执行」清单，供 KeywordSection 置灰 + 顺序搜索/自动任务跳过。
    // 仅在第 1 页时记录，避免分页回传重复写。
    if (pageNum === 1) {
      const taskKwForMark = (kwInfo.Keywords || '').trim();
      if (taskKwForMark) {
        try {
          const ek = await storage.get([STORAGE_KEYS.orderedSearchExecutedKeywords]);
          const arr: string[] = Array.isArray(ek[STORAGE_KEYS.orderedSearchExecutedKeywords])
            ? ek[STORAGE_KEYS.orderedSearchExecutedKeywords]
            : [];
          if (!arr.includes(taskKwForMark)) {
            arr.push(taskKwForMark);
            await storage.setOne(STORAGE_KEYS.orderedSearchExecutedKeywords, arr);
          }
        } catch {}
      }
    }
  } catch (err: any) {
    let m = err?.message || String(err);
    if (kwTag) m += ' ' + kwTag;
    m += ' ' + pageTag;
    console.error('[DataCrawler] 搜索数据回传失败', err);
    await storage.set({
      [STORAGE_KEYS.autoTaskCallbackStatus]: { success: false, message: m, time: Date.now() },
    });
    try {
      const today = getTodayDateStr();
      const cur = (await storage.getOne<Record<string, { ok: number; fail: number }>>(
        STORAGE_KEYS.callbackDailyStats,
      )) || {};
      const b = cur[today] || { ok: 0, fail: 0 };
      b.fail = (b.fail || 0) + 1;
      cur[today] = b;
      await storage.setOne(STORAGE_KEYS.callbackDailyStats, cur);
    } catch {}
  }
}

async function handleCreatorResult(msg: CreatorListResultMessage) {
  const raw = msg.data as any;
  const obj: SearchNotesResponse | null =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : raw;
  const list = getCreatorList(obj);
  if (!list || !list.length) return;
  const firstId = getCreatorId(list[0]);
  const pageNum = msg.pageNum != null ? msg.pageNum : 1;
  if (obj) obj._pageNum = pageNum;
  const isFirstPage = !!msg.isFirstPage;

  const res = await storage.get([STORAGE_KEYS.creatorListPages]);
  let pages: any[] = res[STORAGE_KEYS.creatorListPages] || [];
  if (isFirstPage) {
    pages = [obj];
  } else {
    const prevList = pages.length && getCreatorList(pages[0]);
    const sameAsFirst = prevList && prevList.length && getCreatorId(prevList[0]) === firstId;
    if (sameAsFirst) pages = [obj];
    else pages.push(obj);
  }
  if (pages.length > MAX_PAGES_IN_STORAGE) pages = pages.slice(-MAX_PAGES_IN_STORAGE);
  await storage.set({
    [STORAGE_KEYS.creatorListPages]: pages,
    [STORAGE_KEYS.creatorListResult]: JSON.stringify(obj, null, 2),
  });
}

// ---------- 检测登录弹窗 → 通知 background ----------
// 改为 MutationObserver 事件驱动：只有 DOM 发生变更时才检查，且用 rAF 节流
// 避免之前每 2 秒轮询带来的常驻 CPU 消耗。
(function () {
  let notified = false;
  let rafScheduled = false;
  let lastCheckAt = 0;
  const MIN_INTERVAL = 300; // 两次检查之间至少 300ms，避免大量 mutation 时过度触发

  const LOGIN_SELECTORS = [
    'input[placeholder*="手机号"]',
    'input[type="tel"]',
    'input[placeholder*="请输入手机号"]',
    'input[name="phone"]',
    'input[placeholder*="phone"]',
  ];

  function hasLoginDialog(): boolean {
    for (const sel of LOGIN_SELECTORS) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && el.offsetParent !== null) return true;
    }
    return false;
  }

  function check() {
    rafScheduled = false;
    lastCheckAt = Date.now();
    if (hasLoginDialog()) {
      if (!notified) {
        notified = true;
        console.log('[DataCrawler] 检测到登录弹窗，通知自动登录');
        try { chrome.runtime.sendMessage({ type: MSG.loginDialogDetected }, () => { void chrome.runtime.lastError; }); } catch {}
      }
    } else {
      notified = false;
    }
  }

  function scheduleCheck() {
    if (rafScheduled) return;
    const since = Date.now() - lastCheckAt;
    if (since < MIN_INTERVAL) {
      rafScheduled = true;
      setTimeout(() => {
        rafScheduled = false;
        requestAnimationFrame(check);
      }, MIN_INTERVAL - since);
      return;
    }
    rafScheduled = true;
    requestAnimationFrame(check);
  }

  function start() {
    check();
    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      // 仅关注与可见性/挂载相关的属性，降低回调频率
      attributeFilter: ['style', 'class', 'hidden'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

// ---------- 倒计时浮层 ----------
let countdownTimer: number | null = null;
chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  if (msg.type === 'dataCrawlerPing') {
    sendResponse({ pong: true });
    return;
  }
  if (msg.type !== 'dataCrawlerCountdown') return;
  let el = document.getElementById('data-crawler-countdown-box');
  if (msg.show) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'data-crawler-countdown-box';
      el.style.cssText =
        'position:fixed;top:14px;right:14px;z-index:2147483647;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,0.82);color:#fff;font-size:13px;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,0.25);pointer-events:none;line-height:1.4;';
      document.body.appendChild(el);
    }
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    const text = (msg.text || '请求关键词').trim();
    let sec = typeof msg.seconds === 'number' ? msg.seconds : 0;
    const update = () => {
      if (sec > 0) el!.textContent = `${text} · ${sec} 秒`;
      else el!.textContent = text;
    };
    update();
    if (typeof msg.seconds === 'number' && msg.seconds > 0) {
      countdownTimer = setInterval(() => {
        sec--;
        if (sec <= 0) {
          if (countdownTimer) clearInterval(countdownTimer);
          countdownTimer = null;
          el!.textContent = text;
          return;
        }
        el!.textContent = `${text} · ${sec} 秒`;
      }, 1000) as unknown as number;
    }
  } else {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (el) el.remove();
  }
});
