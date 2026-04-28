/**
 * 将接口返回的关键词合并进侧栏列表（与 panel keywordStore.refreshFromApi 行为一致，供 background 调用）
 */
import { STORAGE_KEYS } from './constants';
import { storage } from './storage';
import type { KeywordTaskInfo } from '@/types/xhs';

const KEY_LIST = STORAGE_KEYS.pluginSearchKeywords;
const KEY_INFO = STORAGE_KEYS.pluginKeywordTaskInfos;

function normalizeList(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
}

function normalizeInfoMap(raw: any): Record<string, KeywordTaskInfo> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, KeywordTaskInfo> = {};
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (v && typeof v === 'object') out[k] = v as KeywordTaskInfo;
  }
  return out;
}

export async function mergeKeywordTaskResultIntoStorage(apiResult: {
  keywords: string[];
  taskInfos: KeywordTaskInfo[];
}): Promise<{ total: number; added: number; duplicated: number }> {
  const apiKws: string[] = Array.isArray(apiResult?.keywords) ? apiResult.keywords : [];
  const apiInfos: KeywordTaskInfo[] = Array.isArray(apiResult?.taskInfos)
    ? apiResult.taskInfos
    : [];

  if (!apiKws.length) {
    return { total: 0, added: 0, duplicated: 0 };
  }

  const [curList, curInfo] = await Promise.all([
    normalizeList(await storage.getOne<any>(KEY_LIST)),
    normalizeInfoMap(await storage.getOne<any>(KEY_INFO)),
  ]);

  const exist = new Set<string>(curList);
  const added: string[] = [];
  let duplicated = 0;
  const newInfo: Record<string, KeywordTaskInfo> = { ...curInfo };

  for (let idx = 0; idx < apiKws.length; idx++) {
    const k = apiKws[idx];
    if (!k || typeof k !== 'string') continue;
    const info = apiInfos[idx];
    if (info && typeof info === 'object') newInfo[k] = info;
    if (exist.has(k)) {
      duplicated++;
    } else {
      added.push(k);
      exist.add(k);
    }
  }

  if (added.length) {
    await storage.setOne(KEY_LIST, [...curList, ...added]);
  }
  await storage.setOne(KEY_INFO, newInfo);

  return { total: apiKws.length, added: added.length, duplicated };
}
