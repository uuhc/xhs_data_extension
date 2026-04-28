// background 处理 content 发起的 xhsCallbackFetch：发起 POST 回传到后端，避免页面端 CORS / 混合内容问题
import { API_HOST_PLACEHOLDER, EXTENSION_HTTP_TIMEOUT_MS, MSG } from '@shared/constants';
import { fetchWithTimeout } from '@shared/fetch';

function isPlaceholderCallbackUrl(url: string): boolean {
  // 防御：禁止把数据真打到占位域（your-api.example），即使 url 由 content 侧拼好的也要再校验一遍
  try {
    const u = new URL(url);
    const placeholderHost = new URL(API_HOST_PLACEHOLDER).host;
    return u.host === placeholderHost;
  } catch {
    return false;
  }
}

export function handleCallbackFetch(
  msg: { type: string; url: string; body: any },
  sendResponse: (resp: any) => void,
): boolean {
  if (msg.type !== MSG.xhsCallbackFetch || !msg.url || msg.body === undefined) return false;
  if (isPlaceholderCallbackUrl(msg.url)) {
    sendResponse({ ok: false, error: '接口根地址未配置（仍为示例占位），已拦截本次回传' });
    return true;
  }
  fetchWithTimeout(msg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'WeRead/8.2.6 WRBrand/other Dalvik/2.1.0 (Linux; U; Android 13; Pixel 6 Build/TP1A.221105.002)',
    },
    body: JSON.stringify(msg.body),
  })
    .then((res) => res.json())
    .then((data) => {
      sendResponse({ ok: true, data });
    })
    .catch((err: any) => {
      const message =
        err?.name === 'AbortError'
          ? `回传超时（${EXTENSION_HTTP_TIMEOUT_MS / 1000} 秒）`
          : err?.message || String(err);
      sendResponse({ ok: false, error: message });
    });
  return true;
}
