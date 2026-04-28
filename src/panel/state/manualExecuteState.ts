import { ref } from 'vue';
import { ORDERED_RUN_LOG_MAX } from '@shared/constants';

/** 手动「按顺序搜索」是否正在跑（供步骤 2/3 摘要与列表高亮） */
export const manualOrderedRunning = ref(false);
export const manualRunningIdx = ref(-1);
export const manualDoneSet = ref<Set<number>>(new Set());
export const manualOrderedRunLog = ref<{ at: number; line: string }[]>([]);
/** 外部（如全局停止按钮）请求取消「按顺序搜索」——由 ManualExecuteSection 在循环里轮询消费 */
export const manualOrderedCancelRequested = ref(false);

export function prependManualRunLog(line: string) {
  manualOrderedRunLog.value = [{ at: Date.now(), line }, ...manualOrderedRunLog.value].slice(
    0,
    ORDERED_RUN_LOG_MAX,
  );
}

export function resetManualOrderedUiProgress() {
  manualDoneSet.value = new Set();
  manualRunningIdx.value = -1;
}
