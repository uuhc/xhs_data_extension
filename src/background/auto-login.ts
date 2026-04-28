// 自动登录、自动切换账号；适配「侧栏触发」与「自动任务流程内触发」两种入口
import {
  STORAGE_KEYS,
  MSG,
  LOGIN_MODE_DEFAULT,
  isLoginMode,
  type LoginMode,
} from '@shared/constants';
import { fetchWithTimeout } from '@shared/fetch';
import { storage } from '@shared/storage';
import { extractSmsCode } from '@shared/sms';
import {
  pushLog,
  setStatus,
  waitForTabComplete,
  getAutoLoginPageUrl,
  executeInPageMain,
  clearXhsCookies,
} from './utils';
import {
  xhsFillPhone,
  xhsClickSendSms,
  xhsFillSmsCode,
  xhsClickLogin,
  xhsClickByText,
} from './injected';
import type { AccountItem } from '@/types/xhs';
import { autoTaskState } from './auto-task';
import { doQrCodeLoginOnTab } from './qr-login';
import { setCurrentSessionHash } from '@shared/qrSession';

/** 读取当前登录模式（SMS / QR），未配置时默认 SMS */
export async function getLoginMode(): Promise<LoginMode> {
  const v = await storage.getOne<any>(STORAGE_KEYS.loginMode);
  return isLoginMode(v) ? v : LOGIN_MODE_DEFAULT;
}

interface DoLoginCtx {
  isAborted: () => boolean;
}

/** 由侧栏直接触发的「自动登录」可中止状态（与 autoTaskState 独立） */
export const autoLoginState: { abort: boolean; running: boolean } = {
  abort: false,
  running: false,
};

export function abortAutoLogin(): void {
  autoLoginState.abort = true;
}

/** 读取 phone → lastUsedCode 映射 */
async function getLastSmsCode(phone: string): Promise<string> {
  const o = await storage.get([STORAGE_KEYS.smsCodeMap]);
  const map = (o[STORAGE_KEYS.smsCodeMap] || {}) as Record<string, string>;
  return map[phone] || '';
}

/** 写入 phone → 验证码映射（覆盖旧值） */
async function setLastSmsCode(phone: string, code: string): Promise<void> {
  const o = await storage.get([STORAGE_KEYS.smsCodeMap]);
  const map = (o[STORAGE_KEYS.smsCodeMap] || {}) as Record<string, string>;
  map[phone] = code;
  await storage.setOne(STORAGE_KEYS.smsCodeMap, map);
}

/** 在指定 tab 上执行：填手机号 → 发送验证码 → 轮询接码 → 填验证码 → 点登录 */
export async function doAutoLoginOnTab(
  tabId: number,
  acc: AccountItem,
  accIdx: number,
  ctx: DoLoginCtx = { isAborted: () => false },
): Promise<boolean> {
  await pushLog(`开始自动登录账号 ${accIdx + 1}：${acc.phone}`);
  await setStatus('正在自动登录…');

  await pushLog(`【1/5】填入手机号 ${acc.phone}…`);
  const filled = await executeInPageMain(tabId, xhsFillPhone, [acc.phone]);
  if (!filled) {
    await pushLog('【1/5】失败：未找到手机号输入框（页面可能未弹出登录框 / 已登录 / 选择器失效）');
    await setStatus('自动登录失败：未找到手机号输入框');
    return false;
  }
  await pushLog('【1/5】手机号已填入');
  await sleep(600);

  await pushLog('【2/5】点击发送验证码…');
  const sent = await executeInPageMain(tabId, xhsClickSendSms, []);
  if (!sent) {
    await pushLog('【2/5】失败：未找到「获取验证码 / 发送验证码」按钮');
    await setStatus('自动登录失败：未找到发送验证码按钮');
    return false;
  }
  await pushLog('【2/5】已点击发送验证码，开始轮询接码链接');

  // 取出该手机号上次已用的验证码，用于识别旧码
  const lastCode = await getLastSmsCode(acc.phone);
  if (lastCode) {
    await pushLog(`【3/5】上次已用验证码：${lastCode}（若再拿到将被视为旧码丢弃）`);
  }

  const maxPoll = 40;
  let staleHits = 0;
  for (let i = 1; i <= maxPoll; i++) {
    if (ctx.isAborted()) {
      await pushLog('自动登录：已中止');
      return false;
    }
    await setStatus(`自动登录：等待接码… (${i}/${maxPoll})`);
    await sleep(3000);
    try {
      const text = await fetchWithTimeout(acc.codeUrl).then((r) => r.text());
      const code = extractSmsCode(text || '');
      if (!code) {
        if (i === 1 || i % 5 === 0) {
          await pushLog(`【3/5】接码中 (${i}/${maxPoll})…`);
        }
        continue;
      }
      // 与上一次相同 → 旧验证码，继续等
      if (lastCode && code === lastCode) {
        staleHits++;
        if (staleHits === 1 || staleHits % 3 === 0) {
          await pushLog(`【3/5】拿到旧验证码 ${code}（与上次相同），继续等待新验证码 (${i}/${maxPoll})`);
        }
        continue;
      }

      await pushLog(`【3/5】收到新验证码：${code}`);
      // 立即记录，避免下次再被误判为新码
      await setLastSmsCode(acc.phone, code);

      await pushLog('【4/5】填入验证码…');
      const codeFilled = await executeInPageMain(tabId, xhsFillSmsCode, [code]);
      if (!codeFilled) {
        await pushLog('【4/5】失败：未找到验证码输入框');
        await setStatus('自动登录失败：未找到验证码输入框');
        return false;
      }
      await sleep(800);

      await pushLog('【5/5】点击登录按钮…');
      const clicked = await executeInPageMain(tabId, xhsClickLogin, []);
      if (!clicked) {
        await pushLog('【5/5】未找到登录按钮（可能已自动登录）');
      }
      await sleep(3000);
      const triggerSync = () => { try { chrome.runtime.sendMessage({ type: MSG.syncLoginStatus }, () => { void chrome.runtime.lastError; }); } catch {} };
      triggerSync();
      setTimeout(triggerSync, 1500);
      setTimeout(triggerSync, 4000);
      await pushLog(`✅ 账号 ${accIdx + 1} 登录完成`);
      await setStatus('自动登录完成');
      return true;
    } catch (e: any) {
      await pushLog(`【3/5】接码请求异常 (${i}/${maxPoll})：${e?.message || e}`);
    }
  }
  if (staleHits > 0) {
    await pushLog(`【3/5】接码超时：${maxPoll} 次轮询里 ${staleHits} 次拿到旧码 ${lastCode}，未收到新验证码`);
  } else {
    await pushLog(`【3/5】接码超时（${maxPoll} 次轮询未收到验证码），请检查接码链接`);
  }
  await setStatus('自动登录失败：接码超时');
  return false;
}

/** 与侧栏「自动登录」一致：跳转 → 等加载 → 5s → 走 doAutoLoginOnTab */
export async function runNavigateThenAutoLogin(
  tabId: number,
  expectedSession?: number,
): Promise<boolean> {
  const stale = () =>
    expectedSession != null && expectedSession !== autoTaskState.sessionGen;
  const aborted = () => stale() || autoTaskState.abort || autoLoginState.abort;

  // 按登录模式分发：QR 走扫码主流程，SMS 走原手机号自动登录
  const mode = await getLoginMode();
  if (mode === 'qrcode') {
    if (aborted()) return false;
    return doQrCodeLoginOnTab(tabId, { isAborted: aborted });
  }

  if (aborted()) return false;
  const o = await storage.get([STORAGE_KEYS.accountList, STORAGE_KEYS.selectedAccountIndex]);
  const accs: AccountItem[] = (o[STORAGE_KEYS.accountList] || []).map((it: any) => ({
    phone: (it.phone || '').trim(),
    codeUrl: (it.codeUrl || '').trim(),
    maxCollectCount: it.maxCollectCount != null ? parseInt(it.maxCollectCount, 10) : 200,
  }));
  const accIdx = parseInt(o[STORAGE_KEYS.selectedAccountIndex], 10) || 0;
  if (accIdx < 0 || accIdx >= accs.length) {
    await pushLog('自动登录：无有效选中账号（请先在账号列表勾选一个）');
    return false;
  }
  const acc = accs[accIdx];
  if (!acc.phone || !acc.codeUrl) {
    await pushLog(`自动登录：账号 ${accIdx + 1} 缺少手机号或接码链接`);
    return false;
  }
  if (acc.maxCollectCount === 0) {
    await pushLog(`自动登录：账号 ${accIdx + 1} 采集上限为 0，跳过登录`);
    return false;
  }

  await setStatus('正在打开登录页…');
  const loginUrl = await getAutoLoginPageUrl();
  await pushLog(`正在打开「自动登录打开页」：${loginUrl}`);
  await new Promise<void>((resolve) =>
    chrome.tabs.update(tabId, { url: loginUrl }, () => resolve()),
  );
  if (aborted()) return false;
  await pushLog('页面跳转中，等待加载完成…');
  await waitForTabComplete(tabId);
  if (aborted()) return false;
  await pushLog('页面加载完成，等待 5 秒以让登录框渲染…');
  for (let i = 0; i < 10; i++) {
    if (aborted()) return false;
    await sleep(500);
  }
  if (aborted()) return false;

  return doAutoLoginOnTab(tabId, acc, accIdx, { isAborted: aborted });
}

/** 退出 → 切账号 → 登录（自动任务发现额度耗尽时调用） */
export async function doAutoSwitchAccount(
  tabId: number,
  nextIdx: number,
  accs: AccountItem[],
): Promise<boolean> {
  const acc = accs[nextIdx];
  if (!acc) return false;
  const phone = (acc.phone || '').trim();
  const codeUrl = (acc.codeUrl || '').trim();

  await pushLog('正在退出当前账号…');
  await setStatus('正在退出当前账号…');
  await executeInPageMain(tabId, xhsClickByText, ['更多']);
  await sleep(800);
  await executeInPageMain(tabId, xhsClickByText, ['退出登录']);
  await sleep(2000);
  const cleared = await clearXhsCookies();
  await pushLog(`已退出，清除 ${cleared} 个 Cookie`);

  await storage.setOne(STORAGE_KEYS.selectedAccountIndex, nextIdx);
  await pushLog(`切换到账号 ${nextIdx + 1}：${phone}`);
  await setStatus(`等待10秒后登录账号 ${nextIdx + 1}`);
  for (let r = 10; r > 0; r--) {
    await setStatus(`切换账号中… ${r} 秒后自动登录`);
    await sleep(1000);
  }

  if (!phone || !codeUrl) {
    await pushLog(`账号 ${nextIdx + 1} 缺少手机号或接码链接，跳过`);
    return false;
  }

  await pushLog(`开始自动登录账号 ${nextIdx + 1}：${phone}`);
  await setStatus(`正在登录账号 ${nextIdx + 1}…`);
  const loginPageUrl = await getAutoLoginPageUrl();
  await new Promise<void>((resolve) =>
    chrome.tabs.update(tabId, { url: loginPageUrl }, () => resolve()),
  );
  await waitForTabComplete(tabId);
  await sleep(5000);
  return doAutoLoginOnTab(tabId, { phone, codeUrl, maxCollectCount: acc.maxCollectCount }, nextIdx, {
    isAborted: () => autoTaskState.abort,
  });
}

/**
 * QR 模式的账号切换：没有「账号列表 + idx」概念，所以做法是
 *   清 cookie → 打开登录页 → 重新走 doQrCodeLoginOnTab
 * 由调用方（auto-task）负责在登录完成后再检查新 sessionHash 是否也超额。
 */
export async function doAutoSwitchAccountQr(tabId: number): Promise<boolean> {
  const aborted = () => autoTaskState.abort || autoLoginState.abort;
  await pushLog('QR 模式：当前账号额度耗尽，准备退出并重新扫码');
  await setStatus('正在退出当前账号…');

  // 清 cookie（更彻底 + 不依赖页面）
  try {
    await executeInPageMain(tabId, xhsClickByText, ['更多']);
    await sleep(400);
    await executeInPageMain(tabId, xhsClickByText, ['退出登录']);
    await sleep(1000);
  } catch {}
  const cleared = await clearXhsCookies();
  await pushLog(`已清理 ${cleared} 个 Cookie`);
  await setCurrentSessionHash('');
  if (aborted()) return false;

  await setStatus('等待 10 秒后重新扫码…');
  for (let r = 10; r > 0; r--) {
    if (aborted()) return false;
    await setStatus(`切换账号中… ${r} 秒后重新扫码`);
    await sleep(1000);
  }
  if (aborted()) return false;
  return doQrCodeLoginOnTab(tabId, { isAborted: aborted });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
