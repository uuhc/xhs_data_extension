<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useStorageRef } from '../composables/useStorageRef';
import { STORAGE_KEYS, MSG } from '@shared/constants';
import { manualOrderedRunLog } from '../state/manualExecuteState';

const autoTaskCallbackStatus = useStorageRef<{ success: boolean; message: string; time: number } | null>(
  STORAGE_KEYS.autoTaskCallbackStatus,
  null,
);

type AutoLogType = 'info' | 'ok' | 'err';
interface AutoLogEntry {
  ts: number;
  text: string;
  type: AutoLogType;
}
const autoTaskLogs = ref<AutoLogEntry[]>([]);
const AUTO_TASK_LOG_MAX = 200;

function appendLog(entry: AutoLogEntry) {
  // 按 (ts, text) 去重：sendMessage + 首次 history 可能同时投递同一条
  if (autoTaskLogs.value.some((e) => e.ts === entry.ts && e.text === entry.text)) return;
  autoTaskLogs.value = [entry, ...autoTaskLogs.value].slice(0, AUTO_TASK_LOG_MAX);
}

watch(autoTaskCallbackStatus, (v) => {
  if (!v?.message) return;
  appendLog({
    ts: v.time,
    text: (v.success ? '✓ ' : '✗ ') + v.message,
    type: v.success ? ('ok' as const) : ('err' as const),
  });
});

// 实时订阅 background 广播的新日志
function onRuntimeMessage(msg: any) {
  if (msg?.type !== MSG.autoTaskLogEntry) return;
  const e = msg.entry;
  if (!e?.text) return;
  appendLog({ ts: e.time, text: e.text, type: 'info' });
}

onMounted(() => {
  try {
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
  } catch {}
  // 主动向 background 拉一次 ring buffer 历史，避免面板关闭期间错过日志
  try {
    chrome.runtime.sendMessage({ type: MSG.autoTaskLogHistoryRequest }, (resp: any) => {
      if (chrome.runtime.lastError) return;
      const entries = resp?.entries;
      if (!Array.isArray(entries)) return;
      // 按时间倒序合并（新在前），交给 appendLog 去重
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e?.text) appendLog({ ts: e.time, text: e.text, type: 'info' });
      }
    });
  } catch {}
  // 首屏挂载：把已有日志定位到底部，确保最新行可见
  nextTick(() => {
    scrollToBottom(autoLogScrollEl.value);
    scrollToBottom(manualLogScrollEl.value);
  });
});

onUnmounted(() => {
  try {
    chrome.runtime.onMessage.removeListener(onRuntimeMessage);
  } catch {}
});

function formatLogTime(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const hasAnyLog = computed(
  () => manualOrderedRunLog.value.length > 0 || autoTaskLogs.value.length > 0,
);

// ---------- E3 日志过滤 / 搜索 ----------
// 仅前端过滤，不修改原始日志缓冲。type='all' 表示不过滤类型。
const logKeyword = ref('');
const logTypeFilter = ref<'all' | AutoLogType>('all');

// 渲染顺序：最新在底（控制台习惯），便于配合自动滚动「最新一行始终可见」
const filteredAutoTaskLogs = computed(() => {
  const kw = logKeyword.value.trim().toLowerCase();
  const t = logTypeFilter.value;
  return autoTaskLogs.value
    .filter((l) => {
      if (t !== 'all' && l.type !== t) return false;
      if (kw && !l.text.toLowerCase().includes(kw)) return false;
      return true;
    })
    .slice()
    .reverse();
});

const filteredManualLogs = computed(() => {
  const kw = logKeyword.value.trim().toLowerCase();
  const list = kw
    ? manualOrderedRunLog.value.filter((r) => (r.line || '').toLowerCase().includes(kw))
    : manualOrderedRunLog.value;
  return list.slice().reverse();
});

function clearFilter() {
  logKeyword.value = '';
  logTypeFilter.value = 'all';
}

// ---------- 自动滚动到底部 ----------
// 行为：
// - 默认跟随最新（每次有新日志就滚到底）
// - 用户主动向上滚动 → 暂停跟随，避免打断阅读
// - 重新滚到底部 → 恢复跟随
const autoLogScrollEl = ref<HTMLElement | null>(null);
const manualLogScrollEl = ref<HTMLElement | null>(null);
const autoFollowAuto = ref(true);
const autoFollowManual = ref(true);

function isNearBottom(el: HTMLElement, threshold = 8): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function scrollToBottom(el: HTMLElement | null) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function onAutoLogScroll() {
  const el = autoLogScrollEl.value;
  if (!el) return;
  autoFollowAuto.value = isNearBottom(el);
}
function onManualLogScroll() {
  const el = manualLogScrollEl.value;
  if (!el) return;
  autoFollowManual.value = isNearBottom(el);
}

watch(filteredAutoTaskLogs, async () => {
  if (!autoFollowAuto.value) return;
  await nextTick();
  scrollToBottom(autoLogScrollEl.value);
});
watch(filteredManualLogs, async () => {
  if (!autoFollowManual.value) return;
  await nextTick();
  scrollToBottom(manualLogScrollEl.value);
});
</script>

<template>
  <section class="panel-card">
    <label class="section-label">执行日志</label>
    <p class="text-[11px] text-slate-400 mb-2 leading-relaxed">
      汇总<strong class="font-medium text-slate-500">手动按顺序搜索</strong>的最近记录，以及<strong class="font-medium text-slate-500">自动任务</strong>的运行与回传日志。
    </p>

    <div v-if="hasAnyLog" class="flex items-center gap-1.5 mb-2">
      <input
        v-model="logKeyword"
        type="text"
        placeholder="搜索日志关键字"
        class="input-base text-[11px] py-1 flex-1"
      />
      <select v-model="logTypeFilter" class="input-base text-[11px] py-1 w-20">
        <option value="all">全部</option>
        <option value="ok">成功</option>
        <option value="err">错误</option>
        <option value="info">信息</option>
      </select>
      <button
        v-if="logKeyword || logTypeFilter !== 'all'"
        type="button"
        class="text-[11px] text-slate-500 hover:text-slate-700 px-1"
        @click="clearFilter"
      >清除</button>
    </div>

    <div v-if="!hasAnyLog" class="text-[12px] text-slate-400 py-2">暂无日志</div>

    <div v-if="filteredManualLogs.length" class="mb-3 rounded-md border border-slate-100 bg-slate-50/90 px-2.5 py-1.5 relative">
      <div class="text-[11px] font-medium text-slate-600 mb-1 flex items-center justify-between">
        <span>手动 · 顺序搜索（最近）</span>
        <button
          v-if="!autoFollowManual"
          type="button"
          class="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-500 hover:text-brand hover:border-brand"
          @click="() => { autoFollowManual = true; scrollToBottom(manualLogScrollEl); }"
        >跳到最新 ↓</button>
      </div>
      <ul
        ref="manualLogScrollEl"
        @scroll="onManualLogScroll"
        class="space-y-0.5 text-[11px] text-slate-600 list-none m-0 p-0 max-h-32 overflow-y-auto"
      >
        <li
          v-for="(row, idx) in filteredManualLogs"
          :key="`${row.at}-${idx}`"
          class="truncate leading-snug"
          :title="row.line"
        >
          <span class="text-slate-400 font-mono mr-1">{{ formatLogTime(row.at) }}</span>{{ row.line }}
        </li>
      </ul>
    </div>

    <div v-if="filteredAutoTaskLogs.length" class="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 relative">
      <div class="text-[11px] font-medium text-slate-600 mb-1 flex items-center justify-between">
        <span>
          自动任务 · 运行与回传
          <span v-if="filteredAutoTaskLogs.length !== autoTaskLogs.length" class="text-slate-400 font-normal ml-1">
            ({{ filteredAutoTaskLogs.length }}/{{ autoTaskLogs.length }})
          </span>
        </span>
        <button
          v-if="!autoFollowAuto"
          type="button"
          class="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-500 hover:text-brand hover:border-brand"
          @click="() => { autoFollowAuto = true; scrollToBottom(autoLogScrollEl); }"
        >跳到最新 ↓</button>
      </div>
      <div
        ref="autoLogScrollEl"
        @scroll="onAutoLogScroll"
        class="max-h-36 overflow-y-auto text-[11px] leading-relaxed whitespace-pre-wrap break-all"
      >
        <div
          v-for="(l, i) in filteredAutoTaskLogs"
          :key="`${l.ts}-${i}`"
          :class="{
            'text-green-700': l.type === 'ok',
            'text-red-600': l.type === 'err',
            'text-blue-700': l.type === 'info',
          }"
        >{{ l.text }}</div>
      </div>
    </div>

    <div
      v-if="hasAnyLog && !filteredManualLogs.length && !filteredAutoTaskLogs.length"
      class="text-[11px] text-slate-400 py-2"
    >
      没有匹配的日志
    </div>
  </section>
</template>
