// 运行在页面 MAIN world：劫持 fetch/XHR，截获小红书搜索/达人接口；解析 __INITIAL_STATE__ 首屏数据
// 不能使用 chrome.*；通过 window.postMessage 发到 isolate world
import { TARGET_NOTES, TARGET_NOTES_REDNOTE, TARGET_CREATOR } from '@shared/constants';
import type {
  SearchResultMessage,
  CreatorListResultMessage,
  SearchFirstPageHitWindowMessage,
} from '@/types/messages';
import type { SearchNotesResponse, SearchNoteItem } from '@/types/xhs';

(function () {
  /**
   * HTTPS 页面上请求 http:// 会被浏览器拦截（Mixed Content）。
   * 站点脚本若误写 http 接口，在可同源/可访问的前提下改为 https 再发。
   */
  function upgradeToHttpsIfSecurePage(url: string): string {
    if (typeof url !== 'string' || url.length < 10) return url;
    try {
      if (window.location?.protocol === 'https:' && /^http:\/\//i.test(url)) {
        return 'https://' + url.slice(7);
      }
    } catch {
      /* ignore */
    }
    return url;
  }

  function isTargetNotes(url?: string): boolean {
    if (!url || typeof url !== 'string') return false;
    return url.indexOf(TARGET_NOTES) !== -1 || url.indexOf(TARGET_NOTES_REDNOTE) !== -1;
  }
  function isTargetCreator(url?: string): boolean {
    if (!url || typeof url !== 'string') return false;
    return url.indexOf(TARGET_CREATOR) !== -1;
  }

  function getRequestPage(url: any, body?: any): number {
    const u = typeof url === 'string' ? url : url?.url || '';
    if (u) {
      const m = u.match(/[?&]page=(\d+)/i) || u.match(/[?&]page%3D(\d+)/i);
      if (m) return parseInt(m[1], 10) || 1;
    }
    if (body) {
      try {
        const b = typeof body === 'string' ? JSON.parse(body) : body;
        if (b?.page != null) return parseInt(b.page, 10) || 1;
      } catch {}
    }
    return 1;
  }

  function getCreatorPageInfo(url: any): { pageNum: number; isFirstPage: boolean } {
    const u = typeof url === 'string' ? url : url?.url || '';
    if (!u) return { pageNum: 1, isFirstPage: true };
    const m = u.match(/[?&]cursor=([^&]*)/i) || u.match(/[?&]cursor%3D([^&]*)/i);
    const cursor = m ? (m[1] || '').trim() : '';
    const isFirst = !cursor;
    return { pageNum: isFirst ? 1 : 2, isFirstPage: isFirst };
  }

  function extractKeywordFromBody(body: any): string {
    if (!body) return '';
    try {
      const b = typeof body === 'string' ? JSON.parse(body) : body;
      if (typeof b?.keyword === 'string') return b.keyword;
    } catch {}
    return '';
  }

  function postSearch(data: any, isFirstPage: boolean, pageNum: number, keyword?: string) {
    const msg: SearchResultMessage = {
      type: 'XHS_SEARCH_RESULT',
      data,
      isFirstPage: !!isFirstPage,
      pageNum,
      interceptedKeyword: keyword || '',
    };
    try {
      window.postMessage(msg, '*');
    } catch {}
    // 拟人 / 速填模式靠这个信号知道「这一关键词的首页响应已到」，可以推进到下一关键词
    if (isFirstPage && keyword) {
      const hit: SearchFirstPageHitWindowMessage = {
        type: 'XHS_FIRST_PAGE_HIT',
        keyword,
      };
      try {
        window.postMessage(hit, '*');
      } catch {}
    }
  }

  function postCreator(data: any, isFirstPage: boolean, pageNum: number) {
    const msg: CreatorListResultMessage = {
      type: 'XHS_CREATOR_LIST_RESULT',
      data,
      isFirstPage: !!isFirstPage,
      pageNum,
    };
    try {
      window.postMessage(msg, '*');
    } catch {}
  }

  // ---- 抽取页面内嵌首屏数据 ----
  function findItemsInState(obj: any): SearchNoteItem[] | null {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj) && obj.length && obj[0]?.note_card) return obj;
    if (obj.data && Array.isArray(obj.data.items) && obj.data.items[0]?.note_card)
      return obj.data.items;
    if (obj.items && Array.isArray(obj.items) && obj.items[0]?.note_card) return obj.items;
    for (const k in obj) {
      const r = findItemsInState(obj[k]);
      if (r) return r;
    }
    return null;
  }

  function isCreatorNote(item: any): boolean {
    if (!item || typeof item !== 'object') return false;
    if (item.note_id) return true;
    if (item.user && (item.display_title !== undefined || item.id)) return true;
    return false;
  }

  function isCreatorNoteFromHtml(item: any): boolean {
    if (!item || typeof item !== 'object') return false;
    const card = item.noteCard || item.note_card;
    return !!(
      card?.user &&
      (card.displayTitle !== undefined ||
        card.display_title !== undefined ||
        card.noteId ||
        card.note_id)
    );
  }

  function normalizeHtmlNoteToApi(item: any): any {
    const card = item.noteCard || item.note_card || {};
    const u = card.user || {};
    const interact = card.interactInfo || card.interact_info || {};
    return {
      note_id: item.note_id || card.noteId || card.note_id || item.id,
      id: item.id || card.noteId || card.note_id || item.note_id,
      display_title: item.display_title || card.displayTitle || card.display_title,
      user: {
        user_id: u.user_id || u.userId,
        nick_name: u.nick_name || u.nickName || u.nickname,
        nickname: u.nickname || u.nickName || u.nick_name,
        avatar: u.avatar,
      },
      interact_info: {
        liked_count:
          interact.liked_count != null
            ? interact.liked_count
            : interact.likedCount != null
              ? interact.likedCount
              : '',
      },
      xsec_token: item.xsec_token || card.xsecToken || card.xsec_token || item.xsecToken,
      cover: card.cover || item.cover,
    };
  }

  function findCreatorNotesInState(obj: any): any[] | null {
    if (!obj || typeof obj !== 'object') return null;
    if (
      obj.data &&
      Array.isArray(obj.data.notes) &&
      obj.data.notes.length &&
      isCreatorNote(obj.data.notes[0])
    ) {
      return obj.data.notes;
    }
    if (Array.isArray(obj) && obj.length && isCreatorNote(obj[0])) return obj;
    if (obj.notes && Array.isArray(obj.notes) && obj.notes.length) {
      const raw = obj.notes;
      const firstPage: any[] = Array.isArray(raw[0]) ? raw[0] : raw;
      if (firstPage.length && isCreatorNoteFromHtml(firstPage[0])) {
        return firstPage.map((n) => normalizeHtmlNoteToApi(n));
      }
      if (firstPage.length && isCreatorNote(firstPage[0])) return firstPage;
    }
    for (const k in obj) {
      const r = findCreatorNotesInState(obj[k]);
      if (r) return r;
    }
    return null;
  }

  function extractInitialStatePayload<T>(extractor: (state: any) => T | null): T | null {
    let payload: T | null = null;
    if (typeof (window as any).__INITIAL_STATE__ !== 'undefined') {
      payload = extractor((window as any).__INITIAL_STATE__);
    }
    if (!payload) {
      const scripts = document.querySelectorAll('script:not([src])');
      for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent || '';
        const m =
          text.match(/__INITIAL_STATE__\s*=\s*({.+?});?\s*<\/script>/s) ||
          text.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s);
        if (m) {
          try {
            const raw = m[1].replace(/\\u002F/g, '/').replace(/\bundefined\b/g, 'null');
            payload = extractor(JSON.parse(raw));
            break;
          } catch {}
        }
      }
    }
    return payload;
  }

  function tryLoadFromSearchPage() {
    if (window.location.href.indexOf('search_result') === -1) return;
    const items = extractInitialStatePayload(findItemsInState);
    if (items && items.length) {
      const data: SearchNotesResponse = { code: 0, data: { has_more: true, items } };
      postSearch(data, true, 1);
    }
  }

  function tryLoadFromCreatorPage() {
    if (window.location.href.indexOf('user/profile') === -1) return;
    const notes = extractInitialStatePayload(findCreatorNotesInState);
    if (notes && notes.length) {
      postCreator({ code: 0, data: { notes, has_more: true, cursor: '' }, _pageNum: 1 }, true, 1);
    }
  }

  function tryLoadBoth() {
    tryLoadFromSearchPage();
    tryLoadFromCreatorPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(tryLoadBoth, 200);
      setTimeout(tryLoadFromCreatorPage, 600);
    });
  } else {
    setTimeout(tryLoadBoth, 200);
    setTimeout(tryLoadFromCreatorPage, 600);
  }

  // ---- fetch / XHR 劫持（Proxy + prototype patch，尽量对 toString / name / instanceof 隐形） ----
  //
  // 反检测考量：
  //   1. 站点最常用的探测是 `window.fetch.toString()` / `XMLHttpRequest.prototype.open.toString()`
  //      是否包含 "[native code]"。Proxy 对可调用对象 wrap 后，Function.prototype.toString
  //      会透传到 target，仍返回原生字符串。
  //   2. 直接赋值函数（如原先 `xhr.open = function(){}`）会让 toString 变成自定义源码，极易识破。
  //      XHR 这里改为**只 patch 原型方法**而非替换构造函数，保留 `new XMLHttpRequest() instanceof XMLHttpRequest`。
  //   3. 每个 XHR 实例的临时元信息（请求 URL、body）放在 WeakMap 里，避免污染实例的枚举属性
  //      （原先 `xhr._url`/`xhr._body` 在 `for ... in` 里是可见的）。

  const nativeFetch = window.fetch;

  const patchedFetch = new Proxy(nativeFetch, {
    apply(target, thisArg, argArray: any[]) {
      const input = argArray[0];
      const opts = argArray[1];
      let reqInput = input;
      if (typeof input === 'string') {
        const fixed = upgradeToHttpsIfSecurePage(input);
        if (fixed !== input) reqInput = fixed;
      } else if (input && typeof input.url === 'string') {
        const fixed = upgradeToHttpsIfSecurePage(input.url);
        if (fixed !== input.url) {
          reqInput = new Request(fixed, input);
        }
      }
      const nextArgs = [reqInput, opts];
      const u = typeof reqInput === 'string' ? reqInput : reqInput?.url;
      const body =
        opts?.body ||
        (typeof input !== 'string' && input != null ? (input as Request).body : undefined);
      const pageNum = getRequestPage(u, body);
      const firstPage = pageNum === 1;

      if (isTargetNotes(u)) {
        const kw = extractKeywordFromBody(body);
        return (Reflect.apply(target, thisArg, nextArgs) as Promise<Response>).then((r) => {
          const c = r.clone();
          c.json()
            .then((data) => postSearch(data, firstPage, pageNum, kw))
            .catch(() =>
              r.clone().text().then((t) => postSearch({ _raw: t }, firstPage, pageNum, kw)),
            );
          return r;
        });
      }
      if (isTargetCreator(u)) {
        const info = getCreatorPageInfo(u);
        return (Reflect.apply(target, thisArg, nextArgs) as Promise<Response>).then((r) => {
          const c = r.clone();
          c.json()
            .then((data) => postCreator(data, info.isFirstPage, info.pageNum))
            .catch(() =>
              r.clone().text().then((t) => postCreator({ _raw: t }, info.isFirstPage, info.pageNum)),
            );
          return r;
        });
      }
      return Reflect.apply(target, thisArg, nextArgs);
    },
  });
  // 直接赋值会在 window 上新增 "fetch" 为 own property；原本 fetch 继承自 WindowProperties / Window.prototype，
  // 这里尽量用 defineProperty 还原成"可写/可配置但非枚举"的描述符，并保持在 window 上（大部分站点不会对 own-property
  // 做这么细粒度的比较；更深度的比较可以再通过 prototype 定义，但代价是会影响 iframe/其他 realm）。
  try {
    Object.defineProperty(window, 'fetch', {
      value: patchedFetch,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    window.fetch = patchedFetch as any;
  }

  // ---- XHR：prototype 级别 patch，保留构造函数与 instanceof 语义 ----
  const XhrProto = window.XMLHttpRequest.prototype;
  const nativeOpen = XhrProto.open;
  const nativeSend = XhrProto.send;

  // 用 WeakMap 存每个 xhr 实例的元信息，避免在实例上加可枚举属性
  const xhrMeta = new WeakMap<XMLHttpRequest, { url?: string; body?: any; hooked?: boolean }>();
  function getMeta(xhr: XMLHttpRequest) {
    let m = xhrMeta.get(xhr);
    if (!m) {
      m = {};
      xhrMeta.set(xhr, m);
    }
    return m;
  }

  const patchedOpen = new Proxy(nativeOpen, {
    apply(target, thisArg: XMLHttpRequest, argArray: any[]) {
      const url = argArray[1];
      const fixed = typeof url === 'string' ? upgradeToHttpsIfSecurePage(url) : url;
      if (fixed !== url) argArray[1] = fixed;
      getMeta(thisArg).url = fixed;
      return Reflect.apply(target, thisArg, argArray);
    },
  });

  const patchedSend = new Proxy(nativeSend, {
    apply(target, thisArg: XMLHttpRequest, argArray: any[]) {
      const meta = getMeta(thisArg);
      meta.body = argArray[0];
      // 仅注册一次，避免多次 send 导致重复投递
      if (!meta.hooked) {
        meta.hooked = true;
        thisArg.addEventListener('readystatechange', function () {
          if (thisArg.readyState !== 4) return;
          const m = xhrMeta.get(thisArg);
          const url = m?.url;
          if (!url) return;
          const pageNum = getRequestPage(url, m?.body);
          const firstPage = pageNum === 1;
          if (isTargetNotes(url)) {
            const kw = extractKeywordFromBody(m?.body);
            try {
              postSearch(JSON.parse(thisArg.responseText), firstPage, pageNum, kw);
            } catch {
              postSearch({ _raw: thisArg.responseText }, firstPage, pageNum, kw);
            }
            return;
          }
          if (isTargetCreator(url)) {
            const info = getCreatorPageInfo(url);
            try {
              postCreator(JSON.parse(thisArg.responseText), info.isFirstPage, info.pageNum);
            } catch {
              postCreator({ _raw: thisArg.responseText }, info.isFirstPage, info.pageNum);
            }
          }
        });
      }
      return Reflect.apply(target, thisArg, argArray);
    },
  });

  try {
    Object.defineProperty(XhrProto, 'open', {
      value: patchedOpen,
      writable: true,
      configurable: true,
      enumerable: false, // 原生描述符在多数引擎里就是不可枚举的
    });
    Object.defineProperty(XhrProto, 'send', {
      value: patchedSend,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    XhrProto.open = patchedOpen as any;
    XhrProto.send = patchedSend as any;
  }
})();
