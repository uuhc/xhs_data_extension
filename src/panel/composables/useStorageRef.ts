import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue';
import { storage, onLocalStorageChange } from '@shared/storage';

/**
 * 双向绑定 chrome.storage.local 的轻量 ref：
 *  - 组件挂载时读初值
 *  - 监听 storage.onChanged 实时同步
 *  - 写入 ref 时自动 storage.set
 *
 * 适合**简单标量 / 单一所有权**的字段（apiHost、autoTaskRunning 等）。
 *
 * ⚠️ 不适合需要「先读最新值再追加」的复合数据（账号列表、关键词列表等），
 *     因为 ref.value 不一定反映 storage 最新值（mount race / 多组件并发）。
 *     这种场景请改用专门的 service（参考 services/accountStore.ts 的事务式写法）。
 */
export function useStorageRef<T>(
  key: string,
  defaultValue: T,
  options?: { writeOnSet?: boolean; transform?: (raw: any) => T },
): Ref<T> {
  const cloneDefault = (): T => {
    try {
      return structuredClone(defaultValue);
    } catch {
      return JSON.parse(JSON.stringify(defaultValue));
    }
  };

  const data = ref(cloneDefault()) as Ref<T>;

  const transform =
    options?.transform ??
    ((v: any): T => {
      if (v == null) return cloneDefault();
      if (Array.isArray(defaultValue) && !Array.isArray(v)) return cloneDefault();
      if (
        !Array.isArray(defaultValue) &&
        defaultValue !== null &&
        typeof defaultValue === 'object' &&
        (typeof v !== 'object' || Array.isArray(v))
      ) {
        return cloneDefault();
      }
      return v as T;
    });

  let loaded = false;
  // 记录「当前已知的最新序列化值」。用来在 onChanged ↔ watch 之间打破回响循环：
  // - 外部写入：onChanged 发现新值 ≠ lastSerialized → 更新 ref 并同步 lastSerialized；
  //   watch 被触发时发现 ser(v) === lastSerialized，直接跳过（不再回写 storage）。
  // - 自己写入：watch 发现新值 ≠ lastSerialized → 更新 lastSerialized 并写 storage；
  //   onChanged 收到回响时 ser(v) === lastSerialized，直接跳过（不再触发 ref）。
  // 这比基于「值集合」的 Set 去重更稳健：不会因为「外部恰好写入与自己刚写相同的值」而互相吞掉。
  let lastSerialized = '';
  const ser = (v: any) => {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  async function load() {
    const raw = await storage.getOne(key);
    const fromStorage = transform(raw);
    lastSerialized = ser(fromStorage);
    data.value = fromStorage;
    loaded = true;
  }

  function onChanged(change: chrome.storage.StorageChange) {
    if (!loaded) return;
    const v = transform(change.newValue);
    const s = ser(v);
    if (s === lastSerialized) return;
    lastSerialized = s;
    data.value = v;
  }

  let unsubscribe: (() => void) | null = null;
  onMounted(() => {
    load();
    unsubscribe = onLocalStorageChange(key, onChanged);
  });
  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

  if (options?.writeOnSet !== false) {
    watch(
      data,
      (v) => {
        if (!loaded) return;
        const s = ser(v);
        if (s === lastSerialized) return;
        lastSerialized = s;
        storage.setOne(key, v);
      },
      { deep: true },
    );
  }

  return data;
}
