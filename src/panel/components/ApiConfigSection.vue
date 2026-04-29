<script setup lang="ts">
import { useStorageRef } from '../composables/useStorageRef';
import {
  STORAGE_KEYS,
  API_HOST_DEFAULT,
  SEARCH_SITE_DEFAULT,
  SEARCH_SITE_URL,
  SEARCH_SITE_LABEL,
  AUTO_LOGIN_PAGE_DEFAULT,
  SEARCH_TRIGGER_MODE_DEFAULT,
  SEARCH_TRIGGER_MODE_LABEL,
  SEARCH_TRIGGER_MODE_DESC,
  SEARCH_TRIGGER_MODE_PRIORITY,
  type SearchTriggerMode,
  type SearchSite,
} from '@shared/constants';
import { watch } from 'vue';

const apiHost = useStorageRef(STORAGE_KEYS.apiHost, API_HOST_DEFAULT);
const searchSite = useStorageRef<SearchSite>(STORAGE_KEYS.searchSite, SEARCH_SITE_DEFAULT);
const autoLoginPage = useStorageRef(STORAGE_KEYS.autoLoginPage, AUTO_LOGIN_PAGE_DEFAULT);

// 搜索站点切换时同步更新 searchSiteBase（供 background 使用）
const searchSiteBase = useStorageRef(STORAGE_KEYS.searchSiteBase, SEARCH_SITE_URL[SEARCH_SITE_DEFAULT]);
watch(searchSite, (v) => {
  searchSiteBase.value = SEARCH_SITE_URL[v] || SEARCH_SITE_URL[SEARCH_SITE_DEFAULT];
});
const SITES: SearchSite[] = ['cn', 'intl'];

// 搜索触发方式
const searchTriggerMode = useStorageRef<SearchTriggerMode>(
  STORAGE_KEYS.searchTriggerMode,
  SEARCH_TRIGGER_MODE_DEFAULT,
);
const MODES = SEARCH_TRIGGER_MODE_PRIORITY;

// 搜索间隔 & 发布时间筛选（手动顺序搜索 / 自动任务共用）
const orderedDelayMinSec = useStorageRef<number>(STORAGE_KEYS.orderedExecuteDelayMinSec, 120);
const orderedDelayMaxSec = useStorageRef<number>(STORAGE_KEYS.orderedExecuteDelayMaxSec, 130);
const publishTimeFilter = useStorageRef<string>(STORAGE_KEYS.publishTimeFilter, '半年内');

// 可执行时间范围
const allowedTimeStart = useStorageRef<string>(STORAGE_KEYS.allowedTimeStart, '10:00');
const allowedTimeEnd = useStorageRef<string>(STORAGE_KEYS.allowedTimeEnd, '21:00');
</script>

<template>
  <section class="panel-card">
    <label class="section-label">接口根地址</label>
    <input v-model.lazy="apiHost" class="input-base mb-2" placeholder="https://your-api.example/" />

    <label class="section-label">搜索页站点</label>
    <div class="inline-flex rounded border border-slate-200 overflow-hidden mb-1.5" role="radiogroup">
      <button
        v-for="s in SITES"
        :key="s"
        type="button"
        role="radio"
        :aria-checked="s === searchSite"
        class="px-3 py-1.5 text-[12px] border-r border-slate-200 last:border-r-0 transition-colors"
        :class="s === searchSite
          ? 'bg-brand text-white'
          : 'bg-white text-slate-600 hover:bg-slate-50'"
        @click="searchSite = s"
      >
        {{ SEARCH_SITE_LABEL[s] }}
      </button>
    </div>
    <p class="text-[11px] text-slate-400 mb-2 break-all">{{ SEARCH_SITE_URL[searchSite] }}</p>

    <label class="section-label">自动登录打开页（自动登录或弹窗触发时先跳转到此地址）</label>
    <input v-model.lazy="autoLoginPage" class="input-base mb-3" placeholder="https://www.rednote.com" />

    <label class="section-label">搜索触发方式（运行中切换次轮关键词生效）</label>
    <div class="inline-flex rounded border border-slate-200 overflow-hidden mb-1.5" role="radiogroup">
      <button
        v-for="m in MODES"
        :key="m"
        type="button"
        role="radio"
        :aria-checked="m === searchTriggerMode"
        class="px-3 py-1.5 text-[12px] border-r border-slate-200 last:border-r-0 transition-colors"
        :class="m === searchTriggerMode
          ? 'bg-brand text-white'
          : 'bg-white text-slate-600 hover:bg-slate-50'"
        :title="SEARCH_TRIGGER_MODE_DESC[m]"
        @click="searchTriggerMode = m"
      >
        {{ SEARCH_TRIGGER_MODE_LABEL[m] }}
      </button>
    </div>
    <p class="text-[11px] text-slate-400 mb-3">
      {{ SEARCH_TRIGGER_MODE_DESC[searchTriggerMode] }}
    </p>

    <label class="section-label">搜索间隔 & 发布时间筛选（手动与自动任务共用）</label>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mb-1">
      <div class="flex flex-nowrap items-center gap-x-2 text-[12px] text-slate-600">
        <span>间隔（秒，随机）</span>
        <div class="flex flex-nowrap items-center gap-x-1.5">
          <label class="inline-flex items-center gap-0.5">
            <span class="text-slate-500">最小</span>
            <input
              v-model.number="orderedDelayMinSec"
              type="number"
              min="0"
              step="1"
              class="input-base w-12 py-1 px-1 text-[12px] text-center"
            />
          </label>
          <span class="text-slate-400">～</span>
          <label class="inline-flex items-center gap-0.5">
            <span class="text-slate-500">最大</span>
            <input
              v-model.number="orderedDelayMaxSec"
              type="number"
              min="0"
              step="1"
              class="input-base w-12 py-1 px-1 text-[12px] text-center"
            />
          </label>
        </div>
      </div>

      <div class="flex flex-nowrap items-center gap-2 text-[12px] text-slate-600">
        <span class="shrink-0">发布时间筛选</span>
        <select
          v-model="publishTimeFilter"
          class="shrink-0 px-2 py-1 border border-slate-200 rounded text-[12px] max-w-[7rem]"
        >
          <option value="">不筛选</option>
          <option>一天内</option>
          <option>一周内</option>
          <option>半年内</option>
          <option>一年内</option>
        </select>
      </div>
    </div>

    <label class="section-label">可执行时间范围</label>
    <div class="flex flex-nowrap items-center gap-x-2 mb-1 text-[12px] text-slate-600">
      <input
        v-model="allowedTimeStart"
        type="time"
        class="input-base w-[5.5rem] py-1 px-1.5 text-[12px] text-center"
      />
      <span class="text-slate-400">～</span>
      <input
        v-model="allowedTimeEnd"
        type="time"
        class="input-base w-[5.5rem] py-1 px-1.5 text-[12px] text-center"
      />
      <span class="text-[11px] text-slate-400">留空则不限制</span>
    </div>
  </section>
</template>
