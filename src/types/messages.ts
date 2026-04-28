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

export type RuntimeMessage =
  | MsgPing
  | MsgCallbackFetch
  | MsgLoginDialogDetected
  | MsgStartAutoTask
  | MsgStopAutoTask
  | MsgRunNavigateThenAutoLogin
  | MsgCountdown
  | MsgSearchFirstPageHit
  | MsgTriggerKeywordSearch;

// 后端响应：关键词任务
export interface KeywordTaskResponse {
  result?: KeywordTaskInfo | KeywordTaskInfo[];
  data?: any;
  keywords?: any[];
  list?: any[];
}
