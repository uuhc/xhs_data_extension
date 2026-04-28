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
