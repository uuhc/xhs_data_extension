// 这些函数会被 chrome.scripting.executeScript 注入到页面 MAIN world 中执行；
// 它们必须是「自包含」的，不能引用模块外的变量；返回值会被 chrome.scripting 序列化。
// （此处函数体源自原 background/index.js 的 _xhsXxx / clickPublishTimeXxx 等）

export function xhsFillPhone(phone: string): boolean {
  const selectors = [
    'input[placeholder*="手机号"]',
    'input[type="tel"]',
    'input[placeholder*="请输入手机号"]',
    'input[name="phone"]',
    'input[placeholder*="phone"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLInputElement | null;
    if (!el) continue;
    if (el.offsetParent == null && el.getBoundingClientRect().width <= 0) continue;
    el.focus();
    try {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc?.set) desc.set.call(el, phone);
      else el.value = phone;
    } catch {
      el.value = phone;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

export function xhsClickSendSms(): boolean {
  // 兼容中英文，且做 case-insensitive 文本匹配。
  // 优先按文本找；找不到再按 `.code-button` class 兜底（小红书登录表单专用 class）。
  const textKeywords = [
    '获取验证码',
    '发送验证码',
    'get code',
    'send code',
    'send',
  ];
  function fire(el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }
  function visible(el: HTMLElement): boolean {
    const r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  }
  // 1) 文本匹配（大小写不敏感、全等于 normalize-space 后的文本）
  const candidates = Array.from(
    document.querySelectorAll('button, [role="button"], .code-button, span, a'),
  ) as HTMLElement[];
  for (const el of candidates) {
    if (!visible(el)) continue;
    const text = (el.textContent || '').trim().toLowerCase();
    if (!text || text.length > 20) continue;
    if (textKeywords.some((k) => text === k.toLowerCase())) {
      fire(el);
      return true;
    }
  }
  // 2) 按 class 兜底：小红书登录表单里这个按钮一定带 .code-button
  const codeBtns = Array.from(document.querySelectorAll('.code-button')) as HTMLElement[];
  for (const el of codeBtns) {
    if (!visible(el)) continue;
    fire(el);
    return true;
  }
  return false;
}

export function xhsFillSmsCode(code: string): boolean {
  const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
  for (const el of inputs) {
    if (el.offsetParent == null && el.getBoundingClientRect().width <= 0) continue;
    const placeholder = (el.placeholder || '').toLowerCase();
    const maxLen = el.maxLength;
    const isCodeInput =
      placeholder.indexOf('验证码') !== -1 ||
      placeholder.indexOf('code') !== -1 ||
      (maxLen >= 4 && maxLen <= 8 && el.type !== 'tel' && el.type !== 'email');
    if (!isCodeInput) continue;
    el.focus();
    try {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc?.set) desc.set.call(el, code);
      else el.value = code;
    } catch {
      el.value = code;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

export function xhsClickLogin(): boolean {
  const exact = ['登录', '立即登录', '登录/注册', '验证登录', '一键登录', 'log in', 'login', 'sign in'];
  const btns = Array.from(
    document.querySelectorAll('button, [role="button"], .submit'),
  ) as HTMLElement[];
  for (const btn of btns) {
    if (btn.offsetParent == null || (btn as HTMLButtonElement).disabled) continue;
    const text = (btn.textContent || btn.innerText || '').trim().toLowerCase();
    if (exact.indexOf(text) !== -1) {
      btn.click();
      return true;
    }
  }
  return false;
}

export function xhsClickByText(targetText: string): boolean {
  try {
    const escaped = targetText.replace(/'/g, "''");
    const nodes = document.evaluate(
      "//*[normalize-space(.)='" + escaped + "' or normalize-space(text())='" + escaped + "']",
      document,
      null,
      7,
      null,
    );
    for (let i = nodes.snapshotLength - 1; i >= 0; i--) {
      const el = nodes.snapshotItem(i) as HTMLElement | null;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    }
  } catch {}
  return false;
}

// 判断页面是否存在「登录入口 / 登录表单 / 手机号输入框」（用于识别未登录态）
// 命中以下任一条件即视为未登录：
//   1) 侧边栏 / 顶栏的「登录」按钮：`#login-btn` 或 `.login-btn`，文本含「登录」
//   2) 登录表单：可见的 form / .input-container 内同时包含
//      - 手机号输入框（placeholder 含「手机号」或 name="phone"）
//      - 验证码输入框（placeholder 含「验证码」）
//      - 文本为「登录」的提交按钮
//   3) 手机号输入框单独出现（兜底）：页面上存在可见的手机号输入框
//      匹配规则（任一满足）：
//        - placeholder 含「手机号」/「phone」
//        - name="phone"
//        - type="tel"
//        - autocomplete="tel"
//      已登录状态下整站不会渲染手机号输入框，因此看到可见的手机号 input 可直接判定为未登录
export function checkXhsLoginUiPresent(): boolean {
  function isVisible(el: HTMLElement | null): boolean {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const st = window.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0)
      return false;
    return true;
  }
  function isPhoneInput(el: HTMLInputElement): boolean {
    const ph = (el.placeholder || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    const auto = (el.autocomplete || '').toLowerCase();
    return (
      ph.indexOf('手机号') !== -1 ||
      ph.indexOf('phone') !== -1 ||
      name === 'phone' ||
      el.type === 'tel' ||
      auto === 'tel'
    );
  }
  function isCodeInput(el: HTMLInputElement): boolean {
    const ph = (el.placeholder || '').toLowerCase();
    return ph.indexOf('验证码') !== -1 || ph.indexOf('code') !== -1;
  }

  // 兼容中英文：英文版页面文案为 "Log in" / "Login" / "Sign in"
  function looksLikeLoginText(raw: string): boolean {
    const t = raw.replace(/\s+/g, '').toLowerCase();
    if (!t) return false;
    if (t.indexOf('登录') !== -1) return true;
    if (t === 'login' || t === 'logincon' /* 容错 */ ) return true;
    // "Log in" / "Sign in" 去空格后
    if (t === 'login' || t === 'signin') return true;
    return false;
  }

  // 1) 登录按钮
  const byId = document.getElementById('login-btn');
  if (byId && isVisible(byId as HTMLElement)) {
    if (looksLikeLoginText(byId.textContent || '')) return true;
  }
  const btnList = document.querySelectorAll<HTMLElement>('.login-btn');
  for (const el of Array.from(btnList)) {
    if (!isVisible(el)) continue;
    if (looksLikeLoginText(el.textContent || '')) return true;
  }

  // 2) 登录表单（phone + code + 登录按钮）
  const containers = Array.from(
    document.querySelectorAll<HTMLElement>('form, .input-container'),
  );
  for (const root of containers) {
    if (!isVisible(root)) continue;
    const inputs = Array.from(root.querySelectorAll('input')) as HTMLInputElement[];
    if (!inputs.some(isPhoneInput)) continue;
    if (!inputs.some(isCodeInput)) continue;
    const btns = Array.from(
      root.querySelectorAll('button, [role="button"], .submit, .code-button'),
    ) as HTMLElement[];
    const hasLoginSubmit = btns.some((b) => {
      if (!isVisible(b)) return false;
      const t = (b.textContent || '').replace(/\s+/g, '').toLowerCase();
      return (
        t === '登录' ||
        t === '立即登录' ||
        t === '验证登录' ||
        t === 'login' ||
        t === 'signin'
      );
    });
    if (hasLoginSubmit) return true;
  }

  // 3) 兜底：页面上存在可见的手机号输入框
  const allInputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
  for (const el of allInputs) {
    if (!isPhoneInput(el)) continue;
    if (!isVisible(el)) continue;
    return true;
  }

  return false;
}

export function checkPageHasLoginDialog(): boolean {
  const selectors = [
    'input[placeholder*="手机号"]',
    'input[type="tel"]',
    'input[placeholder*="请输入手机号"]',
    'input[name="phone"]',
    'input[placeholder*="phone"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el && el.offsetParent !== null) return true;
  }
  return false;
}

export function isPublishTimeFilterVisible(): boolean {
  try {
    const nodes = document.evaluate("//*[contains(., '发布时间')]", document, null, 7, null);
    for (let i = 0; i < nodes.snapshotLength; i++) {
      const el = nodes.snapshotItem(i) as HTMLElement | null;
      if (!el || el.offsetParent == null) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width >= 8 && rect.height >= 8) return true;
    }
  } catch {}
  return false;
}

export function clickPublishTimeFilterOpener(): boolean {
  try {
    const nodes = document.evaluate("//*[contains(., '发布时间')]", document, null, 7, null);
    for (let i = nodes.snapshotLength - 1; i >= 0; i--) {
      const el = nodes.snapshotItem(i) as HTMLElement | null;
      if (!el || el.offsetParent == null) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if ((el.textContent || '').indexOf('发布时间') === -1) continue;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
      el.focus();
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    }
  } catch {}
  return false;
}

export function clickPublishTimeOption(optionText: string): boolean {
  if (!optionText) return false;
  try {
    const escaped = optionText.replace(/'/g, "''");
    const nodes = document.evaluate(
      "//*[contains(., '" + escaped + "')]",
      document,
      null,
      7,
      null,
    );
    for (let i = nodes.snapshotLength - 1; i >= 0; i--) {
      const el = nodes.snapshotItem(i) as HTMLElement | null;
      if (!el || el.offsetParent == null) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if ((el.textContent || '').indexOf(optionText) === -1) continue;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
      el.focus();
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    }
  } catch {}
  return false;
}

export function scrollToLoadMore(): boolean {
  const h = document.documentElement.scrollHeight || document.body.scrollHeight;
  window.scrollTo(0, h);
  return true;
}

/**
 * 「速填」模式：找到搜索框，原生 setter 写入 keyword，派发 input/change + Enter 三件套。
 * 不模拟鼠标轨迹，毫秒级完成。返回是否成功定位到输入框并触发。
 */
export function searchByInputInPage(keyword: string): boolean {
  const text = keyword == null || keyword === '' ? '' : String(keyword);
  const selectors = [
    '#search-input',
    'input[placeholder*="搜索"]',
    'input[placeholder*="搜"]',
    'input[type="search"]',
    '.search-input input',
    'input[name="keyword"]',
    'input[name="search"]',
    'header input[type="text"]',
    '.input-bar input',
  ];
  let input: HTMLInputElement | null = null;
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (el.offsetParent == null && r.width <= 0) continue;
      input = el;
      break;
    } catch {}
  }
  if (!input) return false;
  input.focus();
  try {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (desc?.set) desc.set.call(input, text);
    else input.value = text;
  } catch {
    input.value = text;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const enterInit: any = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
  input.dispatchEvent(new KeyboardEvent('keydown', enterInit));
  input.dispatchEvent(new KeyboardEvent('keypress', enterInit));
  input.dispatchEvent(new KeyboardEvent('keyup', enterInit));
  return true;
}

/**
 * 「拟人」模式：从随机起点平滑移动鼠标到搜索框 → 双击选中清空 → 逐字键入 → Enter。
 * 移植自 xhs-human-search.js，所有依赖工具内联在函数体内（self-contained），
 * 用于 chrome.scripting.executeScript({ world: 'MAIN' }) 注入。
 *
 * 单次耗时 3-6 秒（鼠标 18-28 步 + 每字 60-180ms 抖动）。
 * 返回 Promise<boolean>：true 表示成功完成 Enter 派发；false 表示未找到搜索框。
 *
 * 注意：必须在 MAIN world 执行，否则拿到的是 isolated 的 HTMLInputElement.prototype，
 * 无法绕过 React 受控组件的 value setter 劫持。
 */
export function runHumanSearch(keyword: string): Promise<boolean> {
  const kw = keyword == null ? '' : String(keyword).trim();
  if (!kw) return Promise.resolve(false);

  const SELECTORS = [
    '#search-input',
    'input[placeholder*="搜索"]',
    'input[placeholder*="搜"]',
    'input[type="search"]',
    '.search-input input',
  ];
  let input: HTMLInputElement | null = null;
  for (const sel of SELECTORS) {
    try {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (el.offsetParent == null && r.width <= 0) continue;
      input = el;
      break;
    } catch {}
  }
  if (!input) return Promise.resolve(false);

  const target = input;

  function rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }
  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
  function setNativeValue(el: HTMLInputElement, v: string): void {
    try {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc?.set) desc.set.call(el, v);
      else el.value = v;
    } catch {
      el.value = v;
    }
  }
  function fire(el: EventTarget, type: string, init: any = {}): void {
    let ev: Event;
    const opts = Object.assign({ bubbles: true, cancelable: true, composed: true }, init);
    if (type.indexOf('key') === 0) ev = new KeyboardEvent(type, opts);
    else if (
      type.indexOf('mouse') === 0 ||
      type === 'click' ||
      type === 'dblclick' ||
      type === 'contextmenu'
    )
      ev = new MouseEvent(type, opts);
    else if (type === 'input' || type === 'beforeinput') ev = new InputEvent(type, opts);
    else ev = new Event(type, opts);
    el.dispatchEvent(ev);
  }

  async function moveMouseTo(el: HTMLElement): Promise<{ x: number; y: number }> {
    const r = el.getBoundingClientRect();
    const endX = r.left + r.width * (0.3 + Math.random() * 0.4);
    const endY = r.top + r.height * (0.4 + Math.random() * 0.2);
    const startX = Math.max(5, endX - rand(180, 360));
    const startY = Math.max(5, endY - rand(80, 220));
    const steps = 18 + Math.floor(Math.random() * 10);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t * t * (3 - 2 * t);
      const x = startX + (endX - startX) * e + (Math.random() - 0.5) * 6;
      const y = startY + (endY - startY) * e + (Math.random() - 0.5) * 6;
      const tgt = document.elementFromPoint(x, y) || document.body;
      fire(tgt, 'mousemove', { clientX: x, clientY: y, button: 0 });
      await sleep(rand(8, 22));
    }
    fire(el, 'mouseover', { clientX: endX, clientY: endY });
    fire(el, 'mouseenter', { clientX: endX, clientY: endY });
    await sleep(rand(60, 140));
    return { x: endX, y: endY };
  }

  function clickOnce(el: HTMLElement, pt: { x: number; y: number }, detail: number): void {
    const init = { clientX: pt.x, clientY: pt.y, button: 0, detail };
    fire(el, 'mousedown', init);
    fire(el, 'mouseup', init);
    fire(el, 'click', init);
  }

  async function doubleClickSelectAll(
    el: HTMLInputElement,
    pt: { x: number; y: number },
  ): Promise<void> {
    clickOnce(el, pt, 1);
    await sleep(rand(60, 140));
    clickOnce(el, pt, 2);
    fire(el, 'dblclick', { clientX: pt.x, clientY: pt.y, button: 0, detail: 2 });
    el.focus();
    try {
      el.setSelectionRange(0, el.value.length);
    } catch {}
    if (el.value) {
      setNativeValue(el, '');
      fire(el, 'input', { inputType: 'deleteContentBackward', data: null });
    }
  }

  async function typeKeyword(el: HTMLInputElement, kw: string): Promise<void> {
    let buf = '';
    for (const ch of kw) {
      fire(el, 'keydown', { key: ch });
      fire(el, 'beforeinput', { inputType: 'insertText', data: ch });
      buf += ch;
      setNativeValue(el, buf);
      fire(el, 'input', { inputType: 'insertText', data: ch });
      fire(el, 'keyup', { key: ch });
      await sleep(rand(60, 180));
    }
  }

  function pressEnter(el: HTMLInputElement): void {
    const init: any = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
    fire(el, 'keydown', init);
    fire(el, 'keypress', init);
    fire(el, 'keyup', init);
  }

  return (async () => {
    try {
      const pt = await moveMouseTo(target);
      await doubleClickSelectAll(target, pt);
      await sleep(rand(150, 280));
      await typeKeyword(target, kw);
      await sleep(rand(280, 560));
      pressEnter(target);
      return true;
    } catch {
      return false;
    }
  })();
}

// ============================================================
// 扫码登录（QR）模式相关：注入到 MAIN world 运行
// ============================================================

/**
 * 尝试把登录弹窗切换到「二维码扫码登录」视图。
 * 小红书 / Rednote 登录框通常顶栏有「短信登录 / 扫码登录」之类的 tab，
 * 也可能本来就直接展示二维码。点不到 tab（比如已经在扫码 tab）也算成功，
 * 真正是否看到二维码交给 findQrImageDataUrl 判定。
 */
export function switchToQrLoginTab(): boolean {
  function isVisible(el: Element | null): el is HTMLElement {
    if (!el || !(el as HTMLElement).getBoundingClientRect) return false;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = window.getComputedStyle(el as HTMLElement);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0)
      return false;
    return true;
  }
  const keywords = ['扫码登录', '二维码登录', '扫码', 'QR', 'qr code', 'QR code'];
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'a, button, li, span, div[role="tab"], [class*="tab"], [class*="Tab"]',
    ),
  );
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const text = (el.textContent || '').replace(/\s+/g, '');
    if (!text) continue;
    if (keywords.some((k) => text.indexOf(k) !== -1)) {
      try {
        el.click();
      } catch {
        try {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        } catch {}
      }
      return true;
    }
  }
  return false;
}

/**
 * 在当前页面上找「看起来像二维码」的 <img> / <canvas>，返回其 base64 dataURL。
 * 启发式：
 *   - 可见 + 接近正方形 + 80~600px
 *   - <img> 优先读 src（若已经是 data: URL 直接返回；否则走 canvas 同源 toDataURL）
 *   - <canvas> 走 toDataURL（可能被跨源污染，用 try/catch 兜底）
 * 找不到返回 ''。
 */
export function findQrImageDataUrl(): string {
  function isVisible(el: Element | null): el is HTMLElement {
    if (!el || !(el as HTMLElement).getBoundingClientRect) return false;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = window.getComputedStyle(el as HTMLElement);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0)
      return false;
    return true;
  }
  function looksSquareQr(w: number, h: number): boolean {
    if (w < 80 || h < 80) return false;
    if (w > 800 || h > 800) return false;
    const diff = Math.abs(w - h);
    return diff <= Math.min(w, h) * 0.15;
  }
  function toDataUrlFromImg(img: HTMLImageElement): string {
    // data:URL：直接返回
    const src = img.currentSrc || img.src || '';
    if (src.startsWith('data:image')) return src;
    // 其他协议：先尝试 canvas 同源重绘
    try {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return '';
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png');
    } catch {
      return '';
    }
  }
  function toDataUrlFromCanvas(c: HTMLCanvasElement): string {
    try {
      return c.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  // canvas 优先（QR 常见实现），其次 img
  const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas'));
  for (const c of canvases) {
    if (!isVisible(c)) continue;
    const r = c.getBoundingClientRect();
    if (!looksSquareQr(r.width, r.height)) continue;
    const url = toDataUrlFromCanvas(c);
    if (url && url.length > 256) return url;
  }

  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
  for (const img of imgs) {
    if (!isVisible(img)) continue;
    const r = img.getBoundingClientRect();
    if (!looksSquareQr(r.width, r.height)) continue;
    const url = toDataUrlFromImg(img);
    if (url && url.length > 256) return url;
  }
  return '';
}

/**
 * 判断当前页面是否阻塞「拉关键词任务」：返回 { block, reason }
 * reason: security_verify | unreachable | reload | login
 */
export function pageShouldBlockKeywordFetch(): { block: boolean; reason?: string } {
  try {
    let href = '';
    try {
      href = typeof location !== 'undefined' && location.href ? String(location.href) : '';
    } catch {}
    if (/captcha|website-login/i.test(href)) return { block: true, reason: 'security_verify' };
    const pageTitle = (document.title || '').trim();
    if (pageTitle.indexOf('安全验证') !== -1) return { block: true, reason: 'security_verify' };
    let blob = '';
    if (document.body) blob += document.body.innerText || '';
    if (document.documentElement) blob += document.documentElement.innerText || '';
    if (document.title) blob += document.title;
    if (blob.indexOf('无法访问此网站') !== -1) return { block: true, reason: 'unreachable' };
    if (blob.indexOf('重新加载') !== -1) return { block: true, reason: 'reload' };
  } catch {}
  function isVisible(el: HTMLElement | null): boolean {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const st = window.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0)
      return false;
    return true;
  }
  const byId = document.getElementById('login-btn');
  if (byId && isVisible(byId)) return { block: true, reason: 'login' };
  const list = document.querySelectorAll<HTMLElement>('.login-btn');
  for (const el of Array.from(list)) {
    if (!isVisible(el)) continue;
    const t = (el.textContent || '').replace(/\s+/g, '');
    if (t.indexOf('登录') !== -1) return { block: true, reason: 'login' };
  }
  return { block: false };
}
