<script setup lang="ts">
import { ref, computed } from 'vue';
import { EXPORT_GROUPS, STORAGE_KEY_LABEL, exportData, downloadExportFile } from '@shared/import-export';

const allKeys = EXPORT_GROUPS.flatMap(g => g.keys);

const selectedKeys = ref<string[]>([]);
const expandedGroupIds = ref<string[]>([]);
const isExporting = ref(false);
const exportError = ref<string | null>(null);

const isAllSelected = computed({
  get: () => selectedKeys.value.length === allKeys.length,
  set: (v) => {
    selectedKeys.value = v ? [...allKeys] : [];
  }
});

const isAllIndeterminate = computed(() => {
  const len = selectedKeys.value.length;
  return len > 0 && len < allKeys.length;
});

function isGroupAllSelected(group: typeof EXPORT_GROUPS[number]): boolean {
  return group.keys.every(k => selectedKeys.value.includes(k));
}

function isGroupIndeterminate(group: typeof EXPORT_GROUPS[number]): boolean {
  const count = group.keys.filter(k => selectedKeys.value.includes(k)).length;
  return count > 0 && count < group.keys.length;
}

function groupSelectedCount(group: typeof EXPORT_GROUPS[number]): number {
  return group.keys.filter(k => selectedKeys.value.includes(k)).length;
}

function toggleGroup(group: typeof EXPORT_GROUPS[number]) {
  if (isGroupAllSelected(group)) {
    selectedKeys.value = selectedKeys.value.filter(k => !group.keys.includes(k));
  } else {
    const toAdd = group.keys.filter(k => !selectedKeys.value.includes(k));
    selectedKeys.value.push(...toAdd);
  }
}

function toggleKey(key: string) {
  const idx = selectedKeys.value.indexOf(key);
  if (idx >= 0) {
    selectedKeys.value.splice(idx, 1);
  } else {
    selectedKeys.value.push(key);
  }
}

function toggleExpand(groupId: string) {
  const idx = expandedGroupIds.value.indexOf(groupId);
  if (idx >= 0) {
    expandedGroupIds.value.splice(idx, 1);
  } else {
    expandedGroupIds.value.push(groupId);
  }
}

function keyLabel(key: string): string {
  return STORAGE_KEY_LABEL[key] || key;
}

const canExport = computed(() => selectedKeys.value.length > 0 && !isExporting.value);

async function handleExport() {
  if (selectedKeys.value.length === 0) return;

  isExporting.value = true;
  exportError.value = null;

  try {
    const data = await exportData(selectedKeys.value);
    downloadExportFile(data, 'xhs-crawler-config');
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : '导出失败，请重试';
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 全选 -->
    <div class="flex items-center gap-2">
      <input
        id="select-all"
        type="checkbox"
        class="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
        :checked="isAllSelected"
        :indeterminate="isAllIndeterminate"
        @change="(e: any) => isAllSelected = e.target.checked"
      />
      <label for="select-all" class="text-sm font-medium text-slate-700 cursor-pointer">
        全选 ({{ selectedKeys.length }}/{{ allKeys.length }})
      </label>
    </div>

    <!-- 分组列表 -->
    <div class="space-y-2">
      <div
        v-for="group in EXPORT_GROUPS"
        :key="group.id"
        class="rounded-md border border-slate-200 bg-white overflow-hidden transition-colors"
        :class="isGroupAllSelected(group) ? 'border-brand/40' : isGroupIndeterminate(group) ? 'border-brand/20' : 'hover:border-brand/30'"
      >
        <!-- 分组头 -->
        <div class="flex items-start gap-3 p-3 cursor-pointer" @click="toggleGroup(group)">
          <input
            type="checkbox"
            class="w-4 h-4 mt-0.5 text-brand border-gray-300 rounded focus:ring-brand"
            :checked="isGroupAllSelected(group)"
            :indeterminate="isGroupIndeterminate(group)"
            @click.stop
            @change="toggleGroup(group)"
          />
          <div class="flex-1 min-w-0">
            <div class="font-medium text-slate-700 text-sm">{{ group.label }}</div>
            <div class="text-xs text-slate-500 mt-0.5">{{ group.description }}</div>
          </div>
          <!-- 展开/收起按钮 -->
          <button
            type="button"
            class="shrink-0 flex items-center gap-1 text-xs text-slate-400 hover:text-brand transition-colors px-1.5 py-0.5 rounded hover:bg-slate-50"
            :title="expandedGroupIds.includes(group.id) ? '收起' : '展开详情'"
            @click.stop="toggleExpand(group.id)"
          >
            <span>{{ groupSelectedCount(group) }}/{{ group.keys.length }}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="transition-transform duration-200"
              :class="expandedGroupIds.includes(group.id) ? 'rotate-180' : ''"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>

        <!-- 子项列表 -->
        <div
          v-if="expandedGroupIds.includes(group.id)"
          class="border-t border-slate-100 bg-slate-50/50 px-3 py-2 space-y-0.5"
        >
          <div
            v-for="key in group.keys"
            :key="key"
            class="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-white cursor-pointer transition-colors"
            @click="toggleKey(key)"
          >
            <input
              type="checkbox"
              class="w-3.5 h-3.5 text-brand border-gray-300 rounded focus:ring-brand"
              :checked="selectedKeys.includes(key)"
              @click.stop
              @change="toggleKey(key)"
            />
            <span class="text-xs text-slate-600">{{ keyLabel(key) }}</span>
            <span class="text-[10px] text-slate-300 font-mono">{{ key }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="exportError" class="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
      {{ exportError }}
    </div>

    <!-- 导出按钮 -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        :disabled="!canExport"
        class="flex-1 px-4 py-2 rounded-md bg-brand text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand/90 transition-colors"
        @click="handleExport"
      >
        <span v-if="isExporting">导出中…</span>
        <span v-else>导出配置 ({{ selectedKeys.length }} 项)</span>
      </button>
    </div>
  </div>
</template>
