<script setup lang="ts">
import { useStorageRef } from '../composables/useStorageRef';
import { STORAGE_KEYS, MSG } from '@shared/constants';

const runInBackground = useStorageRef<boolean>(STORAGE_KEYS.autoTaskRunInBackground, false);
const autoLoginEnabled = useStorageRef<boolean>(STORAGE_KEYS.autoTaskAutoLoginEnabled, false);
const running = useStorageRef<boolean>(STORAGE_KEYS.autoTaskRunning, false);
const status = useStorageRef<string>(STORAGE_KEYS.autoTaskStatus, '');
const pluginPaused = useStorageRef<boolean>(STORAGE_KEYS.pluginPaused, false);

function start() {
  try { chrome.runtime.sendMessage({ type: MSG.startAutoTask }, () => { void chrome.runtime.lastError; }); } catch {}
}
function stop() {
  try { chrome.runtime.sendMessage({ type: MSG.stopAutoTask }, () => { void chrome.runtime.lastError; }); } catch {}
}
</script>

<template>
  <section class="panel-card">
    <label class="section-label">接口任务自动执行</label>

    <p class="text-[11px] text-slate-500 mb-2 leading-relaxed">
      启动后：校验登录 → 从接口拉取关键词并<strong>合并到「关键词」步骤的列表</strong> → 按「配置」中的<strong>随机间隔与可执行时间</strong>顺序搜索（含筛选、滚动第二页等）。
      <strong>运行与回传日志</strong>请在步骤「5 执行日志」中查看。
    </p>

    <div class="flex flex-nowrap items-center gap-x-4 gap-y-1 mb-2 text-[12px] text-slate-600 min-w-0">
      <label class="flex items-center gap-1.5 cursor-pointer shrink-0">
        <input v-model="runInBackground" type="checkbox" class="shrink-0" />
        <span class="whitespace-nowrap">后台执行（关闭侧边栏后继续运行）</span>
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer min-w-0">
        <input v-model="autoLoginEnabled" type="checkbox" class="shrink-0" />
        <span class="min-w-0 leading-snug">需要时自动登录（检测到未登录则先登录）</span>
      </label>
    </div>

    <div class="flex gap-2">
      <button
        @click="start"
        :disabled="running || pluginPaused"
        :title="pluginPaused ? '插件已暂停，请先点右上角「恢复」' : ''"
        class="btn-primary !mb-0 flex-1"
      >启动自动任务</button>
      <button @click="stop" :disabled="!running" class="btn-secondary !mb-0 flex-1">关闭自动任务</button>
    </div>

    <div v-if="status" class="text-xs text-slate-600 mt-1.5">{{ status }}</div>
  </section>
</template>
