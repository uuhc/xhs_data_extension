// 接口拦截目标
export const TARGET_NOTES = 'edith.xiaohongshu.com/api/sns/web/v1/search/notes';
export const TARGET_NOTES_REDNOTE = 'webapi.rednote.com/api/sns/web/v1/search/notes';
export const TARGET_CREATOR = 'edith.xiaohongshu.com/api/sns/web/v1/user_posted';

// 后端接口
export const ADD_SEARCH_RESULT_PATH = 'xhs_extension/add_xhs_app_search_result';
export const GET_KEYWORD_TASK_PATH = 'xhs_extension/get_keyword_task';

// 默认地址
export const API_HOST_DEFAULT = 'https://your-api.example/';
export const API_HOST_PLACEHOLDER = 'https://your-api.example/';
export const AUTO_LOGIN_PAGE_DEFAULT = 'https://www.rednote.com';

/**
 * 搜索页站点：
 *   - 国内站 cn：https://www.xiaohongshu.com/search_result?source=web_search_result_notes
 *   - 国际站 intl：https://www.rednote.com/search_result?source=web_search_result_notes
 * 默认国际站。
 */
export type SearchSite = 'cn' | 'intl';
export const SEARCH_SITE_DEFAULT: SearchSite = 'intl';
export const SEARCH_SITE_URL: Record<SearchSite, string> = {
  cn: 'https://www.xiaohongshu.com/search_result?source=web_search_result_notes',
  intl: 'https://www.rednote.com/search_result?source=web_search_result_notes',
};
export const SEARCH_SITE_LABEL: Record<SearchSite, string> = {
  cn: '国内站',
  intl: '国际站',
};
export function isSearchSite(v: unknown): v is SearchSite {
  return v === 'cn' || v === 'intl';
}
/** 向后兼容：根据 storage 中的 searchSiteBase 反推站点类型，如果无法识别则用默认值 */
export const SEARCH_SITE_BASE_DEFAULT = SEARCH_SITE_URL[SEARCH_SITE_DEFAULT];

/**
 * 扫码登录支持两个站点（用户可在面板里二选一）：
 *   - 国内站 cn：https://www.xiaohongshu.com/explore
 *   - 国际站 intl：https://www.rednote.com/explore
 * 默认走国内站（验证码 / 风控差异更小）。
 */
export type QrLoginSite = 'cn' | 'intl';
export const QR_LOGIN_SITE_DEFAULT: QrLoginSite = 'cn';
export const QR_LOGIN_SITE_URL: Record<QrLoginSite, string> = {
  cn: 'https://www.xiaohongshu.com/explore',
  intl: 'https://www.rednote.com/explore',
};
export const QR_LOGIN_SITE_LABEL: Record<QrLoginSite, string> = {
  cn: '国内站',
  intl: '国际站',
};
export const QR_LOGIN_SITE_DESC: Record<QrLoginSite, string> = {
  cn: '国内站 · xiaohongshu.com（默认，风控更稳）',
  intl: '国际站 · rednote.com',
};
export function isQrLoginSite(v: unknown): v is QrLoginSite {
  return v === 'cn' || v === 'intl';
}

// storage keys
export const STORAGE_KEYS = {
  apiHost: 'apiHost',
  searchSite: 'searchSite',
  searchSiteBase: 'searchSiteBaseUrl',
  autoLoginPage: 'autoLoginPageUrl',
  pluginSearchKeywords: 'pluginSearchKeywords',
  publishTimeFilter: 'publishTimeFilter',
  accountList: 'accountList',
  selectedAccountIndex: 'selectedAccountIndex',
  accountCollectStats: 'accountCollectStats',
  autoTaskIntervalMin: 'autoTaskIntervalMin',
  autoTaskIntervalMax: 'autoTaskIntervalMax',
  autoTaskRunInBackground: 'autoTaskRunInBackground',
  autoTaskAutoLoginEnabled: 'autoTaskAutoLoginEnabled',
  autoTaskRunning: 'autoTaskRunning',
  autoTaskStatus: 'autoTaskStatus',
  autoTaskLogLine: 'autoTaskLogLine',
  autoTaskCallbackStatus: 'autoTaskCallbackStatus',
  currentKeywordTask: 'currentKeywordTask',
  searchNotesPages: 'searchNotesPages',
  searchNotesResult: 'searchNotesResult',
  creatorListPages: 'creatorListPages',
  creatorListResult: 'creatorListResult',
  autoLoginOnDialog: 'autoLoginOnDialog',
  autoLoginRunning: 'autoLoginRunning',
  /** 每个手机号最近一次成功使用的验证码：{ "13800138000": "123456" } */
  smsCodeMap: 'smsCodeMap',
  /** 当前是否已登录小红书 / Rednote（基于 web_session cookie 判定） */
  xhsLoggedIn: 'xhsLoggedIn',
  /** 关键词对应的任务元数据：{ "山浩...": { ID, Level, InterestName, ... } } */
  pluginKeywordTaskInfos: 'pluginKeywordTaskInfos',
  /** 面板「按顺序执行」全局随机间隔（秒），每次进入下一词前在 [min,max] 内重新随机 */
  orderedExecuteDelayMinSec: 'orderedExecuteDelayMinSec',
  orderedExecuteDelayMaxSec: 'orderedExecuteDelayMaxSec',
  /** 面板「按顺序执行」已成功搜过的关键词文本（下次自动跳过） */
  orderedSearchExecutedKeywords: 'orderedSearchExecutedKeywords',
  /** 软禁用：为 true 时 background 拒绝所有"主动"任务（自动任务 / 自动登录 / 回调上报 等）*/
  pluginPaused: 'pluginPaused',
  /**
   * 自动任务「下一步继续」恢复点。MV3 Service Worker 可能在长等待间被 Chrome 回收，
   * 在进入 >25s 等待前会把 { sessionGen, keywords, taskInfos, nextIndex } 写入此键，
   * 由 chrome.alarms 唤醒 SW 后读出并从 nextIndex 继续执行。
   */
  autoTaskResumeState: 'autoTaskResumeState',
  /** 下一词倒计时（剩余秒）：自动任务 / 手动顺序搜索共用；0 表示没有等待 */
  countdownRemainSec: 'countdownRemainSec',
  /** 本次自动任务 session 起始时间戳；未运行时为 0 / undefined */
  autoTaskSessionStartAt: 'autoTaskSessionStartAt',
  /** 回传日计数：{ [YYYY-MM-DD]: { ok: number, fail: number } } */
  callbackDailyStats: 'callbackDailyStats',
  /** API 最近一次探针结果：{ ok: boolean, at: number, error?: string } */
  apiLastProbe: 'apiLastProbe',
  /**
   * 搜索触发方式：'url' | 'human' | 'quick'
   * - url：直接 chrome.tabs.update 跳转 search_result 页（默认，最快最稳）
   * - human：拟人化（鼠标轨迹 + 逐字输入 + Enter）
   * - quick：速填（直接填值 + 派发 Enter 键，无鼠标轨迹）
   * 切换在「下一关键词」生效，不打断正在执行的关键词。
   */
  searchTriggerMode: 'searchTriggerMode',
  /**
   * 登录方式：'sms' | 'qrcode'
   * - sms：原有的「手机号 + 接码链接」自动登录（默认）
   * - qrcode：扫码登录。扫到的 web_session 作为账号 ID（sessionHash）维护在 qrSessionStats。
   * 切换时建议先自动退出，否则残留 Cookie 会让扫码登录态检测出错。
   */
  loginMode: 'loginMode',
  /** 扫码登录远端接口地址（POST 时将当前二维码内容提交给它，由远端完成扫码） */
  qrLoginApiUrl: 'qrLoginApiUrl',
  /** QR 模式下单账号每日采集上限的「全局默认」；单个 sessionHash 仍可在列表里逐行覆盖 */
  qrLoginDefaultMax: 'qrLoginDefaultMax',
  /** QR 模式的账号列表：{ [sessionHash]: { alias, maxCollectCount?, daily, ... } } */
  qrSessionStats: 'qrSessionStats',
  /** 最近一次成功登录得到的 web_session 对应的 sessionHash；回传统计会写到这里 */
  currentQrSessionHash: 'currentQrSessionHash',
  /** QR 登录 / 轮询任务运行态；仅 UI 展示用（类似 autoLoginRunning） */
  qrLoginRunning: 'qrLoginRunning',
  /** 扫码登录使用的站点：'cn' | 'intl'；默认 'cn'（国内站 xiaohongshu.com） */
  qrLoginSite: 'qrLoginSite',
  /** 允许执行任务的开始时间（HH:mm 格式，默认 '10:00'） */
  allowedTimeStart: 'allowedTimeStart',
  /** 允许执行任务的结束时间（HH:mm 格式，默认 '21:00'） */
  allowedTimeEnd: 'allowedTimeEnd',
} as const;

// ---------- STORAGE_KEYS 分组（纯文档/心智标签，不改变存储位置） ----------
// 作用：帮助维护者快速判断某个 key 的"性格"。任何新增 key 也请归到以下分组。
//
// - PERSIST_KEYS：用户配置/凭据/长期业务数据，卸载插件前都应保留。
// - RUNTIME_KEYS：进程间协调状态；浏览器重启后需要恢复（比如"后台持续运行"用到）。
// - TRANSIENT_KEYS：临时数据/采集中间产物/日志片段；丢失不影响正确性。

/** 持久：用户配置 / 账号 / 接口地址 / 历史统计 */
export const PERSIST_KEYS = {
  apiHost: STORAGE_KEYS.apiHost,
  searchSite: STORAGE_KEYS.searchSite,
  searchSiteBase: STORAGE_KEYS.searchSiteBase,
  autoLoginPage: STORAGE_KEYS.autoLoginPage,
  pluginSearchKeywords: STORAGE_KEYS.pluginSearchKeywords,
  publishTimeFilter: STORAGE_KEYS.publishTimeFilter,
  accountList: STORAGE_KEYS.accountList,
  selectedAccountIndex: STORAGE_KEYS.selectedAccountIndex,
  accountCollectStats: STORAGE_KEYS.accountCollectStats,
  autoTaskIntervalMin: STORAGE_KEYS.autoTaskIntervalMin,
  autoTaskIntervalMax: STORAGE_KEYS.autoTaskIntervalMax,
  autoTaskRunInBackground: STORAGE_KEYS.autoTaskRunInBackground,
  autoTaskAutoLoginEnabled: STORAGE_KEYS.autoTaskAutoLoginEnabled,
  autoLoginOnDialog: STORAGE_KEYS.autoLoginOnDialog,
  smsCodeMap: STORAGE_KEYS.smsCodeMap,
  pluginKeywordTaskInfos: STORAGE_KEYS.pluginKeywordTaskInfos,
  orderedExecuteDelayMinSec: STORAGE_KEYS.orderedExecuteDelayMinSec,
  orderedExecuteDelayMaxSec: STORAGE_KEYS.orderedExecuteDelayMaxSec,
  orderedSearchExecutedKeywords: STORAGE_KEYS.orderedSearchExecutedKeywords,
  callbackDailyStats: STORAGE_KEYS.callbackDailyStats,
  searchTriggerMode: STORAGE_KEYS.searchTriggerMode,
  loginMode: STORAGE_KEYS.loginMode,
  qrLoginApiUrl: STORAGE_KEYS.qrLoginApiUrl,
  qrLoginDefaultMax: STORAGE_KEYS.qrLoginDefaultMax,
  qrSessionStats: STORAGE_KEYS.qrSessionStats,
  qrLoginSite: STORAGE_KEYS.qrLoginSite,
  allowedTimeStart: STORAGE_KEYS.allowedTimeStart,
  allowedTimeEnd: STORAGE_KEYS.allowedTimeEnd,
} as const;

/** 运行时状态：多进程协调，浏览器重启后需要"恢复到继续运行"的语义 */
export const RUNTIME_KEYS = {
  autoTaskRunning: STORAGE_KEYS.autoTaskRunning,
  autoTaskStatus: STORAGE_KEYS.autoTaskStatus,
  autoLoginRunning: STORAGE_KEYS.autoLoginRunning,
  qrLoginRunning: STORAGE_KEYS.qrLoginRunning,
  xhsLoggedIn: STORAGE_KEYS.xhsLoggedIn,
  currentQrSessionHash: STORAGE_KEYS.currentQrSessionHash,
  pluginPaused: STORAGE_KEYS.pluginPaused,
  /** 自动任务恢复点必须跨 SW 重启保留 */
  autoTaskResumeState: STORAGE_KEYS.autoTaskResumeState,
  countdownRemainSec: STORAGE_KEYS.countdownRemainSec,
  autoTaskSessionStartAt: STORAGE_KEYS.autoTaskSessionStartAt,
} as const;

/** 瞬态：采集中间结果 / 最后日志行 / 回调状态；丢失可容忍 */
export const TRANSIENT_KEYS = {
  autoTaskLogLine: STORAGE_KEYS.autoTaskLogLine,
  autoTaskCallbackStatus: STORAGE_KEYS.autoTaskCallbackStatus,
  currentKeywordTask: STORAGE_KEYS.currentKeywordTask,
  searchNotesPages: STORAGE_KEYS.searchNotesPages,
  searchNotesResult: STORAGE_KEYS.searchNotesResult,
  creatorListPages: STORAGE_KEYS.creatorListPages,
  creatorListResult: STORAGE_KEYS.creatorListResult,
  apiLastProbe: STORAGE_KEYS.apiLastProbe,
} as const;

// chrome.alarms 名称
export const ALARM_NAMES = {
  /** 自动任务长等待后的恢复点 */
  autoTaskResume: 'autoTask.resume',
} as const;

/** 面板「执行记录」最多保留条数 */
export const ORDERED_RUN_LOG_MAX = 3;

// 限制
export const MAX_PAGES_IN_STORAGE = 50;
export const CALLBACK_MAX_RETRIES = 5;
/** 拉关键词 GET 失败后的重试次数（不含首次）；共最多 1 + N 次请求 */
export const KEYWORD_TASK_FETCH_RETRIES = 3;
export const KEYWORD_TASK_FETCH_RETRY_DELAY_MS = 800;
/** 插件主动发起的 HTTP（fetch）超时，单位 ms；不含浏览器打开网页本身 */
export const EXTENSION_HTTP_TIMEOUT_MS = 15000;
export const KEYWORD_FETCH_PAGE_CHECK_ROUNDS = 5;
export const KEYWORD_FETCH_PAGE_CHECK_INTERVAL_MS = 500;

// 消息类型
export const MSG = {
  XHS_SEARCH_RESULT: 'XHS_SEARCH_RESULT',
  XHS_CREATOR_LIST_RESULT: 'XHS_CREATOR_LIST_RESULT',
  xhsCallbackFetch: 'xhsCallbackFetch',
  loginDialogDetected: 'loginDialogDetected',
  startAutoTask: 'startAutoTask',
  stopAutoTask: 'stopAutoTask',
  runNavigateThenAutoLogin: 'runNavigateThenAutoLogin',
  abortAutoLogin: 'abortAutoLogin',
  syncLoginStatus: 'syncLoginStatus',
  /** 暂停 / 恢复插件 */
  setPluginPaused: 'setPluginPaused',
  dataCrawlerCountdown: 'dataCrawlerCountdown',
  dataCrawlerPing: 'dataCrawlerPing',
  /** background 广播新日志条目到 panel / 其他监听者 */
  autoTaskLogEntry: 'autoTaskLogEntry',
  /** panel 向 background 请求当前 ring buffer 里的历史日志 */
  autoTaskLogHistoryRequest: 'autoTaskLogHistoryRequest',
  /**
   * content/main.ts 拦截到 /search/notes 第一页响应后，先 postMessage 到 isolate world，
   * isolate world 再 sendMessage 给 background；用于拟人 / 速填模式下「等待首页响应」的统一信号。
   * payload: { keyword: string }
   */
  searchFirstPageHit: 'searchFirstPageHit',
  /**
   * panel → background：手动顺序执行触发单个关键词搜索，复用自动任务同一套
   * 模式分发 + 失败回退（直跳 / 拟人 / 速填）。
   * payload: { tabId: number, keyword: string }
   * 响应: { ok: boolean, mode?: SearchTriggerMode, error?: string }
   */
  triggerKeywordSearch: 'triggerKeywordSearch',
} as const;

// ---------- 搜索触发模式 ----------
export type SearchTriggerMode = 'url' | 'human' | 'quick';

/** UI 上的 2 字短名（状态栏徽章 / 模式开关按钮） */
export const SEARCH_TRIGGER_MODE_LABEL: Record<SearchTriggerMode, string> = {
  url: '直跳',
  human: '拟人',
  quick: '速填',
};

/** UI tooltip 用的长描述 */
export const SEARCH_TRIGGER_MODE_DESC: Record<SearchTriggerMode, string> = {
  url: 'URL 直跳 · 直接换地址（默认，最快最稳）',
  human: '拟人输入 · 鼠标轨迹 + 逐字键入（反检测最强，慢）',
  quick: '速填回车 · 直接填值 + Enter（折中）',
};

/**
 * 优先级 / 失败回退顺序的根据：URL > 拟人 > 速填。
 * 实际回退策略：拟人/速填失败 → 兜底回到 URL；URL 自身失败不再回退。
 */
export const SEARCH_TRIGGER_MODE_PRIORITY: SearchTriggerMode[] = ['url', 'human', 'quick'];

export const SEARCH_TRIGGER_MODE_DEFAULT: SearchTriggerMode = 'human';

export function isSearchTriggerMode(v: unknown): v is SearchTriggerMode {
  return v === 'url' || v === 'human' || v === 'quick';
}

// ---------- 登录模式 ----------
export type LoginMode = 'sms' | 'qrcode';

/** UI segment 上的短名 */
export const LOGIN_MODE_LABEL: Record<LoginMode, string> = {
  sms: '短信验证码',
  qrcode: '扫码登录',
};

/** tooltip / 详细说明 */
export const LOGIN_MODE_DESC: Record<LoginMode, string> = {
  sms: '手机号 + 接码链接，自动发送 / 接收验证码完成登录',
  qrcode: '远端代扫二维码登录：扫到的 web_session 作为账号 ID 独立统计',
};

/** 手动登录按钮文案（未登录状态） */
export const LOGIN_MODE_BUTTON_LABEL: Record<LoginMode, string> = {
  sms: '自动登录',
  qrcode: '扫码登录',
};

/** 手动登录按钮文案（运行中状态，用于取消） */
export const LOGIN_MODE_BUTTON_CANCEL_LABEL: Record<LoginMode, string> = {
  sms: '取消自动登录',
  qrcode: '取消扫码登录',
};

export const LOGIN_MODE_DEFAULT: LoginMode = 'sms';

/** QR 全局默认单账号每日采集上限（qrLoginDefaultMax 为空时的兜底值） */
export const QR_LOGIN_DEFAULT_MAX = 200;

export function isLoginMode(v: unknown): v is LoginMode {
  return v === 'sms' || v === 'qrcode';
}
