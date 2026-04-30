<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { storage } from '@shared/storage';
import {
  STORAGE_KEYS,
  MSG,
  LOGIN_MODE_DEFAULT,
  LOGIN_MODE_BUTTON_LABEL,
  LOGIN_MODE_BUTTON_CANCEL_LABEL,
  type LoginMode,
} from '@shared/constants';
import { useStorageRef } from '../composables/useStorageRef';
import { accountStore } from '../services/accountStore';
import { appendLoginLog } from '../state/loginLogState';

const loginMode = useStorageRef<LoginMode>(STORAGE_KEYS.loginMode, LOGIN_MODE_DEFAULT);

const list = accountStore.list;
const selectedIdx = accountStore.selectedIdx;
const status = ref<{ text: string; type: 'ok' | 'err' | 'ing' | '' }>({ text: '', type: '' });
const autoLoginRunning = ref(false);
const xhsLoggedIn = ref(false);
const checkingLogin = ref(false);
const pluginPaused = ref(false);

function setStatus(text: string, type: 'ok' | 'err' | 'ing' | '' = '') {
  status.value = { text, type };
}

function onStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) {
  if (area !== 'local') return;
  const rCh = changes[STORAGE_KEYS.autoLoginRunning];
  if (rCh) autoLoginRunning.value = !!rCh.newValue;
  const lgCh = changes[STORAGE_KEYS.xhsLoggedIn];
  if (lgCh) xhsLoggedIn.value = !!lgCh.newValue;
  const pCh = changes[STORAGE_KEYS.pluginPaused];
  if (pCh) pluginPaused.value = !!pCh.newValue;
}

function checkLoginStatus(options?: { silent?: boolean }) {
  const silent = !!options?.silent;
  if (checkingLogin.value) return;
  checkingLogin.value = true;
  if (!silent) setStatus('正在检测登录状态…', 'ing');
  try {
    chrome.runtime.sendMessage(
      { type: MSG.syncLoginStatus },
      (resp: { ok?: boolean; loggedIn?: boolean; via?: 'dom' | 'cookie' } | undefined) => {
        checkingLogin.value = false;
        if (chrome.runtime.lastError) {
          if (!silent) setStatus(`检测失败：${chrome.runtime.lastError.message}`, 'err');
          return;
        }
        if (!resp?.ok) {
          if (!silent) setStatus('检测失败', 'err');
          return;
        }
        xhsLoggedIn.value = !!resp.loggedIn;
        if (silent) return;
        const suffix = resp.via === 'dom' ? '（页面 DOM）' : '（Cookie 兜底）';
        setStatus(
          resp.loggedIn ? `账号已登录 ${suffix}` : `账号未登录 ${suffix}`,
          resp.loggedIn ? 'ok' : 'err',
        );
      },
    );
  } catch {
    checkingLogin.value = false;
    if (!silent) setStatus('检测失败', 'err');
  }
}

onMounted(() => {
  accountStore.init();
  chrome.storage.onChanged.addListener(onStorageChanged);
  // 同步当前 running / 已登录 状态（防止打开侧栏时显示不一致）
  storage
    .get([STORAGE_KEYS.autoLoginRunning, STORAGE_KEYS.xhsLoggedIn, STORAGE_KEYS.pluginPaused])
    .then((o) => {
      autoLoginRunning.value = !!o[STORAGE_KEYS.autoLoginRunning];
      xhsLoggedIn.value = !!o[STORAGE_KEYS.xhsLoggedIn];
      pluginPaused.value = !!o[STORAGE_KEYS.pluginPaused];
    });
  // 打开侧边栏时主动让 background 重新检测一次（静默，不打扰 UI）
  checkLoginStatus({ silent: true });
});
onUnmounted(() => {
  chrome.storage.onChanged.removeListener(onStorageChanged);
});

async function autoLogout() {
  setStatus('正在清空小红书 / Rednote 站点数据…', 'ing');

  // 1) 清理 Cookie（用 cookies API 覆盖所有子域名，最彻底）
  const cookieDomains = [
    'xiaohongshu.com',
    '.xiaohongshu.com',
    'www.xiaohongshu.com',
    'rednote.com',
    '.rednote.com',
    'www.rednote.com',
  ];
  let removed = 0;
  for (const domain of cookieDomains) {
    const cookies = await new Promise<chrome.cookies.Cookie[]>((resolve) =>
      chrome.cookies.getAll({ domain }, (c) => resolve(c || [])),
    );
    for (const c of cookies) {
      const protocol = c.secure ? 'https://' : 'http://';
      const url = protocol + c.domain.replace(/^\./, '') + c.path;
      await new Promise<void>((resolve) =>
        chrome.cookies.remove({ url, name: c.name }, () => resolve()),
      );
      removed++;
    }
  }
  appendLoginLog(`已删除 Cookie ${removed} 条`);

  // 2) 清理站点存储（localStorage / IndexedDB / cacheStorage / serviceWorker / cache 等）
  // 仅针对小红书 / Rednote 的 origin，绝不会动其他网站或本扩展数据
  const origins = [
    'https://xiaohongshu.com',
    'https://www.xiaohongshu.com',
    'https://edith.xiaohongshu.com',
    'https://rednote.com',
    'https://www.rednote.com',
    'https://webapi.rednote.com',
  ];
  try {
    await new Promise<void>((resolve, reject) =>
      chrome.browsingData.remove(
        { origins },
        {
          cacheStorage: true,
          cookies: true,
          fileSystems: true,
          indexedDB: true,
          localStorage: true,
          serviceWorkers: true,
          cache: true,
        },
        () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        },
      ),
    );
    appendLoginLog(`已清理站点缓存与存储（${origins.length} 个 origin）`);
  } catch (e) {
    appendLoginLog(`清理站点存储失败：${(e as Error).message}`);
  }

  // 3) 如果当前页面是小红书 / Rednote，刷新一下让登出生效
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id && tab.url && /(?:xiaohongshu|rednote)\.com/.test(tab.url)) {
    chrome.tabs.reload(tab.id);
    appendLoginLog('已刷新当前标签页');
  }

  setStatus(`已退出：清除 ${removed} 个 Cookie 与站点缓存`, 'ok');
  try { chrome.runtime.sendMessage({ type: MSG.syncLoginStatus }, () => { void chrome.runtime.lastError; }); } catch {}
}

async function autoLogin() {
  if (pluginPaused.value) {
    setStatus('插件已暂停，请先点右上角「恢复」', 'err');
    return;
  }
  if (xhsLoggedIn.value) {
    setStatus('账号已登录，如需切换请先点「自动退出」', 'err');
    return;
  }
  const isQr = loginMode.value === 'qrcode';
  if (!isQr) {
    const acc = list.value[selectedIdx.value];
    if (!acc?.phone) {
      setStatus('请先选中并填写账号手机号', 'err');
      return;
    }
    if (!acc.codeUrl) {
      setStatus('当前账号缺少接码链接', 'err');
      return;
    }
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) {
    setStatus('无法获取当前标签页', 'err');
    return;
  }
  const tabId = tabs[0].id;

  autoLoginRunning.value = true;
  if (isQr) {
    setStatus('已发起扫码登录…', 'ing');
    appendLoginLog('【panel】触发扫码登录');
  } else {
    const acc = list.value[selectedIdx.value];
    setStatus(`已发起账号 ${selectedIdx.value + 1} 自动登录…`, 'ing');
    appendLoginLog(`【panel】触发自动登录：账号 ${selectedIdx.value + 1} ${acc?.phone}`);
  }

  // 仅发消息触发，由 background 一次性完成（导航 → 等待 → fillPhone → SMS → 登录）
  // 不 await：避免阻塞 UI；进度通过 storage onChanged 实时同步过来
  chrome.runtime.sendMessage(
    { type: MSG.runNavigateThenAutoLogin, tabId },
    (response: { ok?: boolean; aborted?: boolean } | undefined) => {
      // 用户点过「取消」就以本地状态为准，忽略迟到的 background 回调
      if (!autoLoginRunning.value) return;
      autoLoginRunning.value = false;
      const label = loginMode.value === 'qrcode' ? '扫码登录' : '自动登录';
      if (chrome.runtime.lastError) {
        setStatus(`${label}通信失败：${chrome.runtime.lastError.message}`, 'err');
        return;
      }
      if (response?.aborted) {
        setStatus(`${label}已取消`, 'err');
      } else if (response?.ok) {
        setStatus(`${label}完成`, 'ok');
      } else {
        setStatus(`${label}未完成（详见「执行日志」）`, 'err');
      }
    },
  );
}

function cancelAutoLogin() {
  appendLoginLog('【panel】请求取消自动登录');
  autoLoginRunning.value = false;
  const label = loginMode.value === 'qrcode' ? '扫码登录' : '自动登录';
  setStatus(`${label}已取消`, 'err');
  storage.setOne(STORAGE_KEYS.autoLoginRunning, false).catch(() => {});
  // 通知 background 设置 abort 标志（即便 background 在线，它也只是设旗标，不会卡 UI）
  try {
    chrome.runtime.sendMessage({ type: MSG.abortAutoLogin }, () => {
      void chrome.runtime.lastError;
    });
  } catch {}
}

function onLoginBtnClick() {
  if (autoLoginRunning.value) cancelAutoLogin();
  else autoLogin();
}

const loginButtonLabel = computed(() =>
  autoLoginRunning.value
    ? LOGIN_MODE_BUTTON_CANCEL_LABEL[loginMode.value]
    : LOGIN_MODE_BUTTON_LABEL[loginMode.value],
);
const loginHintText = computed(() =>
  loginMode.value === 'qrcode' ? '请点击右侧「扫码登录」完成登录' : '请点击右侧「自动登录」完成登录',
);

</script>

<template>
  <section class="panel-card">
    <label class="section-label">账号管理</label>

    <!-- 未登录 横幅：手动或自动检测到未登录时显示，样式醒目 -->
    <div
      v-if="!xhsLoggedIn && !autoLoginRunning"
      class="mb-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"
      role="alert"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="shrink-0 text-amber-600"
        aria-hidden="true"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span class="font-semibold">当前未登录</span>
      <span class="text-amber-700/80 truncate">{{ loginHintText }}</span>
    </div>

    <div class="flex gap-2">
      <button
        @click="checkLoginStatus()"
        class="btn-secondary !mb-0 !w-auto flex-none px-3 whitespace-nowrap"
        :disabled="checkingLogin || autoLoginRunning"
        title="立即检测当前登录状态（优先页面 DOM，其次 Cookie 兜底）"
      >{{ checkingLogin ? '检测中…' : '检测登录' }}</button>

      <button
        @click="autoLogout"
        class="btn-secondary !mb-0 flex-1"
        :disabled="autoLoginRunning"
        title="清除小红书 / Rednote 域名的 Cookie 与站点缓存（不会清除本插件数据）"
      >自动退出</button>

      <!-- 已登录 → 显示「账号已登录」且不可点击；登录中 → 取消；未登录 → 自动登录 -->
      <button
        v-if="xhsLoggedIn && !autoLoginRunning"
        disabled
        class="!mb-0 flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded border border-green-300 bg-green-50 text-green-700 cursor-not-allowed"
        title="检测到登录态 cookie，账号已登录。如需切换请先点「自动退出」"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        账号已登录
      </button>
      <button
        v-else
        @click="onLoginBtnClick"
        class="!mb-0 flex-1"
        :disabled="pluginPaused && !autoLoginRunning"
        :title="pluginPaused && !autoLoginRunning ? '插件已暂停，请先点右上角「恢复」' : ''"
        :class="autoLoginRunning ? 'btn-secondary !text-red-600 !border-red-300' : 'btn-primary'"
      >{{ loginButtonLabel }}</button>
    </div>

    <div
      v-if="status.text"
      class="text-xs mt-1.5"
      :class="{
        'text-green-700': status.type === 'ok',
        'text-red-600': status.type === 'err',
        'text-blue-700': status.type === 'ing',
      }"
    >{{ status.text }}</div>

  </section>
</template>
