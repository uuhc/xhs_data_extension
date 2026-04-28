// chrome.storage.local 的轻量 Promise 化封装

export const storage = {
  get<T = any>(keys: string | string[] | Record<string, any>): Promise<Record<string, T>> {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys as any, (items) => resolve(items as Record<string, T>));
    });
  },
  set(items: Record<string, any>): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set(items, () => resolve());
    });
  },
  remove(keys: string | string[]): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => resolve());
    });
  },
  async getOne<T = any>(key: string): Promise<T | undefined> {
    const obj = await storage.get<T>([key]);
    return obj[key];
  },
  async setOne(key: string, value: any): Promise<void> {
    await storage.set({ [key]: value });
  },
};

// ---------- storage.onChanged 集中分发 ----------
// 问题背景：之前每个 useStorageRef 都会注册一个 chrome.storage.onChanged 监听器，
// 同一 key 可能有多个监听；在面板里 Vue 组件很多时，每次写入都要遍历所有监听回调，
// 且跨进程调度时也有额外开销。
// 这里集中成单个 chrome 级监听器 + 按 key 分发，使用方只需注册/注销一个小回调即可。
type LocalChangeCallback = (change: chrome.storage.StorageChange) => void;
const localListeners = new Map<string, Set<LocalChangeCallback>>();
let centralRegistered = false;

function ensureCentralListener(): void {
  if (centralRegistered) return;
  centralRegistered = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key in changes) {
      const set = localListeners.get(key);
      if (!set || set.size === 0) continue;
      const change = changes[key];
      // 拷贝一份回调，避免回调中 off 时修改 set 引发遍历问题
      const snapshot = Array.from(set);
      for (const cb of snapshot) {
        try {
          cb(change);
        } catch {}
      }
    }
  });
}

/**
 * 订阅 chrome.storage.local 指定 key 的变更。
 * 返回值：取消订阅函数。
 *
 * 所有订阅共用同一个底层 chrome.storage.onChanged 监听，单次写入只会唤醒真正关心的 key。
 */
export function onLocalStorageChange(key: string, cb: LocalChangeCallback): () => void {
  ensureCentralListener();
  let set = localListeners.get(key);
  if (!set) {
    set = new Set();
    localListeners.set(key, set);
  }
  set.add(cb);
  return () => {
    const s = localListeners.get(key);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) localListeners.delete(key);
  };
}
