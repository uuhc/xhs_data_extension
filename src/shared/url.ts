import {
  SEARCH_SITE_BASE_DEFAULT,
  AUTO_LOGIN_PAGE_DEFAULT,
} from './constants';

export function isXhsLikeHost(url?: string): boolean {
  const u = (url || '').toLowerCase();
  return u.indexOf('xiaohongshu.com') !== -1 || u.indexOf('rednote.com') !== -1;
}

export function normalizeSearchSiteBaseUrl(raw?: string): string {
  const d = SEARCH_SITE_BASE_DEFAULT;
  let s = (raw || '').trim();
  if (!s) return d;
  s = s.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) return d;
  if (s.indexOf('search_result') !== -1) return s;
  return s + '/search_result?source=web_search_result_notes';
}

export function buildSearchResultUrl(base: string, keyword: string): string {
  const kw = (keyword == null ? '' : String(keyword)).trim();
  if (!kw) return base;
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'keyword=' + encodeURIComponent(kw);
}

export function normalizeAutoLoginPageUrl(raw?: string): string {
  const d = AUTO_LOGIN_PAGE_DEFAULT;
  let s = (raw || '').trim();
  if (!s) return d;
  s = s.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) return d;
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return d;
    return u.href.replace(/\/$/, '') || d;
  } catch {
    return d;
  }
}

export function getSearchSiteOrigin(base: string): string {
  try {
    return new URL(base).origin;
  } catch {
    return 'https://www.xiaohongshu.com';
  }
}
