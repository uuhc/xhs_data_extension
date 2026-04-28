// 扫码登录（QR）主流程：
//   1. 跳转 / 确认登录页 → 切到「扫码登录」tab
//   2. 等二维码渲染 → 抓 base64 → jsQR 解码拿到登录 URL
//   3. POST 到远端代扫接口（接口未定时只 console.log + 走假成功）
//   4. 轮询 cookie (web_session) / DOM 直到登录成功或超时
//   5. 成功后计算 sessionHash → registerQrSession + setCurrentSessionHash
//
// 与 SMS 自动登录共享 pushLog / setStatus / waitForTabComplete / executeInPageMain。

import jsQR from 'jsqr';
import {
  STORAGE_KEYS,
  MSG,
  QR_LOGIN_SITE_URL,
  QR_LOGIN_SITE_LABEL,
  QR_LOGIN_SITE_DEFAULT,
  isQrLoginSite,
} from '@shared/constants';
import { storage } from '@shared/storage';
import {
  pushLog,
  setStatus,
  waitForTabComplete,
  executeInPageMain,
} from './utils';
import { switchToQrLoginTab, findQrImageDataUrl } from './injected';
import {
  getCurrentSessionHashFromCookie,
  registerQrSession,
  setCurrentSessionHash,
} from '@shared/qrSession';

// ---------- 可调常量 ----------
/** QR 登录整体超时（5 分钟）：超过即认为用户没扫 / 远端没处理 */
const QR_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
/** 进入登录页后最多等多少秒二维码渲染 */
const QR_WAIT_RENDER_MS = 20_000;
const QR_WAIT_POLL_INTERVAL_MS = 500;
/** 登录态轮询间隔（拿 cookie 很快） */
const LOGIN_POLL_INTERVAL_MS = 3000;
/** 多久回头检查一次二维码是否被刷新（xhs 默认 3 分钟刷新一张） */
const QR_REFRESH_CHECK_INTERVAL_MS = 90_000;

interface DoQrLoginCtx {
  isAborted: () => boolean;
}

/** SW 里解码 data:URL 形式的二维码：fetch → blob → createImageBitmap → OffscreenCanvas → jsQR */
async function decodeQrDataUrl(dataUrl: string): Promise<string> {
  try {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const w = bitmap.width;
    const h = bitmap.height;
    if (!w || !h) return '';
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(bitmap, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const result = jsQR(imgData.data, imgData.width, imgData.height);
    return result?.data || '';
  } catch (e) {
    console.warn('[qr-login] decodeQrDataUrl failed:', e);
    return '';
  }
}

/** 判断当前是否已登录：只看 web_session cookie，快且稳定 */
async function isLoggedInByCookie(): Promise<boolean> {
  const domains = ['.xiaohongshu.com', '.rednote.com'];
  for (const domain of domains) {
    const cookies = await new Promise<chrome.cookies.Cookie[]>((resolve) =>
      chrome.cookies.getAll({ domain, name: 'web_session' }, (c) => resolve(c || [])),
    );
    if (cookies.some((c) => c.value && c.value.length > 8)) return true;
  }
  return false;
}

/**
 * 发送当前二维码内容给远端代扫接口。
 * 接口未正式提供前，这里只 console.log 出来并返回 true（按产品要求"假设已发送"）。
 * payload 同时携带：
 *   - content: jsQR 解码得到的登录 URL
 *   - imageBase64: 页面抓到的二维码图片 data:URL
 */
async function sendQrToScanService(content: string, imageDataUrl: string): Promise<boolean> {
  const url = (await storage.getOne<string>(STORAGE_KEYS.qrLoginApiUrl)) || '';
  const payload = {
    content,
    imageBase64: imageDataUrl,
    timestamp: Date.now(),
  };
  if (!url) {
    console.log('[qr-login] 扫码接口未配置，假装已发送：', {
      contentPreview: content.slice(0, 80),
      imageLen: imageDataUrl.length,
    });
    return true;
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      await pushLog(`扫码接口返回 ${r.status}`);
      return false;
    }
    return true;
  } catch (e: any) {
    await pushLog(`扫码接口调用异常：${e?.message || e}`);
    return false;
  }
}

/** 简单字符串 hash，仅用来比较二维码是否刷新（不需要抗碰撞） */
function cheapHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * 打开登录页 → 切扫码 tab → 等二维码 → 解码 → POST → 轮询登录态。
 * 返回 true 表示登录成功；false 表示失败 / 超时 / 被中止。
 */
export async function doQrCodeLoginOnTab(
  tabId: number,
  ctx: DoQrLoginCtx = { isAborted: () => false },
): Promise<boolean> {
  const triggerSync = () => {
    try {
      chrome.runtime.sendMessage({ type: MSG.syncLoginStatus }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  };

  // 站点：用户在面板里二选一（国内 / 国际），默认国内站
  const siteRaw = await storage.getOne(STORAGE_KEYS.qrLoginSite);
  const site = isQrLoginSite(siteRaw) ? siteRaw : QR_LOGIN_SITE_DEFAULT;
  const loginUrl = QR_LOGIN_SITE_URL[site];

  await pushLog(`开始扫码登录（${QR_LOGIN_SITE_LABEL[site]}）`);
  await setStatus('正在打开登录页…');
  await pushLog(`打开登录页：${loginUrl}`);
  await new Promise<void>((resolve) =>
    chrome.tabs.update(tabId, { url: loginUrl }, () => resolve()),
  );
  if (ctx.isAborted()) return false;
  await waitForTabComplete(tabId);
  if (ctx.isAborted()) return false;
  await pushLog('页面加载完成，等待 5 秒以让登录框渲染…');
  await sleep(5000);
  if (ctx.isAborted()) return false;

  await pushLog('尝试切换到扫码登录 tab…');
  const switched = await executeInPageMain(tabId, switchToQrLoginTab, []);
  if (switched) {
    await pushLog('已切换到扫码登录 tab');
    await sleep(800);
  } else {
    await pushLog('未找到扫码 tab（可能页面默认已是扫码视图）');
  }

  // 等二维码渲染
  await setStatus('等待二维码渲染…');
  const waitDeadline = Date.now() + QR_WAIT_RENDER_MS;
  let qrDataUrl = '';
  while (Date.now() < waitDeadline) {
    if (ctx.isAborted()) return false;
    const url = (await executeInPageMain(tabId, findQrImageDataUrl, [])) as string | undefined;
    if (url) {
      qrDataUrl = url;
      break;
    }
    await sleep(QR_WAIT_POLL_INTERVAL_MS);
  }
  if (!qrDataUrl) {
    await pushLog('未在页面上找到二维码（超时）');
    await setStatus('扫码登录失败：未找到二维码');
    return false;
  }
  await pushLog(`已抓到二维码图片（${qrDataUrl.length} 字节 base64）`);

  // 解码
  const decoded = await decodeQrDataUrl(qrDataUrl);
  if (!decoded) {
    await pushLog('二维码解码失败（可能不是标准 QR 码）');
    await setStatus('扫码登录失败：二维码解码失败');
    return false;
  }
  await pushLog(`二维码内容：${decoded.slice(0, 100)}`);
  let lastQrHash = cheapHash(qrDataUrl);

  // 首次发送
  const sendOk = await sendQrToScanService(decoded, qrDataUrl);
  if (!sendOk) {
    await setStatus('扫码登录失败：扫码服务调用失败');
    return false;
  }
  await pushLog('已提交扫码服务，等待登录完成…');
  await setStatus('等待扫码登录完成…');

  // 主轮询
  const overallDeadline = Date.now() + QR_LOGIN_TIMEOUT_MS;
  let nextRefreshCheckAt = Date.now() + QR_REFRESH_CHECK_INTERVAL_MS;
  while (Date.now() < overallDeadline) {
    if (ctx.isAborted()) {
      await pushLog('扫码登录已中止');
      return false;
    }

    if (await isLoggedInByCookie()) {
      await pushLog('✅ 检测到 web_session，扫码登录完成');
      triggerSync();
      // 计算 sessionHash 并登记
      const hash = await getCurrentSessionHashFromCookie();
      if (hash) {
        await registerQrSession(hash);
        await setCurrentSessionHash(hash);
        await pushLog(`当前 sessionHash：${hash.slice(0, 8)}…`);
      } else {
        await pushLog('⚠️ 登录完成但未读到 web_session（可能域名匹配失败）');
      }
      await setStatus('扫码登录完成');
      setTimeout(triggerSync, 1500);
      return true;
    }

    // 周期性检查二维码是否刷新，若变了重新解码 + 重发
    if (Date.now() >= nextRefreshCheckAt) {
      nextRefreshCheckAt = Date.now() + QR_REFRESH_CHECK_INTERVAL_MS;
      const fresh = (await executeInPageMain(tabId, findQrImageDataUrl, [])) as string | undefined;
      if (fresh && cheapHash(fresh) !== lastQrHash) {
        lastQrHash = cheapHash(fresh);
        const freshDecoded = await decodeQrDataUrl(fresh);
        if (freshDecoded) {
          await pushLog('检测到二维码刷新，重新提交');
          await sendQrToScanService(freshDecoded, fresh);
        }
      }
    }

    await sleep(LOGIN_POLL_INTERVAL_MS);
  }

  await pushLog('扫码登录超时（5 分钟未登录）');
  await setStatus('扫码登录超时');
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
