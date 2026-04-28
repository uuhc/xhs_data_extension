<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useStorageRef } from '../composables/useStorageRef';
import {
  STORAGE_KEYS,
  LOGIN_MODE_DEFAULT,
  LOGIN_MODE_LABEL,
  LOGIN_MODE_DESC,
  QR_LOGIN_DEFAULT_MAX,
  QR_LOGIN_SITE_DEFAULT,
  QR_LOGIN_SITE_LABEL,
  QR_LOGIN_SITE_DESC,
  type LoginMode,
  type QrLoginSite,
} from '@shared/constants';
import { fetchWithTimeout } from '@shared/fetch';
import { storage } from '@shared/storage';
import { extractSmsCode } from '@shared/sms';
import { getTodayDateStr } from '@shared/time';
import { accountStore } from '../services/accountStore';
import type { AccountCollectStats, QrSessionStatsMap, QrSessionStat } from '@/types/xhs';

// 登录模式（决定展示哪种账号列表 + QR 配置面板）
const loginMode = useStorageRef<LoginMode>(STORAGE_KEYS.loginMode, LOGIN_MODE_DEFAULT);
const LOGIN_MODES: LoginMode[] = ['sms', 'qrcode'];

// QR 模式专属配置（站点 / 接口 / 默认上限）
const qrLoginApiUrl = useStorageRef<string>(STORAGE_KEYS.qrLoginApiUrl, '');
const qrLoginSite = useStorageRef<QrLoginSite>(STORAGE_KEYS.qrLoginSite, QR_LOGIN_SITE_DEFAULT);
const QR_SITES: QrLoginSite[] = ['cn', 'intl'];

// 账号数据走 accountStore（命令式 + 事务式写）
const list = accountStore.list;
const selectedIdx = accountStore.selectedIdx;

// 采集统计还是用旧的 useStorageRef，简单数据没问题
const stats = useStorageRef<AccountCollectStats>(STORAGE_KEYS.accountCollectStats, {});

// QR 模式的 sessionStats / 当前 session / 全局默认 max
const qrSessions = useStorageRef<QrSessionStatsMap>(STORAGE_KEYS.qrSessionStats, {});
const currentQrSessionHash = useStorageRef<string>(STORAGE_KEYS.currentQrSessionHash, '');
const qrLoginDefaultMax = useStorageRef<number>(
  STORAGE_KEYS.qrLoginDefaultMax,
  QR_LOGIN_DEFAULT_MAX,
);

const newPhone = ref('');
const newCodeUrl = ref('');
const batchInput = ref('');
const status = ref<{ text: string; type: 'ok' | 'err' | 'ing' | '' }>({ text: '', type: '' });
const smsResult = ref('');

function setStatus(text: string, type: 'ok' | 'err' | 'ing' | '' = '') {
  status.value = { text, type };
}

onMounted(() => {
  accountStore.init();
});

function summarizeAdd(added: number, duplicated: number, invalid: number): string {
  const extra: string[] = [];
  if (duplicated) extra.push(`跳过 ${duplicated} 个重复`);
  if (invalid) extra.push(`跳过 ${invalid} 个无效`);
  return extra.length ? `（${extra.join('，')}）` : '';
}

async function addOne() {
  const phone = newPhone.value.trim();
  if (!phone) {
    setStatus('请填写手机号', 'err');
    return;
  }
  const result = await accountStore.add({
    phone,
    codeUrl: newCodeUrl.value.trim(),
    maxCollectCount: 200,
  });
  if (result.added) {
    newPhone.value = '';
    newCodeUrl.value = '';
    setStatus(`已添加 ${phone}`, 'ok');
  } else if (result.duplicated) {
    setStatus(`手机号 ${phone} 已存在，未重复添加`, 'err');
  } else {
    setStatus('手机号格式无效', 'err');
  }
}

async function batchAdd() {
  if (!batchInput.value.trim()) {
    setStatus('请先在批量框中粘贴账号', 'err');
    return;
  }
  const result = await accountStore.batchAdd(batchInput.value);
  if (result.added) {
    batchInput.value = '';
    setStatus(
      `已批量添加 ${result.added} 个账号${summarizeAdd(0, result.duplicated, result.invalid)}`,
      'ok',
    );
  } else {
    const why: string[] = [];
    if (result.duplicated) why.push(`${result.duplicated} 个重复`);
    if (result.invalid) why.push(`${result.invalid} 个无效`);
    setStatus(`未添加任何账号${why.length ? `（${why.join('、')}）` : ''}`, 'err');
  }
}

async function removeAt(idx: number) {
  await accountStore.removeAt(idx);
}

async function updateField(idx: number, field: 'phone' | 'codeUrl' | 'maxCollectCount', value: any) {
  await accountStore.updateField(idx, field, value);
}

function todayCount(idx: number): number {
  const today = getTodayDateStr();
  return stats.value[String(idx)]?.[today] || 0;
}

const accountsView = computed(() =>
  list.value.map((a, i) => ({
    ...a,
    idx: i,
    today: todayCount(i),
    exceeded: todayCount(i) >= (a.maxCollectCount ?? 200),
  })),
);

async function testCode(idx: number) {
  const acc = list.value[idx];
  if (!acc?.codeUrl) {
    setStatus('请先填写接码链接', 'err');
    return;
  }
  setStatus(`正在请求账号 ${idx + 1} 的接码链接…`, 'ing');
  try {
    const text = await fetchWithTimeout(acc.codeUrl).then((r) => r.text());
    const code = extractSmsCode(text);
    smsResult.value = code
      ? `验证码：${code}\n原始：${text.slice(0, 200)}`
      : `未提取到验证码：${text.slice(0, 200)}`;
    setStatus(
      code ? `账号 ${idx + 1} 接码成功` : `账号 ${idx + 1} 未提取到验证码`,
      code ? 'ok' : 'err',
    );
  } catch (e: any) {
    setStatus(`接码失败：${e?.message || e}`, 'err');
  }
}

async function clearStats() {
  if (loginMode.value === 'qrcode') {
    const next: QrSessionStatsMap = {};
    for (const [h, s] of Object.entries(qrSessions.value)) {
      next[h] = { ...s, daily: {} };
    }
    await storage.setOne(STORAGE_KEYS.qrSessionStats, next);
  } else {
    await storage.setOne(STORAGE_KEYS.accountCollectStats, {});
  }
  setStatus('已清空采集统计', 'ok');
}

// ---------- QR 模式：sessionStats 列表 ----------
interface QrRow {
  hash: string;
  alias: string;
  aliasDisplay: string;
  max: number | null;
  maxEffective: number;
  today: number;
  exceeded: boolean;
  firstSeenAt: number;
  lastUsedAt: number;
  isCurrent: boolean;
}

function fmtDate(ts: number): string {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const qrRows = computed<QrRow[]>(() => {
  const today = getTodayDateStr();
  const defaultMax = qrLoginDefaultMax.value || QR_LOGIN_DEFAULT_MAX;
  const cur = currentQrSessionHash.value;
  return Object.entries(qrSessions.value)
    .map(([hash, s]) => {
      const max = s.maxCollectCount != null ? s.maxCollectCount : null;
      const eff = max != null ? max : defaultMax;
      const count = s.daily?.[today] || 0;
      return {
        hash,
        alias: s.alias || '',
        aliasDisplay: s.alias || hash.slice(0, 8) + '…',
        max,
        maxEffective: eff,
        today: count,
        exceeded: count >= eff,
        firstSeenAt: s.firstSeenAt || 0,
        lastUsedAt: s.lastUsedAt || 0,
        isCurrent: hash === cur,
      };
    })
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
});

async function updateQrAlias(hash: string, value: string): Promise<void> {
  const next = { ...qrSessions.value };
  const s: QrSessionStat = next[hash]
    ? { ...next[hash] }
    : { firstSeenAt: Date.now(), lastUsedAt: Date.now(), daily: {} };
  s.alias = (value || '').trim();
  next[hash] = s;
  await storage.setOne(STORAGE_KEYS.qrSessionStats, next);
}

async function updateQrMax(hash: string, value: string | number | null | undefined): Promise<void> {
  const next = { ...qrSessions.value };
  const s: QrSessionStat = next[hash]
    ? { ...next[hash] }
    : { firstSeenAt: Date.now(), lastUsedAt: Date.now(), daily: {} };
  if (value == null || value === '' || value === '-') {
    delete s.maxCollectCount;
  } else {
    const n = typeof value === 'number' ? value : parseInt(value as string, 10);
    if (Number.isFinite(n) && n >= 0) s.maxCollectCount = n;
  }
  next[hash] = s;
  await storage.setOne(STORAGE_KEYS.qrSessionStats, next);
}

async function removeQrSession(hash: string): Promise<void> {
  const next = { ...qrSessions.value };
  delete next[hash];
  await storage.setOne(STORAGE_KEYS.qrSessionStats, next);
  if (currentQrSessionHash.value === hash) {
    await storage.setOne(STORAGE_KEYS.currentQrSessionHash, '');
  }
  setStatus(`已删除 ${hash.slice(0, 8)}…`, 'ok');
}
</script>

<template>
  <section class="panel-card">
    <!-- ===== 登录方式配置 ===== -->
    <label class="section-label">登录方式</label>
    <div class="inline-flex rounded border border-slate-200 overflow-hidden mb-1.5" role="radiogroup">
      <button
        v-for="m in LOGIN_MODES"
        :key="m"
        type="button"
        role="radio"
        :aria-checked="m === loginMode"
        class="px-3 py-1.5 text-[12px] border-r border-slate-200 last:border-r-0 transition-colors"
        :class="m === loginMode
          ? 'bg-brand text-white'
          : 'bg-white text-slate-600 hover:bg-slate-50'"
        :title="LOGIN_MODE_DESC[m]"
        @click="loginMode = m"
      >
        {{ LOGIN_MODE_LABEL[m] }}
      </button>
    </div>
    <p class="text-[11px] text-slate-400 mb-2">
      {{ LOGIN_MODE_DESC[loginMode] }}
    </p>

    <div v-if="loginMode === 'qrcode'" class="mb-3">
      <label class="section-label">扫码登录站点</label>
      <div
        class="inline-flex rounded border border-slate-200 overflow-hidden mb-1.5"
        role="radiogroup"
      >
        <button
          v-for="s in QR_SITES"
          :key="s"
          type="button"
          role="radio"
          :aria-checked="s === qrLoginSite"
          class="px-3 py-1.5 text-[12px] border-r border-slate-200 last:border-r-0 transition-colors"
          :class="s === qrLoginSite
            ? 'bg-brand text-white'
            : 'bg-white text-slate-600 hover:bg-slate-50'"
          :title="QR_LOGIN_SITE_DESC[s]"
          @click="qrLoginSite = s"
        >
          {{ QR_LOGIN_SITE_LABEL[s] }}
        </button>
      </div>
      <p class="text-[11px] text-slate-400 mb-2">
        {{ QR_LOGIN_SITE_DESC[qrLoginSite] }}
      </p>

      <label class="section-label">扫码登录接口地址（POST，留空将仅 console.log 走假成功）</label>
      <input
        v-model.lazy="qrLoginApiUrl"
        class="input-base mb-2"
        placeholder="https://your-scan-service.example/scan"
      />
      <label class="section-label">QR 单账号每日采集上限（默认，按账号可在列表里覆盖）</label>
      <input
        v-model.number.lazy="qrLoginDefaultMax"
        type="number"
        min="0"
        class="input-base"
        placeholder="200"
      />
    </div>

    <!-- ===== SMS 模式 ===== -->
    <template v-if="loginMode !== 'qrcode'">
      <label class="section-label">登录账号（自动登录时使用下方选中的账号）</label>

      <div class="max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 mb-2">
        <div v-if="!list.length" class="px-3 py-4 text-xs text-slate-400 text-center">
          暂无账号
        </div>
        <div
          v-for="acc in accountsView"
          :key="acc.phone || `__empty_${acc.idx}`"
          class="flex items-start gap-2 px-2.5 py-1.5 border-b border-slate-200 last:border-b-0 text-[13px] transition-colors"
          :class="
            selectedIdx === acc.idx
              ? 'bg-blue-50/95 border-l-4 border-l-brand rounded-sm'
              : ''
          "
        >
          <input
            type="radio"
            name="selectedAccount"
            :value="acc.idx"
            :checked="selectedIdx === acc.idx"
            @change="accountStore.setSelected(acc.idx)"
            class="mt-1.5 shrink-0"
          />
          <div class="flex-1 min-w-0 flex flex-col gap-1">
            <input
              class="input-base text-[13px] py-1"
              :value="acc.phone"
              @change="(e: any) => updateField(acc.idx, 'phone', e.target.value)"
            />
            <input
              class="input-base text-[11px] py-1"
              :value="acc.codeUrl"
              @change="(e: any) => updateField(acc.idx, 'codeUrl', e.target.value)"
            />
            <div
              class="text-[11px]"
              :class="acc.exceeded ? 'text-red-600 font-medium' : 'text-blue-700'"
            >
              今日 {{ acc.today }}/{{ acc.maxCollectCount }}
            </div>
          </div>
          <input
            type="number"
            :value="acc.maxCollectCount"
            @change="(e: any) => updateField(acc.idx, 'maxCollectCount', e.target.value)"
            class="w-20 shrink-0 px-1.5 py-1 border border-slate-200 rounded text-center text-[13px]"
          />
          <button
            @click="testCode(acc.idx)"
            class="shrink-0 text-[12px] px-2 py-1 border border-slate-300 rounded text-slate-600 hover:text-brand"
          >测试</button>
          <button
            @click="removeAt(acc.idx)"
            class="shrink-0 text-[12px] px-2 py-1 border border-slate-300 rounded text-slate-400 hover:text-brand"
          >删除</button>
        </div>
      </div>

      <div class="flex items-start gap-2 mb-1.5">
        <textarea
          v-model="batchInput"
          rows="3"
          placeholder="批量粘贴：每行一个账号，手机号 与 接码链接 用 Tab 或空格分隔"
          class="input-base text-xs flex-1 font-mono"
        ></textarea>
        <button @click="batchAdd" class="btn-add shrink-0">批量添加</button>
      </div>

      <div class="flex items-center gap-2 mb-2">
        <input v-model="newPhone" placeholder="手机号" class="input-base flex-1" />
        <input v-model="newCodeUrl" placeholder="接码链接" class="input-base flex-1" />
        <button @click="addOne" class="btn-add shrink-0">添加</button>
      </div>

      <div
        v-if="smsResult"
        class="px-3 py-2 text-[13px] bg-blue-50 border-l-2 border-brand rounded mb-2 whitespace-pre-wrap break-all"
      >
        {{ smsResult }}
      </div>
    </template>

    <!-- ===== QR 模式 ===== -->
    <template v-else>
      <label class="section-label">扫码账号列表（扫码成功后自动登记，按 web_session 归集）</label>
      <div class="max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 mb-2">
        <div v-if="!qrRows.length" class="px-3 py-4 text-xs text-slate-400 text-center">
          暂无扫码账号。点击「扫码登录」按钮完成首次登录后，会自动出现在这里。
        </div>
        <div
          v-for="row in qrRows"
          :key="row.hash"
          class="flex items-start gap-2 px-2.5 py-1.5 border-b border-slate-200 last:border-b-0 text-[13px] transition-colors"
          :class="row.isCurrent ? 'bg-blue-50/95 border-l-4 border-l-brand rounded-sm' : ''"
        >
          <div class="flex-1 min-w-0 flex flex-col gap-1">
            <div class="flex items-center gap-1 text-[11px] text-slate-500">
              <span
                class="inline-block px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono"
              >{{ row.hash.slice(0, 8) }}</span>
              <span v-if="row.isCurrent" class="text-brand font-medium">· 当前</span>
              <span class="truncate">首次 {{ fmtDate(row.firstSeenAt) }}</span>
            </div>
            <input
              class="input-base text-[13px] py-1"
              :value="row.alias"
              placeholder="别名（可选）"
              @change="(e: any) => updateQrAlias(row.hash, e.target.value)"
            />
            <div
              class="text-[11px]"
              :class="row.exceeded ? 'text-red-600 font-medium' : 'text-blue-700'"
            >
              今日 {{ row.today }}/{{ row.maxEffective }}<span
                v-if="row.max == null"
                class="text-slate-400 ml-1"
              >（默认）</span>
            </div>
          </div>
          <input
            type="number"
            :value="row.max != null ? row.max : ''"
            @change="(e: any) => updateQrMax(row.hash, e.target.value)"
            class="w-20 shrink-0 px-1.5 py-1 border border-slate-200 rounded text-center text-[13px]"
            :placeholder="String(qrLoginDefaultMax || QR_LOGIN_DEFAULT_MAX)"
            title="留空使用全局默认"
          />
          <button
            @click="removeQrSession(row.hash)"
            class="shrink-0 text-[12px] px-2 py-1 border border-slate-300 rounded text-slate-400 hover:text-brand"
          >删除</button>
        </div>
      </div>
    </template>

    <div class="flex items-center gap-2 flex-wrap">
      <button @click="clearStats" class="btn-secondary !w-auto !py-1 !px-2 !text-xs">清空今日统计</button>
      <span class="text-xs text-slate-500">
        <template v-if="loginMode === 'qrcode'">
          共 {{ qrRows.length }} 个扫码账号
        </template>
        <template v-else>
          当前共 {{ list.length }} 个账号
        </template>
      </span>
      <span
        v-if="status.text"
        class="text-xs"
        :class="{
          'text-green-700': status.type === 'ok',
          'text-red-600': status.type === 'err',
          'text-blue-700': status.type === 'ing',
        }"
      >{{ status.text }}</span>
    </div>
  </section>
</template>
