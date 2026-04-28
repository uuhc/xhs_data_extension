<script setup lang="ts">
import { computed } from 'vue';
import { useStorageRef } from '../composables/useStorageRef';
import { STORAGE_KEYS } from '@shared/constants';
import { storage } from '@shared/storage';
import type { SearchNotesResponse } from '@/types/xhs';

const pages = useStorageRef<SearchNotesResponse[]>(STORAGE_KEYS.creatorListPages, []);

interface Row {
  pageNum: number;
  index: number;
  isUser: boolean;
  avatar: string;
  nickname: string;
  desc: string;
  fans: string;
  liked: string;
  url: string;
}

function getList(page: any): any[] {
  if (!page?.data) return [];
  if (Array.isArray(page.data.notes)) return page.data.notes;
  if (Array.isArray(page.data.users)) return page.data.users;
  if (Array.isArray(page.data.items)) return page.data.items;
  return [];
}

const rows = computed<Row[]>(() => {
  const list: Row[] = [];
  let counter = 0;
  pages.value.forEach((page) => {
    const pageNum = page._pageNum || 1;
    const items = getList(page);
    items.forEach((item: any) => {
      counter++;
      const card = item.note_card || item.noteCard || {};
      const user = item.user || card.user || item;
      const isUser = !item.note_id && !item.id?.length;
      const interact = card.interact_info || card.interactInfo || {};
      const noteId = item.note_id || item.id || card.note_id || card.noteId;
      const xsec = item.xsec_token || card.xsec_token || card.xsecToken;
      const url = noteId
        ? `https://www.xiaohongshu.com/explore/${noteId}${xsec ? `?xsec_token=${xsec}` : ''}`
        : '';
      list.push({
        pageNum,
        index: counter,
        isUser,
        avatar: user?.avatar || '',
        nickname: user?.nickname || user?.nick_name || user?.nickName || item.display_title || card.display_title || '',
        desc: user?.desc || card.display_title || '',
        fans: String(user?.fans || ''),
        liked: String(interact.liked_count ?? interact.likedCount ?? ''),
        url,
      });
    });
  });
  return list;
});

async function clearTable() {
  await storage.remove([STORAGE_KEYS.creatorListPages, STORAGE_KEYS.creatorListResult]);
}
</script>

<template>
  <section class="panel-card">
    <button @click="clearTable" class="btn-secondary">清空达人数据</button>
    <div v-if="rows.length" class="mt-3 overflow-auto border border-slate-200 rounded-md">
      <table class="w-full border-collapse text-xs">
        <thead class="sticky top-0 bg-slate-100">
          <tr>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">页码</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">#</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">头像</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">昵称/标题</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">点赞</th>
            <th class="px-2 py-1.5 text-left font-semibold border-b border-slate-200">链接</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.index" class="hover:bg-slate-50">
            <td class="px-2 py-1.5 border-b border-slate-100">{{ r.pageNum }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100">{{ r.index }}</td>
            <td class="px-1 py-1 border-b border-slate-100 w-10">
              <img v-if="r.avatar" :src="r.avatar" class="w-8 h-8 rounded-full object-cover" />
            </td>
            <td class="px-2 py-1.5 border-b border-slate-100 max-w-[180px] truncate" :title="r.nickname">{{ r.nickname }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100">{{ r.liked }}</td>
            <td class="px-2 py-1.5 border-b border-slate-100">
              <a v-if="r.url" :href="r.url" target="_blank" class="text-brand hover:underline">打开</a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
