// chrome.storage 的轻量 Promise 化封装

function makeStorageApi(backend: chrome.storage.StorageArea) {
  const api = {
    get<T = any>(keys: string | string[] | Record<string, any>): Promise<Record<string, T>> {
      return new Promise((resolve) => {
        backend.get(keys as any, (items) => resolve(items as Record<string, T>));
      });
    },
    set(items: Record<string, any>): Promise<void> {
      return new Promise((resolve) => {
        backend.set(items, () => resolve());
      });
    },
    remove(keys: string | string[]): Promise<void> {
      return new Promise((resolve) => {
        backend.remove(keys, () => resolve());
      });
    },
    async getOne<T = any>(key: string): Promise<T | undefined> {
      const obj = await api.get<T>([key]);
      return obj[key];
    },
    async setOne(key: string, value: any): Promise<void> {
      await api.set({ [key]: value });
    },
  };
  return api;
}

/** 持久存储（用户配置 / 统计数据等） */
export const storage = makeStorageApi(chrome.storage.local);

/** 会话级存储（采集中间结果等瞬态数据，浏览器关闭自动清空） */
export const sessionStore = makeStorageApi(chrome.storage.session);

// ---------- storage.onChanged 集中分发 ----------
// 单个 chrome.storage.onChanged 监听器同时处理 local 和 session 两个 area，
// 按 area + key 分发到对应的回调集合。
type StorageChangeCallback = (change: chrome.storage.StorageChange) => void;
type StorageArea = 'local' | 'session';
const changeListeners = new Map<string, Set<StorageChangeCallback>>();
let centralRegistered = false;

function listenerKey(area: StorageArea, key: string): string {
  return `${area}:${key}`;
}

function ensureCentralListener(): void {
  if (centralRegistered) return;
  centralRegistered = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' && area !== 'session') return;
    for (const key in changes) {
      const lk = listenerKey(area as StorageArea, key);
      const set = changeListeners.get(lk);
      if (!set || set.size === 0) continue;
      const change = changes[key];
      const snapshot = Array.from(set);
      for (const cb of snapshot) {
        try {
          cb(change);
        } catch {}
      }
    }
  });
}

function onStorageChange(area: StorageArea, key: string, cb: StorageChangeCallback): () => void {
  ensureCentralListener();
  const lk = listenerKey(area, key);
  let set = changeListeners.get(lk);
  if (!set) {
    set = new Set();
    changeListeners.set(lk, set);
  }
  set.add(cb);
  return () => {
    const s = changeListeners.get(lk);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) changeListeners.delete(lk);
  };
}

/** 订阅 chrome.storage.local 指定 key 的变更 */
export function onLocalStorageChange(key: string, cb: StorageChangeCallback): () => void {
  return onStorageChange('local', key, cb);
}

/** 订阅 chrome.storage.session 指定 key 的变更 */
export function onSessionStorageChange(key: string, cb: StorageChangeCallback): () => void {
  return onStorageChange('session', key, cb);
}
