import {
  ADD_SEARCH_RESULT_PATH,
  GET_KEYWORD_TASK_PATH,
  API_HOST_DEFAULT,
  API_HOST_PLACEHOLDER,
  KEYWORD_TASK_FETCH_RETRIES,
  KEYWORD_TASK_FETCH_RETRY_DELAY_MS,
  STORAGE_KEYS,
} from './constants';
import { fetchWithTimeout } from './fetch';
import { storage } from './storage';
import { getTraceId } from './time';
import type { KeywordTaskInfo, SearchNoteItem } from '@/types/xhs';

export async function getApiHost(): Promise<string> {
  const o = await storage.get([STORAGE_KEYS.apiHost]);
  const h = (o[STORAGE_KEYS.apiHost] || '').trim() || API_HOST_DEFAULT;
  return h.endsWith('/') ? h : h + '/';
}

export function isPlaceholderHost(host: string): boolean {
  const h = (host || '').replace(/\/+$/, '');
  return !h || h === API_HOST_PLACEHOLDER.replace(/\/+$/, '');
}

/**
 * 拉取关键词任务（GET，由 panel/background 各自直接调用；不经 background 中转也可，
 * 但保留可选「background 中转」以避免某些环境的 CORS）
 */
export async function fetchKeywordTask(): Promise<{
  keywords: string[];
  taskInfos: KeywordTaskInfo[];
}> {
  const host = await getApiHost();
  if (isPlaceholderHost(host)) {
    throw new Error('请先在侧栏配置并保存「接口根地址」');
  }
  const url = host + GET_KEYWORD_TASK_PATH + '?trace_id=20260303';
  const maxAttempts = 1 + KEYWORD_TASK_FETCH_RETRIES;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' });
      if (!res.ok) {
        const t = await res.text();
        throw new Error('HTTP ' + res.status + (t ? ' ' + t.slice(0, 80) : ''));
      }
      const data = await res.json();
      const parsed = parseKeywordTaskResponse(data);
      // eslint-disable-next-line no-console
      console.log('[fetchKeywordTask] attempt=', attempt, 'url=', url, 'raw=', data, 'parsed=', parsed);
      return parsed;
    } catch (e) {
      lastErr = e;
      if (attempt >= maxAttempts) break;
      await new Promise<void>((r) => setTimeout(r, KEYWORD_TASK_FETCH_RETRY_DELAY_MS));
    }
  }
  throw lastErr;
}

/** 从一个对象中尝试取出关键词字符串（兼容多种字段名/大小写） */
function extractKeywordFromObject(item: any): string {
  if (!item || typeof item !== 'object') return '';
  const candidates = [
    item.Keywords,
    item.keywords,
    item.keyword,
    item.Keyword,
    item.name,
    item.Name,
    item.word,
    item.kw,
    item.text,
    item.title,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim();
  }
  return '';
}

/** 把一个数组转为 { keywords, taskInfos }，元素可以是字符串或对象 */
function arrayToKeywords(list: any[]): { keywords: string[]; taskInfos: any[] } {
  const keywords: string[] = [];
  const taskInfos: any[] = [];
  for (const k of list) {
    if (typeof k === 'string') {
      const v = k.trim();
      if (v) {
        keywords.push(v);
        taskInfos.push({ Keywords: v });
      }
    } else if (k && typeof k === 'object') {
      const v = extractKeywordFromObject(k);
      if (v) {
        keywords.push(v);
        taskInfos.push(k);
      }
    }
  }
  return { keywords, taskInfos };
}

/** 递归在对象里寻找第一个看起来像「关键词列表」的数组 */
function findKeywordArray(node: any, depth = 0): any[] | null {
  if (depth > 4) return null;
  if (Array.isArray(node)) {
    if (!node.length) return null;
    const sample = node[0];
    if (typeof sample === 'string') return node;
    if (sample && typeof sample === 'object' && extractKeywordFromObject(sample)) return node;
    return null;
  }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const found = findKeywordArray(node[k], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function parseKeywordTaskResponse(
  data: any,
): { keywords: string[]; taskInfos: KeywordTaskInfo[] } {
  if (!data || typeof data !== 'object') return { keywords: [], taskInfos: [] };

  // 优先按常见路径尝试（保持原行为）
  const tryPaths: any[] = [
    data.result,
    data.data,
    data.data?.result,
    data.data?.list,
    data.data?.keywords,
    data.keywords,
    data.list,
    data.items,
  ];

  for (const node of tryPaths) {
    if (Array.isArray(node) && node.length) {
      const r = arrayToKeywords(node);
      if (r.keywords.length) return r as any;
    } else if (node && typeof node === 'object') {
      const v = extractKeywordFromObject(node);
      if (v) return { keywords: [v], taskInfos: [node] } as any;
    }
  }

  // 兜底：递归找一个看起来像关键词列表的数组
  const found = findKeywordArray(data);
  if (found) {
    const r = arrayToKeywords(found);
    if (r.keywords.length) return r as any;
  }

  return { keywords: [], taskInfos: [] };
}

/** 构造回传 URL（{apiHost}xhs_extension/add_xhs_app_search_result?trace_id=...） */
export async function buildCallbackUrl(): Promise<string> {
  const host = await getApiHost();
  return host + ADD_SEARCH_RESULT_PATH + '?trace_id=' + encodeURIComponent(getTraceId());
}

export function buildCallbackBody(
  taskInfo: KeywordTaskInfo,
  items: SearchNoteItem[],
  interceptedKeyword?: string,
): Record<string, any> {
  const body: Record<string, any> = { ...taskInfo };
  if (interceptedKeyword) {
    body.Keywords = interceptedKeyword;
    body.interceptedKeyword = interceptedKeyword;
  }
  body.items = items;
  return body;
}
