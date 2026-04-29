<script setup lang="ts">
import { ref } from 'vue';
import { useStorageRef } from '../composables/useStorageRef';
import { STORAGE_KEYS, MSG } from '@shared/constants';
import { storage } from '@shared/storage';
import { keywordStore } from '../services/keywordStore';
import type { KeywordTaskInfo } from '@/types/xhs';
import { watch } from 'vue';
import {
  manualOrderedRunning,
  manualRunningIdx,
  manualDoneSet,
  prependManualRunLog,
  manualOrderedCancelRequested,
} from '../state/manualExecuteState';

const keywords = keywordStore.list;
const taskInfoMap = keywordStore.infoMap;

const orderedDelayMinSec = useStorageRef<number>(STORAGE_KEYS.orderedExecuteDelayMinSec, 120);
const orderedDelayMaxSec = useStorageRef<number>(STORAGE_KEYS.orderedExecuteDelayMaxSec, 130);
const executedKeywords = useStorageRef<string[]>(STORAGE_KEYS.orderedSearchExecutedKeywords, []);
const pluginPaused = useStorageRef<boolean>(STORAGE_KEYS.pluginPaused, false);

const status = ref<{ text: string; type: 'ok' | 'err' | 'ing' | '' }>({ text: '', type: '' });

let orderedCancelRequested = false;
let clearKeywordTaskTimer: ReturnType<typeof setTimeout> | null = null;

// 外部（全局停止按钮）请求取消 → 同步到本地 cancel 标志
watch(manualOrderedCancelRequested, (v) => {
  if (v) orderedCancelRequested = true;
});

function setStatus(text: string, type: 'ok' | 'err' | 'ing' | '' = '') {
  status.value = { text, type };
}

function infoOf(kw: string): KeywordTaskInfo | undefined {
  return taskInfoMap.value[kw];
}

function scheduleClearCurrentKeywordTask() {
  if (clearKeywordTaskTimer != null) clearTimeout(clearKeywordTaskTimer);
  clearKeywordTaskTimer = setTimeout(() => {
    clearKeywordTaskTimer = null;
    void storage.remove([STORAGE_KEYS.currentKeywordTask]);
  }, 120_000);
}

function isExecutedKw(kw: string): boolean {
  return executedKeywords.value.includes(kw);
}

function appendExecuted(kw: string) {
  if (executedKeywords.value.includes(kw)) return;
  executedKeywords.value = [...executedKeywords.value, kw];
}

function onOrderedButtonClick() {
  if (manualOrderedRunning.value) {
    orderedCancelRequested = true;
    return;
  }
  if (pluginPaused.value) {
    setStatus('插件已暂停，请先点右上角「恢复」', 'err');
    return;
  }
  void runOrdered();
}

function parseOrderedDelayRange(): { minS: number; maxS: number } | null {
  let minS = Math.floor(Number(orderedDelayMinSec.value));
  let maxS = Math.floor(Number(orderedDelayMaxSec.value));
  if (!Number.isFinite(minS) || !Number.isFinite(maxS)) {
    setStatus('间隔时间请填写有效数字（秒）', 'err');
    return null;
  }
  if (minS < 0 || maxS < 0) {
    setStatus('间隔时间不能为负数', 'err');
    return null;
  }
  if (minS > maxS) [minS, maxS] = [maxS, minS];
  return { minS, maxS };
}

function randomSecInclusive(minS: number, maxS: number): number {
  return minS + Math.floor(Math.random() * (maxS - minS + 1));
}

async function runOrdered() {
  if (!keywords.value.length) {
    setStatus('请先在「关键词」步骤添加或拉取关键词', 'err');
    return;
  }
  const delayRange = parseOrderedDelayRange();
  if (!delayRange) return;

  if (clearKeywordTaskTimer != null) {
    clearTimeout(clearKeywordTaskTimer);
    clearKeywordTaskTimer = null;
  }
  await storage.remove([STORAGE_KEYS.currentKeywordTask]);

  const queue = keywords.value
    .map((kw, i) => ({ kw, i }))
    .filter(({ kw }) => !isExecutedKw(kw));
  if (!queue.length) {
    setStatus('当前列表中的关键词均已执行过，无需再搜（在关键词步骤删除条目或清空后可重新执行）', 'err');
    return;
  }

  manualDoneSet.value = new Set();
  manualOrderedRunning.value = true;
  orderedCancelRequested = false;
  manualOrderedCancelRequested.value = false;
  const total = queue.length;
  try {
    for (let step = 0; step < total; step++) {
      if (orderedCancelRequested) {
        prependManualRunLog('已取消顺序搜索');
        setStatus('已取消顺序搜索', 'ok');
        return;
      }
      const { kw, i } = queue[step];
      manualRunningIdx.value = i;
      setStatus(`执行中 ${step + 1}/${total}：${kw}`, 'ing');
      const taskInfo: KeywordTaskInfo = {
        ...(infoOf(kw) || {}),
        Keywords: kw,
      };
      await storage.setOne(STORAGE_KEYS.currentKeywordTask, taskInfo);
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        setStatus('无可用标签页', 'err');
        return;
      }
      // 走 background 的统一调度：根据 storage 里的 searchTriggerMode（直跳/拟人/速填）
      // 派发到对应触发函数，并等待 /search/notes 首页响应（与自动任务同一套链路）。
      // 与之前直接 chrome.tabs.update 的差别：现在「等首页响应到位」才进入下一关键词的倒计时，
      // 顺手保证下游 pages / 回传所看到的数据与按钮交互一致。
      try {
        const resp: any = await chrome.runtime.sendMessage({
          type: MSG.triggerKeywordSearch,
          tabId: tabs[0].id,
          keyword: kw,
        });
        if (!resp?.ok) {
          // status 为 'quota' 表示打开搜索页失败已被标记今日上限，提示并停止本轮
          if (resp?.status === 'quota') {
            prependManualRunLog(`触发失败（已达今日上限）：${kw}`);
            setStatus('触发失败（已达今日上限）', 'err');
            return;
          }
          prependManualRunLog(`触发失败：${kw}（${resp?.error || 'unknown'}）`);
        }
      } catch (e: any) {
        prependManualRunLog(`触发异常：${kw}（${e?.message || e}）`);
      }
      if (orderedCancelRequested) {
        prependManualRunLog('已取消顺序搜索');
        setStatus('已取消顺序搜索', 'ok');
        return;
      }
      if (step < total - 1) {
        const waitSec = randomSecInclusive(delayRange.minS, delayRange.maxS);
        await storage.setOne(STORAGE_KEYS.countdownRemainSec, waitSec).catch(() => {});
        for (let s = waitSec; s > 0; s--) {
          if (orderedCancelRequested) {
            await storage.setOne(STORAGE_KEYS.countdownRemainSec, 0).catch(() => {});
            prependManualRunLog('已取消顺序搜索');
            setStatus('已取消顺序搜索', 'ok');
            return;
          }
          setStatus(`执行中 ${step + 1}/${total}：${kw} · ${s} 秒后下一词（本次 ${waitSec}s）`, 'ing');
          await storage.setOne(STORAGE_KEYS.countdownRemainSec, s).catch(() => {});
          await new Promise((r) => setTimeout(r, 1000));
        }
        await storage.setOne(STORAGE_KEYS.countdownRemainSec, 0).catch(() => {});
      }
      appendExecuted(kw);
      prependManualRunLog(`已搜：${kw}`);
      const next = new Set(manualDoneSet.value);
      next.add(i);
      manualDoneSet.value = next;
    }
    setStatus('执行完成', 'ok');
  } finally {
    manualOrderedRunning.value = false;
    manualRunningIdx.value = -1;
    manualOrderedCancelRequested.value = false;
    await storage.setOne(STORAGE_KEYS.countdownRemainSec, 0).catch(() => {});
    scheduleClearCurrentKeywordTask();
  }
}
</script>

<template>
  <section class="panel-card">
    <label class="section-label">手动按顺序搜索</label>
    <p class="text-[11px] text-slate-400 mb-2 leading-relaxed">
      使用「关键词」步骤中的列表，间隔和筛选项在「配置」模块中设置。
    </p>

    <button
      type="button"
      @click="onOrderedButtonClick"
      :disabled="pluginPaused && !manualOrderedRunning"
      :title="pluginPaused && !manualOrderedRunning ? '插件已暂停，请先点右上角「恢复」' : ''"
      :class="manualOrderedRunning ? 'btn-secondary' : 'btn-primary'"
    >
      {{ manualOrderedRunning ? '取消按顺序搜索' : '按顺序执行搜索' }}
    </button>
    <div
      v-if="status.text"
      class="mt-1.5 text-xs"
      :class="{
        'text-green-700': status.type === 'ok',
        'text-red-600': status.type === 'err',
        'text-blue-700': status.type === 'ing',
        'text-slate-600': status.type === '',
      }"
    >{{ status.text }}</div>
  </section>
</template>
