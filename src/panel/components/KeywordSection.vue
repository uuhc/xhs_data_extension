<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useStorageRef } from '../composables/useStorageRef';
import { STORAGE_KEYS } from '@shared/constants';
import { keywordStore } from '../services/keywordStore';
import type { KeywordTaskInfo } from '@/types/xhs';
import {
  manualOrderedRunning,
  manualRunningIdx,
  manualDoneSet,
  resetManualOrderedUiProgress,
} from '../state/manualExecuteState';

const keywords = keywordStore.list;
const taskInfoMap = keywordStore.infoMap;
const lastFetchedAt = keywordStore.lastFetchedAt;

const executedKeywords = useStorageRef<string[]>(STORAGE_KEYS.orderedSearchExecutedKeywords, []);
const currentKeywordTask = useStorageRef<KeywordTaskInfo | null>(
  STORAGE_KEYS.currentKeywordTask,
  null,
);
const autoTaskRunning = useStorageRef<boolean>(STORAGE_KEYS.autoTaskRunning, false);
const newKw = ref('');
const status = ref<{ text: string; type: 'ok' | 'err' | 'ing' | '' }>({ text: '', type: '' });
const fetching = ref(false);

const executedInListCount = computed(
  () => keywords.value.filter((k) => executedKeywords.value.includes(k)).length,
);

function setStatus(text: string, type: 'ok' | 'err' | 'ing' | '' = '') {
  status.value = { text, type };
}

async function add() {
  const v = newKw.value.trim();
  if (!v) return;
  const r = await keywordStore.add(v);
  if (r.duplicated) {
    setStatus(`「${v}」已存在`, 'err');
    return;
  }
  if (r.added) {
    newKw.value = '';
    setStatus(`已添加「${v}」`, 'ok');
  }
}

async function removeAt(i: number) {
  const removed = keywords.value[i];
  await keywordStore.removeAt(i);
  executedKeywords.value = executedKeywords.value.filter((k) => k !== removed);
  resetManualOrderedUiProgress();
  setStatus(`已删除「${removed}」`, 'ok');
}

async function clearAll() {
  if (!keywords.value.length) return;
  await keywordStore.clearAll();
  executedKeywords.value = [];
  resetManualOrderedUiProgress();
  setStatus('已清空所有关键词', 'ok');
}

async function fetchFromApi() {
  if (fetching.value) return;
  fetching.value = true;
  setStatus('正在从接口拉取关键词…', 'ing');
  try {
    const r = await keywordStore.refreshFromApi();
    if (r.total === 0) {
      setStatus(
        '接口已返回但解析不到关键词（请打开侧栏 devtools 查看 [fetchKeywordTask] 日志）',
        'err',
      );
      return;
    }
    const parts: string[] = [];
    parts.push(`接口返回 ${r.total} 个`);
    if (r.added) parts.push(`新增 ${r.added} 个`);
    if (r.duplicated) parts.push(`跳过 ${r.duplicated} 个重复`);
    setStatus(parts.join('，'), r.added ? 'ok' : 'err');
    resetManualOrderedUiProgress();
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[KeywordSection.fetchFromApi] failed:', e);
    let msg = e?.message || String(e);
    if (msg === 'Failed to fetch') msg = '网络请求失败（检查接口地址与网络）';
    setStatus(`拉取失败：${msg}（详情见 devtools 控制台）`, 'err');
  } finally {
    fetching.value = false;
  }
}

function infoOf(kw: string): KeywordTaskInfo | undefined {
  return taskInfoMap.value[kw];
}

function levelClass(level?: string): string {
  if (!level) return '';
  const l = String(level).toUpperCase();
  if (l === 'P0') return 'bg-red-50 text-red-600 border-red-200';
  if (l === 'P1') return 'bg-orange-50 text-orange-600 border-orange-200';
  if (l === 'P2') return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

const lastFetchedText = computed(() => {
  if (!lastFetchedAt.value) return '';
  return new Date(lastFetchedAt.value).toLocaleTimeString('zh-CN', { hour12: false });
});

function isExecutedKw(kw: string): boolean {
  return executedKeywords.value.includes(kw);
}

// 视觉「已完成」 = 本次会话刚跑完(manualDoneSet) 或 历史持久化已执行(executedKeywords)
function isDoneOf(i: number, kw: string): boolean {
  return manualDoneSet.value.has(i) || isExecutedKw(kw);
}

// ---------- 当前执行中关键词在列表中的索引 ----------
// 数据来源（优先级从高到低）：
//   1) 手动按顺序搜索：manualRunningIdx（明确指向 keywords 数组下标）
//   2) 自动任务/手动单步：currentKeywordTask.Keywords + autoTaskRunning（从 storage 反查下标）
// 没有任何任务在执行时返回 -1。
const effectiveRunningIdx = computed<number>(() => {
  if (manualOrderedRunning.value && manualRunningIdx.value >= 0) {
    return manualRunningIdx.value;
  }
  if (autoTaskRunning.value) {
    const kw = (currentKeywordTask.value?.Keywords || '').trim();
    if (kw) {
      const idx = keywords.value.indexOf(kw);
      if (idx >= 0) return idx;
    }
  }
  return -1;
});

function isRunningRow(i: number): boolean {
  return effectiveRunningIdx.value === i;
}

// ---------- 滚动：让「执行中」一行始终显示在列表中部 ----------
const listEl = ref<HTMLElement | null>(null);

function scrollRunningIntoCenter() {
  const container = listEl.value;
  if (!container) return;
  const idx = effectiveRunningIdx.value;
  // 没有执行中的：把第一个未执行的露出来（不强制居中，避免和用户主动滚动冲突）
  if (idx < 0) {
    const firstPendingIdx = keywords.value.findIndex((k) => !isExecutedKw(k));
    if (firstPendingIdx < 0) return;
    const el = container.querySelector<HTMLElement>(`[data-kw-idx="${firstPendingIdx}"]`);
    if (!el) return;
    const itemTop = el.offsetTop - container.offsetTop;
    if (itemTop < container.scrollTop || itemTop > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: Math.max(0, itemTop - 12), behavior: 'smooth' });
    }
    return;
  }
  const el = container.querySelector<HTMLElement>(`[data-kw-idx="${idx}"]`);
  if (!el) return;
  const itemTop = el.offsetTop - container.offsetTop;
  const wantTop = itemTop - container.clientHeight / 2 + el.clientHeight / 2;
  container.scrollTo({ top: Math.max(0, wantTop), behavior: 'smooth' });
}

watch(effectiveRunningIdx, () => {
  nextTick(() => scrollRunningIntoCenter());
});
watch(
  () => keywords.value.length,
  () => {
    nextTick(() => scrollRunningIntoCenter());
  },
);
onMounted(() => {
  nextTick(() => scrollRunningIntoCenter());
});
</script>

<template>
  <section class="panel-card">
    <label class="section-label">关键词</label>
    <p class="text-[11px] text-slate-400 mb-2 leading-relaxed">
      从接口拉取或手动维护列表；「按顺序搜索」「自动任务」均使用此列表。执行情况统计见下方。
    </p>

    <!-- 统计 -->
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-[12px] text-slate-600 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5"
    >
      <span>共 <strong class="font-semibold text-slate-800">{{ keywords.length }}</strong> 个</span>
      <span class="text-slate-300">|</span>
      <span
        title="本列表中曾通过「按顺序搜索」执行过的关键词数量"
      >本列表已顺序执行 <strong class="text-emerald-700">{{ executedInListCount }}</strong> 个</span>
      <span v-if="lastFetchedText" class="text-slate-400 text-[11px]">· 上次拉取 {{ lastFetchedText }}</span>
    </div>

    <div v-if="keywords.length" class="flex justify-end mb-2">
      <button
        @click="clearAll"
        :disabled="manualOrderedRunning"
        class="text-[12px] px-2 py-1 rounded border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >清空</button>
    </div>

    <ul
      ref="listEl"
      class="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white mb-2 list-none divide-y divide-slate-100 scroll-smooth"
    >
      <li v-if="!keywords.length" class="px-3 py-4 text-xs text-slate-400 text-center">
        暂无关键词，点击「从接口获取」或在下方输入添加
      </li>
      <li
        v-for="(kw, i) in keywords"
        :key="kw"
        :data-kw-idx="i"
        class="flex items-start gap-2 px-2.5 py-2 text-[13px] transition-colors"
        :class="{
          'bg-blue-50/70 ring-1 ring-blue-300/60': isRunningRow(i),
          'bg-slate-100/70 opacity-60': isExecutedKw(kw) && !isRunningRow(i),
          'bg-green-50/40': manualDoneSet.has(i) && !isExecutedKw(kw) && !isRunningRow(i),
          'hover:bg-slate-50': !isRunningRow(i) && !isDoneOf(i, kw),
        }"
        :title="isExecutedKw(kw) ? '该关键词回传已成功，已标记为已执行' : ''"
      >
        <span
          class="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-semibold border"
          :class="
            isRunningRow(i)
              ? 'bg-blue-500 text-white border-blue-500 animate-pulse'
              : isDoneOf(i, kw)
              ? 'bg-green-500 text-white border-green-500'
              : 'bg-slate-50 text-slate-500 border-slate-200'
          "
          :title="isRunningRow(i) ? '执行中' : isDoneOf(i, kw) ? '已执行' : `队列 #${i + 1}`"
        >
          <template v-if="!isRunningRow(i) && isDoneOf(i, kw)">✓</template>
          <template v-else>{{ i + 1 }}</template>
        </span>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-medium text-slate-800 break-all" :title="kw">{{ kw }}</span>
            <span
              v-if="infoOf(kw)?.Level"
              class="text-[10px] px-1.5 py-0 leading-[16px] rounded border font-mono"
              :class="levelClass(infoOf(kw)?.Level)"
              :title="`优先级 ${infoOf(kw)?.Level}`"
            >{{ infoOf(kw)?.Level }}</span>
            <span
              v-if="infoOf(kw)?.Platform"
              class="text-[10px] px-1.5 py-0 leading-[16px] rounded bg-slate-100 text-slate-500 border border-slate-200"
            >{{ infoOf(kw)?.Platform }}</span>
          </div>
          <div
            v-if="infoOf(kw)?.InterestName || infoOf(kw)?.ID"
            class="text-[11px] text-slate-400 mt-0.5 truncate"
            :title="infoOf(kw)?.InterestName || ''"
          >
            <template v-if="infoOf(kw)?.InterestName">{{ infoOf(kw)?.InterestName }}</template>
            <template v-if="infoOf(kw)?.ID"> · ID {{ infoOf(kw)?.ID }}</template>
          </div>
        </div>

        <button
          @click="removeAt(i)"
          :disabled="manualOrderedRunning || isExecutedKw(kw) || isRunningRow(i)"
          :title="
            isRunningRow(i)
              ? '执行中关键词不可删除'
              : isExecutedKw(kw)
              ? '已执行的关键词不可单独删除，请使用「清空」一并清理'
              : ''
          "
          class="shrink-0 text-[11px] px-2 py-0.5 border border-slate-200 rounded text-slate-400 hover:text-red-500 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >删除</button>
      </li>
    </ul>

    <div class="flex flex-nowrap items-center gap-2 mb-1 text-[13px] text-slate-500 min-w-0">
      <button
        @click="fetchFromApi"
        :disabled="fetching || manualOrderedRunning"
        class="shrink-0 text-[12px] px-2.5 py-1.5 rounded border border-brand text-brand hover:bg-brand hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        title="从配置的接口拉取关键词，并合并到下方列表（去重）"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          :class="fetching ? 'animate-spin' : ''"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
        {{ fetching ? '获取中…' : '从接口获取' }}
      </button>
      <input
        v-model="newKw"
        :disabled="manualOrderedRunning"
        @keydown.enter="add"
        placeholder="手动添加关键词"
        class="input-base flex-1 min-w-0 disabled:opacity-50"
      />
      <button @click="add" :disabled="manualOrderedRunning" class="btn-add shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
        添加
      </button>
    </div>

    <div
      v-if="status.text"
      class="mt-1 text-xs"
      :class="{
        'text-green-700': status.type === 'ok',
        'text-red-600': status.type === 'err',
        'text-blue-700': status.type === 'ing',
        'text-slate-600': status.type === '',
      }"
    >{{ status.text }}</div>
  </section>
</template>
