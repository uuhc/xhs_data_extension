<script setup lang="ts">
import { ref } from 'vue';
import ExportSection from './ExportSection.vue';
import ImportSection from './ImportSection.vue';

const emit = defineEmits<{
  close: [];
}>();

const activeTab = ref<'export' | 'import'>('export');

function setActiveTab(tab: 'export' | 'import') {
  activeTab.value = tab;
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click.self="handleClose"
  >
    <div
      class="w-full max-w-lg bg-white rounded-lg shadow-xl overflow-hidden"
      @click.stop
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 class="text-base font-semibold text-slate-800">配置导入导出</h2>
        <button
          type="button"
          class="p-1 text-slate-400 hover:text-slate-600 transition-colors"
          title="关闭"
          @click="handleClose"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Tab 切换 -->
      <div class="flex border-b border-slate-200">
        <button
          type="button"
          class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors border-b-2"
          :class="activeTab === 'export'
            ? 'text-brand border-brand'
            : 'text-slate-600 border-transparent hover:text-slate-800 hover:bg-slate-50'"
          @click="setActiveTab('export')"
        >
          导出配置
        </button>
        <button
          type="button"
          class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors border-b-2"
          :class="activeTab === 'import'
            ? 'text-brand border-brand'
            : 'text-slate-600 border-transparent hover:text-slate-800 hover:bg-slate-50'"
          @click="setActiveTab('import')"
        >
          导入配置
        </button>
      </div>

      <!-- 内容区 -->
      <div class="p-4 max-h-[70vh] overflow-y-auto">
        <ExportSection v-if="activeTab === 'export'" />
        <ImportSection v-else />
      </div>
    </div>
  </div>
</template>
