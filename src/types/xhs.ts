// 小红书搜索/达人接口的关键字段类型（仅声明用到的字段）

export interface CornerTagInfo {
  text?: string;
  type?: string;
}

export interface InteractInfo {
  liked_count?: number | string;
  comment_count?: number | string;
  collected_count?: number | string;
  shared_count?: number | string;
  likedCount?: number | string;
}

export interface NoteUser {
  user_id?: string;
  id?: string;
  nick_name?: string;
  nickname?: string;
  nickName?: string;
  avatar?: string;
  desc?: string;
  fans?: number | string;
}

export interface NoteCard {
  type?: string;
  display_title?: string;
  displayTitle?: string;
  cover?: any;
  user?: NoteUser;
  interact_info?: InteractInfo;
  interactInfo?: InteractInfo;
  corner_tag_info?: CornerTagInfo[];
  noteId?: string;
  note_id?: string;
  xsecToken?: string;
  xsec_token?: string;
}

export interface SearchNoteItem {
  id?: string;
  model_type?: string;
  note_card?: NoteCard;
  noteCard?: NoteCard;
  xsec_token?: string;
  note_id?: string;
  display_title?: string;
  user?: NoteUser;
  interact_info?: InteractInfo;
  cover?: any;
}

export interface SearchNotesResponse {
  code?: number;
  data?: {
    has_more?: boolean;
    items?: SearchNoteItem[];
    notes?: SearchNoteItem[];
    users?: NoteUser[];
    cursor?: string;
  };
  _pageNum?: number;
  _raw?: string;
}

// 关键词任务对象（后端 result 字段）
export interface KeywordTaskInfo {
  ID?: number;
  InterestID?: string | number;
  InterestName?: string;
  Keywords?: string;
  Platform?: string;
  Type?: number;
  [key: string]: any;
}

// 账号
export interface AccountItem {
  phone: string;
  codeUrl: string;
  maxCollectCount: number;
}

// 采集统计 { "0": { "2026-01-01": 12 } }
export type AccountCollectStats = Record<string, Record<string, number>>;

// ---------- 扫码登录（QR）相关 ----------
/**
 * 单个 web_session（= 单个账号）的采集统计 + 用户自定义元数据。
 * 以 sessionHash（web_session 的 SHA-256 前 16 hex）为唯一键。
 */
export interface QrSessionStat {
  /** 用户给这个账号起的别名；未填时 UI 会展示 sessionHash 前 8 位 */
  alias?: string;
  /** 单账号每日采集上限；未覆盖时走 qrLoginDefaultMax */
  maxCollectCount?: number;
  firstSeenAt: number;
  lastUsedAt: number;
  /** 日采集次数：{ "2026-04-21": 123 } */
  daily: Record<string, number>;
}

/** { [sessionHash]: QrSessionStat } */
export type QrSessionStatsMap = Record<string, QrSessionStat>;
