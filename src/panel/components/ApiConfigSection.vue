<script setup lang="ts">
import { useStorageRef } from '../composables/useStorageRef';
import {
  STORAGE_KEYS,
  API_HOST_DEFAULT,
  SEARCH_SITE_BASE_DEFAULT,
  AUTO_LOGIN_PAGE_DEFAULT,
  SEARCH_TRIGGER_MODE_DEFAULT,
  SEARCH_TRIGGER_MODE_LABEL,
  SEARCH_TRIGGER_MODE_DESC,
  SEARCH_TRIGGER_MODE_PRIORITY,
  type SearchTriggerMode,
} from '@shared/constants';

const apiHost = useStorageRef(STORAGE_KEYS.apiHost, API_HOST_DEFAULT);
const searchSiteBase = useStorageRef(STORAGE_KEYS.searchSiteBase, SEARCH_SITE_BASE_DEFAULT);
const autoLoginPage = useStorageRef(STORAGE_KEYS.autoLoginPage, AUTO_LOGIN_PAGE_DEFAULT);

// 搜索触发方式：直跳 / 拟人 / 速填，作用于自动任务循环。
// 切换在「下一关键词」生效，不会打断当前关键词；切换后下游数据链路（首屏清空、
// 首页响应等待、pages 累积、回传、计数、已执行标记）保持一致。
const searchTriggerMode = useStorageRef<SearchTriggerMode>(
  STORAGE_KEYS.searchTriggerMode,
  SEARCH_TRIGGER_MODE_DEFAULT,
);
const MODES = SEARCH_TRIGGER_MODE_PRIORITY;
</script>

<template>
  <section class="panel-card">
    <label class="section-label">接口根地址</label>
    <input v-model.lazy="apiHost" class="input-base mb-2" placeholder="https://your-api.example/" />

    <label class="section-label">搜索页地址（仅填站点首页时会自动补全为搜索页）</label>
    <input v-model.lazy="searchSiteBase" class="input-base mb-2"
      placeholder="https://www.xiaohongshu.com/search_result?source=web_search_result_notes" />

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
    <p class="text-[11px] text-slate-400">
      {{ SEARCH_TRIGGER_MODE_DESC[searchTriggerMode] }}
    </p>
  </section>
</template>
