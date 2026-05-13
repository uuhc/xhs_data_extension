import type { SearchNotesResponse, KeywordTaskInfo } from './xhs';

// MAIN ↔ ISOLATED 通过 window.postMessage 通讯
export interface SearchResultMessage {
  type: 'XHS_SEARCH_RESULT';
  data: SearchNotesResponse | string;
  isFirstPage: boolean;
  pageNum: number;
  interceptedKeyword?: string;
}

export interface CreatorListResultMessage {
  type: 'XHS_CREATOR_LIST_RESULT';
  data: SearchNotesResponse | string;
  isFirstPage: boolean;
  pageNum: number;
}

/** MAIN → ISOLATED：搜索接口首页响应已到，用于 SPA 触发模式（拟人/速填）的等待信号 */
export interface SearchFirstPageHitWindowMessage {
  type: 'XHS_FIRST_PAGE_HIT';
  keyword: string;
}

export type WindowMessage =
  | SearchResultMessage
  | CreatorListResultMessage
  | SearchFirstPageHitWindowMessage;

// runtime.sendMessage（content/panel ↔ background）
export interface MsgPing {
  type: 'dataCrawlerPing';
}
export interface MsgCallbackFetch {
  type: 'xhsCallbackFetch';
  url: string;
  body: any;
}
export interface MsgLoginDialogDetected {
  type: 'loginDialogDetected';
}
export interface MsgStartAutoTask {
  type: 'startAutoTask';
}
export interface MsgStopAutoTask {
  type: 'stopAutoTask';
}
export interface MsgRunNavigateThenAutoLogin {
  type: 'runNavigateThenAutoLogin';
  tabId: number;
}
export interface MsgCountdown {
  type: 'dataCrawlerCountdown';
  show: boolean;
  text?: string;
  seconds?: number;
}
/** isolate world → background：通知首页响应已到（payload 来自 MAIN world 的 XHS_FIRST_PAGE_HIT） */
export interface MsgSearchFirstPageHit {
  type: 'searchFirstPageHit';
  keyword: string;
}
/** panel → background：手动顺序执行下触发一次关键词搜索（走 mode 分发） */
export interface MsgTriggerKeywordSearch {
  type: 'triggerKeywordSearch';
  tabId: number;
  keyword: string;
}

/**
 * 中央 stats broker 消息：
 * 把账号 / QR 采集统计的 read-modify-write 集中到 background 的串行队列，
 * 彻底消除「面板 reset」与「isolate +1」并发覆盖问题。
 */
export type StatsOpPayload =
  | { kind: 'sms'; op: 'increment' }
  | { kind: 'sms'; op: 'reset'; idx: number }
  | { kind: 'sms'; op: 'clearAll' }
  /** 删除 N 天前的历史日桶，仅 background 内部调用（GC） */
  | { kind: 'sms'; op: 'pruneOldDays'; keepDays: number }
  /** 把当前选中账号今日计数强制设为 maxCollectCount（用于 openKeywordUrl 失败时标记今日暂停） */
  | { kind: 'sms'; op: 'forceQuotaReached' }
  | { kind: 'qr'; op: 'increment'; hash: string }
  | { kind: 'qr'; op: 'reset'; hash: string }
  | { kind: 'qr'; op: 'clearAll' }
  | { kind: 'qr'; op: 'register'; hash: string }
  /** 部分更新 session 配置（alias / maxCollectCount）。
   *  alias 传 null 视为「不变」，传字符串（含空串）则覆盖；
   *  maxCollectCount 传 null 视为「清除单账号覆盖」，传 number 则覆盖。 */
  | { kind: 'qr'; op: 'update'; hash: string; alias?: string | null; maxCollectCount?: number | null }
  | { kind: 'qr'; op: 'remove'; hash: string };

export interface MsgStatsOp {
  type: 'statsOp';
  payload: StatsOpPayload;
}

export type RuntimeMessage =
  | MsgPing
  | MsgCallbackFetch
  | MsgLoginDialogDetected
  | MsgStartAutoTask
  | MsgStopAutoTask
  | MsgRunNavigateThenAutoLogin
  | MsgCountdown
  | MsgSearchFirstPageHit
  | MsgTriggerKeywordSearch
  | MsgStatsOp;

// 后端响应：关键词任务
export interface KeywordTaskResponse {
  result?: KeywordTaskInfo | KeywordTaskInfo[];
  data?: any;
  keywords?: any[];
  list?: any[];
}
