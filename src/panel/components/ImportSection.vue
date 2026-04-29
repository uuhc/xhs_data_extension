<script setup lang="ts">
import { ref, computed } from 'vue';
import { validateImportFile, importData, STORAGE_KEY_LABEL, type ImportPreview } from '@shared/import-export';

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const preview = ref<ImportPreview | null>(null);
const importError = ref<string | null>(null);
const importSuccess = ref<string | null>(null);
const isImporting = ref(false);
const selectedGroupIds = ref<string[]>([]);

const hasFile = computed(() => selectedFile.value !== null);
const hasPreview = computed(() => preview.value !== null);
const canImport = computed(() => hasPreview.value && selectedGroupIds.value.length > 0 && !isImporting.value);

const overwriteCount = computed(() => {
  if (!preview.value) return 0;
  const groupSet = new Set(selectedGroupIds.value);
  return preview.value.actions.filter(a => {
    const group = preview.value!.groups.find(g =>
      g.keys.includes(a.key)
    );
    return group && groupSet.has(group.id) && a.action === 'overwrite';
  }).length;
});

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;

  selectedFile.value = files[0];
  preview.value = null;
  importError.value = null;
  importSuccess.value = null;
  selectedGroupIds.value = [];

  validateImport();
}

async function validateImport() {
  if (!selectedFile.value) return;

  const result = await validateImportFile(selectedFile.value);

  if ('error' in result) {
    importError.value = result.error;
    preview.value = null;
  } else {
    preview.value = result;
    importError.value = null;
    selectedGroupIds.value = result.groups.map(g => g.id);
  }
}

function triggerFileSelect() {
  fileInput.value?.click();
}

function clearFile() {
  selectedFile.value = null;
  preview.value = null;
  importError.value = null;
  importSuccess.value = null;
  selectedGroupIds.value = [];
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function toggleGroupSelection(groupId: string) {
  const idx = selectedGroupIds.value.indexOf(groupId);
  if (idx >= 0) {
    selectedGroupIds.value.splice(idx, 1);
  } else {
    selectedGroupIds.value.push(groupId);
  }
}

async function handleImport() {
  if (!selectedFile.value || !preview.value) return;

  isImporting.value = true;
  importError.value = null;
  importSuccess.value = null;

  try {
    const result = await importData(selectedFile.value, selectedGroupIds.value);
    if (result.ok) {
      importSuccess.value = result.count > 0
        ? `导入成功，共写入 ${result.count} 项配置`
        : '导入完成，无需更新的配置项';
      preview.value = null;
      selectedFile.value = null;
      selectedGroupIds.value = [];
      if (fileInput.value) {
        fileInput.value.value = '';
      }
    } else {
      importError.value = '导入失败，请重试';
    }
  } catch (e) {
    importError.value = e instanceof Error ? e.message : '导入失败，请重试';
  } finally {
    isImporting.value = false;
  }
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'boolean') return val ? '是' : '否';
  if (typeof val === 'string') return val.length > 50 ? val.slice(0, 50) + '…' : val;
  if (Array.isArray(val)) return `数组 (${val.length} 项)`;
  if (typeof val === 'object') return `对象 (${Object.keys(val!).length} 个字段)`;
  return String(val);
}

function getActionLabel(action: ImportPreview['actions'][number]['action']): string {
  switch (action) {
    case 'overwrite': return '覆盖';
    case 'create': return '新增';
    case 'skip': return '跳过';
  }
}

function getActionClass(action: ImportPreview['actions'][number]['action']): string {
  switch (action) {
    case 'overwrite': return 'text-amber-600';
    case 'create': return 'text-green-600';
    case 'skip': return 'text-slate-500';
  }
}

function isGroupSelected(groupId: string): boolean {
  return selectedGroupIds.value.includes(groupId);
}

function actionsForGroup(groupId: string): ImportPreview['actions'] {
  if (!preview.value) return [];
  const group = preview.value.groups.find(g => g.id === groupId);
  if (!group) return [];
  const keySet = new Set(group.keys);
  return preview.value.actions.filter(a => keySet.has(a.key));
}
</script>

<template>
  <div class="space-y-4">
    <!-- 文件选择 -->
    <div>
      <input
        ref="fileInput"
        type="file"
        accept=".json"
        class="hidden"
        @change="handleFileSelect"
      />
      <div
        v-if="!hasFile && !importSuccess"
        class="border-2 border-dashed border-slate-300 rounded-md p-6 text-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors"
        @click="triggerFileSelect"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"
          class="mx-auto mb-2 text-slate-400" aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p class="text-sm text-slate-600">点击选择 JSON 配置文件</p>
        <p class="text-xs text-slate-400 mt-1">支持从此插件导出的配置文件</p>
      </div>

      <div v-else-if="hasFile" class="flex items-center gap-2 p-3 rounded-md border border-slate-200 bg-white">
        <svg
          xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"
          class="text-brand shrink-0" aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="flex-1 min-w-0 text-sm text-slate-700 truncate">
          {{ selectedFile!.name }}
        </span>
        <span class="text-xs text-slate-400">
          {{ (selectedFile!.size / 1024).toFixed(1) }} KB
        </span>
        <button
          type="button"
          class="p-1 text-slate-400 hover:text-red-600 transition-colors"
          title="清除文件"
          @click="clearFile"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 成功提示 -->
    <div v-if="importSuccess" class="p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm flex items-center justify-between">
      <div class="flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"
          class="shrink-0" aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>{{ importSuccess }}</span>
      </div>
      <button
        type="button"
        class="text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-100"
        @click="importSuccess = null"
      >继续导入</button>
    </div>

    <!-- 错误提示 -->
    <div v-if="importError" class="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
      {{ importError }}
    </div>

    <!-- 预览 -->
    <div v-if="hasPreview && preview" class="space-y-3">
      <!-- 文件信息 -->
      <div class="p-3 rounded-md bg-slate-50 border border-slate-200">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-slate-500">导出时间:</span>
          <span class="font-medium text-slate-700">
            {{ new Date(preview.exportedAt).toLocaleString('zh-CN') }}
          </span>
        </div>
        <div class="flex items-center gap-2 text-sm mt-1">
          <span class="text-slate-500">版本:</span>
          <span class="font-medium text-slate-700">{{ preview.version }}</span>
        </div>
      </div>

      <!-- 选择要导入的分组 -->
      <div class="space-y-2">
        <div class="text-xs font-medium text-slate-500 uppercase tracking-wide">选择要导入的分组</div>
        <div class="space-y-1.5">
          <div
            v-for="group in preview.groups"
            :key="group.id"
            class="rounded-md border bg-white overflow-hidden transition-colors"
            :class="isGroupSelected(group.id) ? 'border-brand/40' : 'border-slate-200'"
          >
            <div
              class="flex items-center gap-3 px-3 py-2 cursor-pointer"
              @click="toggleGroupSelection(group.id)"
            >
              <input
                type="checkbox"
                class="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
                :checked="isGroupSelected(group.id)"
                @click.stop
                @change="toggleGroupSelection(group.id)"
              />
              <div class="flex-1 min-w-0">
                <div class="font-medium text-slate-700 text-sm">{{ group.label }}</div>
                <div class="text-xs text-slate-500">{{ group.description }}</div>
              </div>
              <div class="text-xs text-slate-400">{{ actionsForGroup(group.id).length }} 项</div>
            </div>

            <!-- 该分组的操作明细 -->
            <div
              v-if="isGroupSelected(group.id) && actionsForGroup(group.id).length > 0"
              class="border-t border-slate-100 bg-slate-50/50 px-3 py-2 space-y-0.5"
            >
              <div
                v-for="action in actionsForGroup(group.id)"
                :key="action.key"
                class="flex items-center gap-2 py-1 text-xs"
              >
                <span :class="getActionClass(action.action)" class="shrink-0 font-medium w-7">
                  {{ getActionLabel(action.action) }}
                </span>
                <span class="text-slate-600 shrink-0" :title="action.key">{{ STORAGE_KEY_LABEL[action.key] || action.key }}</span>
                <span class="flex-1"></span>
                <span v-if="action.action === 'create'" class="text-slate-400 truncate max-w-[120px]">
                  {{ formatValue(action.newValue) }}
                </span>
                <template v-if="action.action === 'overwrite'">
                  <span class="text-slate-400 truncate max-w-[80px]" :title="String(action.currentValue)">
                    {{ formatValue(action.currentValue) }}
                  </span>
                  <span class="text-slate-300">→</span>
                  <span class="text-slate-600 truncate max-w-[80px]" :title="String(action.newValue)">
                    {{ formatValue(action.newValue) }}
                  </span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 覆盖提醒 -->
      <div
        v-if="overwriteCount > 0"
        class="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs flex items-start gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"
          class="shrink-0 mt-0.5" aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>将覆盖 {{ overwriteCount }} 项现有配置，导入后无法撤销</span>
      </div>
    </div>

    <!-- 导入按钮 -->
    <div v-if="hasPreview" class="flex items-center gap-2">
      <button
        type="button"
        :disabled="!canImport"
        class="flex-1 px-4 py-2 rounded-md bg-brand text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand/90 transition-colors"
        @click="handleImport"
      >
        <span v-if="isImporting">导入中…</span>
        <span v-else>确认导入 ({{ selectedGroupIds.length }} 个分组)</span>
      </button>
    </div>
  </div>
</template>
