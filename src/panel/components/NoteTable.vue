<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStorageRef } from '../composables/useStorageRef';
import { STORAGE_KEYS } from '@shared/constants';
import { sessionStore } from '@shared/storage';
import { normalizePublishTime } from '@shared/time';
import type { SearchNotesResponse, SearchNoteItem } from '@/types/xhs';

const pages = useStorageRef<SearchNotesResponse[]>(STORAGE_KEYS.searchNotesPages, [], { area: 'session' });

const PAGE_SIZE = 20;
const currentPage = ref(1);

interface Row {
  pageNum: number;
  index: number;
  title: string;
  author: string;
  liked: string;
  collected: string;
  comment: string;
  shared: string;
  publishTime: string;
  url: string;
}

function getPublishTime(tags: any[] | undefined): string {
  if (!Array.isArray(tags)) return '';
  for (const t of tags) if (t?.type === 'publish_time') return normalizePublishTime(t.text || '');
  return '';
}

const rows = computed<Row[]>(() => {
  const list: Row[] = [];
  let counter = 0;
  pages.value.forEach((page) => {
    const pageNum = page._pageNum || 1;
    const items: SearchNoteItem[] = page.data?.items || [];
    items.forEach((item) => {
      if (item.model_type !== 'note') return;
      counter++;
      const card = item.note_card || {};
      const interact = card.interact_info || {};
      const noteId = item.id || '';
      const xsec = item.xsec_token || '';
      const url = noteId
        ? `https://www.xiaohongshu.com/explore/${noteId}${xsec ? `?xsec_token=${xsec}&xsec_source=pc_search&source=unknown` : ''}`
        : '';
      list.push({
        pageNum,
        index: counter,
        title: card.display_title || '',
        author: card.user?.nickname || card.user?.nick_name || '',
        liked: String(interact.liked_count ?? '0'),
        collected: String(interact.collected_count ?? '0'),
        comment: String(interact.comment_count ?? '0'),
        shared: String(interact.shared_count ?? '0'),
        publishTime: getPublishTime(card.corner_tag_info),
        url,
      });
    });
  });
  return list;
});

const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE)));
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return rows.value.slice(start, start + PAGE_SIZE);
});

function prevPage() {
  if (currentPage.value > 1) currentPage.value--;
}
function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++;
}

async function clearTable() {
  currentPage.value = 1;
  await sessionStore.remove([STORAGE_KEYS.searchNotesPages, STORAGE_KEYS.searchNotesResult]);
}
</script>

<template>
  <section class="panel-card">
    <div class="flex items-center gap-2">
      <button @click="clearTable" class="btn-secondary">清空表格数据</button>
      <span v-if="rows.length" class="text-xs text-slate-500 ml-auto">共 {{ rows.length }} 条</span>
    </div>
    <div v-if="rows.length" class="mt-3 overflow-auto border border-slate-200 rounded-md">
      <table class="w-full border-collapse text-xs">
        <thead class="sticky top-0 bg-slate-100">
          <tr>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">页码</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">#</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">标题</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">作者</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">点赞</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">收藏</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">评论</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">分享</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">发布时间</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">链接</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in pagedRows" :key="r.index" class="hover:bg-slate-50">
            <td class="px-2 py-1.5 border-b border-slate-100">{{ r.pageNum }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100">{{ r.index }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100 max-w-[180px] truncate" :title="r.title">{{ r.title }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100 max-w-[80px] truncate">{{ r.author }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100">{{ r.liked }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100">{{ r.collected }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100">{{ r.comment }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100">{{ r.shared }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100 whitespace-nowrap">{{ r.publishTime }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100">
              <a v-if="r.url" :href="r.url" target="_blank" class="text-brand hover:underline">打开</a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-3 mt-2 text-xs">
      <button @click="prevPage" :disabled="currentPage <= 1" class="btn-secondary px-2 py-0.5 disabled:opacity-40">上一页</button>
      <span class="text-slate-500">{{ currentPage }} / {{ totalPages }}</span>
      <button @click="nextPage" :disabled="currentPage >= totalPages" class="btn-secondary px-2 py-0.5 disabled:opacity-40">下一页</button>
    </div>
  </section>
</template>
