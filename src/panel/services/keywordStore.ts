/**
 * 关键词 store（单例）—— 仿照 accountStore 的事务式写法
 *
 * 设计原则：
 *   - 所有写操作都是「读最新 storage → 改 → 写回 storage」的事务，
 *     不依赖 ref.value 是否「已加载完成」（避免 mount race）。
 *   - 监听 chrome.storage.onChanged 跨组件 / 跨 panel 实例自动同步 UI。
 *   - 命令式 API：addKeywords / removeAt / clearAll / refreshFromApi
 *   - 响应式只读视图：list / taskInfoMap / lastFetchedAt
 */
import { ref, type Ref } from 'vue';
import { storage } from '@shared/storage';
import { STORAGE_KEYS } from '@shared/constants';
import { fetchKeywordTask } from '@shared/api';
import { mergeKeywordTaskResultIntoStorage } from '@shared/pluginKeywordsMerge';
import type { KeywordTaskInfo } from '@/types/xhs';

const KEY_LIST = STORAGE_KEYS.pluginSearchKeywords;
const KEY_INFO = STORAGE_KEYS.pluginKeywordTaskInfos;

const _list = ref<string[]>([]);
const _infoMap = ref<Record<string, KeywordTaskInfo>>({});
const _lastFetchedAt = ref<number | null>(null);
let _initialized = false;
let _initPromise: Promise<void> | null = null;

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

async function readListFromStorage(): Promise<string[]> {
  return normalizeList(await storage.getOne<any>(KEY_LIST));
}

async function readInfoFromStorage(): Promise<Record<string, KeywordTaskInfo>> {
  return normalizeInfoMap(await storage.getOne<any>(KEY_INFO));
}

async function writeList(list: string[]): Promise<void> {
  await storage.setOne(KEY_LIST, list);
  _list.value = list;
}

async function writeInfo(map: Record<string, KeywordTaskInfo>): Promise<void> {
  await storage.setOne(KEY_INFO, map);
  _infoMap.value = map;
}

function ensureInit(): Promise<void> {
  if (_initialized) return Promise.resolve();
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const [list, info] = await Promise.all([readListFromStorage(), readInfoFromStorage()]);
    _list.value = list;
    _infoMap.value = info;
    _initialized = true;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (KEY_LIST in changes) {
        const next = normalizeList(changes[KEY_LIST].newValue);
        if (JSON.stringify(next) !== JSON.stringify(_list.value)) {
          _list.value = next;
        }
      }
      if (KEY_INFO in changes) {
        const next = normalizeInfoMap(changes[KEY_INFO].newValue);
        if (JSON.stringify(next) !== JSON.stringify(_infoMap.value)) {
          _infoMap.value = next;
        }
      }
    });
  })();

  return _initPromise;
}

export interface FetchResult {
  total: number;
  added: number;
  duplicated: number;
}

export const keywordStore = {
  list: _list as Readonly<Ref<string[]>>,
  infoMap: _infoMap as Readonly<Ref<Record<string, KeywordTaskInfo>>>,
  lastFetchedAt: _lastFetchedAt as Readonly<Ref<number | null>>,

  init: ensureInit,

  /** 添加单个手动输入的关键词 */
  async add(kw: string): Promise<{ added: boolean; duplicated: boolean }> {
    await ensureInit();
    const v = (kw || '').trim();
    if (!v) return { added: false, duplicated: false };
    const cur = await readListFromStorage();
    if (cur.includes(v)) return { added: false, duplicated: true };
    await writeList([...cur, v]);
    return { added: true, duplicated: false };
  },

  /** 按下标删除，并清掉对应的元数据 */
  async removeAt(idx: number): Promise<void> {
    await ensureInit();
    const cur = await readListFromStorage();
    if (idx < 0 || idx >= cur.length) return;
    const removed = cur[idx];
    const next = cur.slice();
    next.splice(idx, 1);
    await writeList(next);

    if (removed) {
      const info = await readInfoFromStorage();
      if (info[removed]) {
        const m = { ...info };
        delete m[removed];
        await writeInfo(m);
      }
    }
  },

  async clearAll(): Promise<void> {
    await ensureInit();
    await writeList([]);
    await writeInfo({});
  },

  /** 从接口拉取并合并（带去重 + 元数据落库） */
  async refreshFromApi(): Promise<FetchResult> {
    await ensureInit();
    let apiResult;
    try {
      apiResult = await fetchKeywordTask();
      storage
        .setOne(STORAGE_KEYS.apiLastProbe, { ok: true, at: Date.now() })
        .catch(() => {});
    } catch (err: any) {
      const msg = err?.message || String(err);
      storage
        .setOne(STORAGE_KEYS.apiLastProbe, { ok: false, at: Date.now(), error: msg })
        .catch(() => {});
      throw err;
    }
    const r = await mergeKeywordTaskResultIntoStorage(apiResult);
    const [list, info] = await Promise.all([readListFromStorage(), readInfoFromStorage()]);
    _list.value = list;
    _infoMap.value = info;
    if (r.total > 0) _lastFetchedAt.value = Date.now();
    return r;
  },
};
