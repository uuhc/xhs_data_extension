/**
 * 账号 store（单例）
 *
 * 设计原则：
 *   - 写操作 = 「读最新 storage → 改 → 写回 storage」一气呵成的事务，
 *     永远不依赖内存里 ref.value 是否「已加载完成」。
 *   - 监听 chrome.storage.onChanged，跨组件 / 跨 panel 实例自动同步 UI。
 *   - 命令式 API：add / batchAdd / removeAt / updateField / setSelected
 *   - 响应式只读视图：list / selectedIdx
 */
import { ref, type Ref } from 'vue';
import { storage } from '@shared/storage';
import { STORAGE_KEYS } from '@shared/constants';
import type { AccountItem } from '@/types/xhs';

const KEY_LIST = STORAGE_KEYS.accountList;
const KEY_SELECTED = STORAGE_KEYS.selectedAccountIndex;

// ---------- 内部响应式状态（只暴露 readonly 风格的 ref 给 UI） ----------
const _list = ref<AccountItem[]>([]);
const _selectedIdx = ref<number>(0);
let _initialized = false;
let _initPromise: Promise<void> | null = null;

// ---------- 工具 ----------
function normalizeList(raw: any): AccountItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      phone: String(x.phone ?? '').trim(),
      codeUrl: String(x.codeUrl ?? '').trim(),
      maxCollectCount: Number.isFinite(+x.maxCollectCount) ? +x.maxCollectCount : 200,
    }));
}

function normalizeIdx(raw: any, listLen: number): number {
  const n = Number.isFinite(+raw) ? +raw : 0;
  if (listLen === 0) return 0;
  return Math.max(0, Math.min(n, listLen - 1));
}

async function readListFromStorage(): Promise<AccountItem[]> {
  const raw = await storage.getOne<AccountItem[]>(KEY_LIST);
  return normalizeList(raw);
}

async function writeListToStorage(list: AccountItem[]): Promise<void> {
  await storage.setOne(KEY_LIST, list);
  _list.value = list;
}

async function writeSelectedToStorage(idx: number): Promise<void> {
  await storage.setOne(KEY_SELECTED, idx);
  _selectedIdx.value = idx;
}

// ---------- 初始化（首次访问 store 时自动跑一次） ----------
function ensureInit(): Promise<void> {
  if (_initialized) return Promise.resolve();
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const [list, idxRaw] = await Promise.all([
      readListFromStorage(),
      storage.getOne<number>(KEY_SELECTED),
    ]);
    _list.value = list;
    _selectedIdx.value = normalizeIdx(idxRaw, list.length);
    _initialized = true;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (KEY_LIST in changes) {
        const next = normalizeList(changes[KEY_LIST].newValue);
        // 仅在真正不同时刷 ref，避免无谓的响应式触发
        if (JSON.stringify(next) !== JSON.stringify(_list.value)) {
          _list.value = next;
          // 列表变了，selectedIdx 可能越界，做一次校正
          const fixed = normalizeIdx(_selectedIdx.value, next.length);
          if (fixed !== _selectedIdx.value) _selectedIdx.value = fixed;
        }
      }
      if (KEY_SELECTED in changes) {
        const next = normalizeIdx(changes[KEY_SELECTED].newValue, _list.value.length);
        if (next !== _selectedIdx.value) _selectedIdx.value = next;
      }
    });
  })();

  return _initPromise;
}

// ---------- 解析批量文本 ----------
const SEP = /[\t,，|;；\s]+/;
export interface ParsedBatch {
  parsed: AccountItem[];
  invalidLines: number;
}
export function parseBatchText(text: string): ParsedBatch {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed: AccountItem[] = [];
  let invalidLines = 0;
  for (const line of lines) {
    const parts = line.split(SEP).filter(Boolean);
    const phone = (parts[0] || '').trim();
    if (!phone) {
      invalidLines++;
      continue;
    }
    const codeUrl = parts.slice(1).join(' ').trim();
    parsed.push({ phone, codeUrl, maxCollectCount: 200 });
  }
  return { parsed, invalidLines };
}

// ---------- 公共 API ----------
export interface AddResult {
  added: number;
  duplicated: number;
  invalid: number;
}

export const accountStore = {
  /** 响应式只读视图 */
  list: _list as Readonly<Ref<AccountItem[]>>,
  selectedIdx: _selectedIdx as Readonly<Ref<number>>,

  /** 显式触发首次加载（一般不需要手动调，UI 直接用 list 也会自动初始化） */
  init: ensureInit,

  /**
   * 追加单个账号。手机号已存在则跳过。
   * 返回 added/duplicated/invalid 三类数量。
   */
  async add(item: { phone: string; codeUrl?: string; maxCollectCount?: number }): Promise<AddResult> {
    await ensureInit();
    const phone = (item.phone || '').trim();
    if (!phone) return { added: 0, duplicated: 0, invalid: 1 };

    const current = await readListFromStorage();
    if (current.some((a) => a.phone === phone)) {
      return { added: 0, duplicated: 1, invalid: 0 };
    }
    const next = [
      ...current,
      {
        phone,
        codeUrl: (item.codeUrl || '').trim(),
        maxCollectCount: item.maxCollectCount ?? 200,
      },
    ];
    await writeListToStorage(next);
    return { added: 1, duplicated: 0, invalid: 0 };
  },

  /**
   * 批量追加。文本格式：每行一个账号，`手机号 [接码链接]`，
   * 分隔符支持 tab/空格/逗号/分号/竖线。手机号判重，重复跳过。
   */
  async batchAdd(text: string): Promise<AddResult> {
    await ensureInit();
    const { parsed, invalidLines } = parseBatchText(text);
    if (!parsed.length) {
      return { added: 0, duplicated: 0, invalid: invalidLines };
    }

    const current = await readListFromStorage();
    const existed = new Set(current.map((a) => a.phone));
    const seen = new Set<string>();
    const toAdd: AccountItem[] = [];
    let duplicated = 0;

    for (const item of parsed) {
      if (existed.has(item.phone) || seen.has(item.phone)) {
        duplicated++;
        continue;
      }
      seen.add(item.phone);
      toAdd.push(item);
    }

    if (!toAdd.length) {
      return { added: 0, duplicated, invalid: invalidLines };
    }

    const next = [...current, ...toAdd];
    await writeListToStorage(next);
    return { added: toAdd.length, duplicated, invalid: invalidLines };
  },

  /** 按下标删除。会顺手把 selectedIdx 修正到有效范围 */
  async removeAt(idx: number): Promise<void> {
    await ensureInit();
    const current = await readListFromStorage();
    if (idx < 0 || idx >= current.length) return;
    const next = current.slice();
    next.splice(idx, 1);
    await writeListToStorage(next);

    // selectedIdx 校正：删除导致越界则收回到末尾
    const curIdx = _selectedIdx.value;
    const fixed = normalizeIdx(curIdx, next.length);
    if (fixed !== curIdx) await writeSelectedToStorage(fixed);
  },

  /** 修改单个字段，maxCollectCount 自动转 number */
  async updateField(
    idx: number,
    field: 'phone' | 'codeUrl' | 'maxCollectCount',
    value: any,
  ): Promise<void> {
    await ensureInit();
    const current = await readListFromStorage();
    if (idx < 0 || idx >= current.length) return;
    const next = current.slice();
    const old = next[idx];
    let v: any = value;
    if (field === 'maxCollectCount') v = parseInt(value, 10) || 0;
    if (field === 'phone') v = String(value || '').trim();
    next[idx] = { ...old, [field]: v };
    await writeListToStorage(next);
  },

  /** 设置当前选中下标 */
  async setSelected(idx: number): Promise<void> {
    await ensureInit();
    const fixed = normalizeIdx(idx, _list.value.length);
    await writeSelectedToStorage(fixed);
  },

  /** 取当前选中的账号（可能为 undefined） */
  getSelected(): AccountItem | undefined {
    return _list.value[_selectedIdx.value];
  },
};
