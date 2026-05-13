/** 把小红书前端的相对/中文时间归一化为 YYYY-MM-DD HH:mm:ss */
export function normalizePublishTime(text: string | undefined): string {
  if (!text || typeof text !== 'string') return text || '';
  const t = text.trim();
  if (!t) return '';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  let m: RegExpMatchArray | null;

  m = t.match(/^(昨天|今天)\s*(\d{1,2}):(\d{2})$/);
  if (m) {
    const d = m[1] === '昨天' ? new Date(now.getTime() - 864e5) : now;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${m[2]}:${m[3]}:00`;
  }
  m = t.match(/^(\d+)\s*分钟前$/);
  if (m) {
    const d = new Date(now.getTime() - Number(m[1]) * 60 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  m = t.match(/^(\d+)\s*小时前$/);
  if (m) {
    const d = new Date(now.getTime() - Number(m[1]) * 3600 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  m = t.match(/^(\d+)\s*天前$/);
  if (m) {
    const d = new Date(now.getTime() - Number(m[1]) * 864e5);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 00:00:00`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} 00:00:00`;
  m = t.match(/^(\d{2})-(\d{2})$/);
  if (m) {
    const y = now.getFullYear();
    let dt = new Date(y, +m[1] - 1, +m[2]);
    if (dt > now) dt = new Date(y - 1, +m[1] - 1, +m[2]);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} 00:00:00`;
  }
  return t;
}

export function getTodayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 解析 'HH:mm' 格式为当日分钟数；不合法返回 null */
export function parseTimeToMinutes(timeStr: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 检查当前时间是否在允许执行的时间范围内。
 * - 同一天内：start <= end，如 10:00-21:00
 * - 跨午夜：start > end，如 22:00-06:00
 * @returns `inRange` 当前是否在窗口内；`nextChangeMinutes` 距离下一次状态切换的分钟数（≥0）
 */
export function isInAllowedTimeRange(
  start: string,
  end: string,
): { inRange: boolean; nextChangeMinutes: number } {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (startMin === null || endMin === null) return { inRange: true, nextChangeMinutes: 60 };

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (startMin <= endMin) {
    const inRange = nowMin >= startMin && nowMin < endMin;
    const nextChangeMinutes = inRange
      ? endMin - nowMin
      : nowMin < startMin
        ? startMin - nowMin
        : 24 * 60 - nowMin + startMin;
    return { inRange, nextChangeMinutes };
  } else {
    const inRange = nowMin >= startMin || nowMin < endMin;
    const nextChangeMinutes = inRange
      ? nowMin >= startMin
        ? 24 * 60 - nowMin + endMin
        : endMin - nowMin
      : startMin - nowMin;
    return { inRange, nextChangeMinutes };
  }
}

/**
 * 比 isInAllowedTimeRange 更精细：返回距下次切换的「秒数」。
 * 仅用于 UI 倒计时显示（按秒刷新）；调度逻辑请继续用 isInAllowedTimeRange。
 */
export function getNextAllowedChangeSeconds(start: string, end: string): {
  inRange: boolean;
  /** 距下一次「开窗 / 关窗」的剩余秒数；inRange=true 时是关窗时刻，false 时是开窗时刻 */
  nextChangeSeconds: number;
} {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (startMin === null || endMin === null) {
    return { inRange: true, nextChangeSeconds: 3600 };
  }
  const now = new Date();
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const startSec = startMin * 60;
  const endSec = endMin * 60;
  const DAY = 24 * 3600;

  if (startMin <= endMin) {
    const inRange = nowSec >= startSec && nowSec < endSec;
    const nextChangeSeconds = inRange
      ? endSec - nowSec
      : nowSec < startSec
        ? startSec - nowSec
        : DAY - nowSec + startSec;
    return { inRange, nextChangeSeconds };
  } else {
    const inRange = nowSec >= startSec || nowSec < endSec;
    const nextChangeSeconds = inRange
      ? nowSec >= startSec
        ? DAY - nowSec + endSec
        : endSec - nowSec
      : startSec - nowSec;
    return { inRange, nextChangeSeconds };
  }
}

export function getTraceId(): string {
  // 按你最新需求，traceid 前缀用 年-月-日-时-分-秒 的格式（中间有 - 号），比如 2024-06-08-12-30-45xxxx
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).substring(2, 10);
  return dateStr + rand;
//   return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () =>
//     ((Math.random() * 16) | 0).toString(16),
//   );
}
