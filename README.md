# xhs data

小红书 / Rednote 内容采集 Chrome 插件（MV3 + Vite + Vue 3 + TypeScript）。

## 技术栈

- **Vite 6** + **@crxjs/vite-plugin**：MV3 构建 / HMR / 动态 manifest
- **Vue 3** + **TypeScript**：侧边栏 UI（含 `useStorageRef` 双向绑定 chrome.storage）
- **Tailwind CSS 3**：样式
- **Vitest 4**：单测（`tests/` 共 47 用例覆盖 url/time/api/account 纯函数）
- **Chrome Extension MV3**：`side_panel` + `background` Service Worker + 双世界 `content_scripts`

## 核心能力

- 拦截 `fetch` / `XHR` 抓取笔记搜索结果（`/search/notes`）与达人主页（`/user_posted`）
- 首屏 `__INITIAL_STATE__` 抽取
- 自动任务循环：拉关键词 → 打开搜索 → 发布时间筛选 → 滚动加载第二页 → 词间随机间隔
- 双登录方式：**短信验证码**（接码链接）+ **扫码登录**（远端代扫，`web_session` 作为账号 ID）
- 多账号轮换 + 每日采集上限（按 sessionHash / accountIndex 独立计数）
- 三种搜索触发模式：**URL 直跳** / **拟人输入** / **速填回车**（按词回退）
- 登录弹窗探测（`MutationObserver`）+ 自动登录 / 自动切换账号
- `chrome.alarms` 长等待恢复点（>25s 词间等待，SW 被回收后能从恢复点续跑）
- 倒计时浮层（任务期间锁定 `workingTabId`，用户切走仍只显示在原 tab）
- 软暂停（`pluginPaused`）：拒绝所有主动任务但保留拦截
- 反检测：`Proxy` 包裹原生 `fetch` / `XHR.prototype.open|send`、`WeakMap` 存元信息、`all_frames: true`、生产构建剔除 `console.*`、操作间隔 ±20% 抖动

## 目录结构

```
src/
├── manifest.ts                # MV3 manifest（@crxjs 动态生成）
├── env.d.ts
│
├── shared/                    # 跨入口共享工具（无 chrome-runtime 强依赖）
│   ├── constants.ts           # API 端点 / storage key / 消息类型 / 模式枚举
│   ├── storage.ts             # chrome.storage.local Promise 封装 + 单订阅分发
│   ├── time.ts                # 发布时间归一化、日期工具
│   ├── sms.ts                 # 验证码提取
│   ├── url.ts                 # 搜索 URL / 登录页 URL 归一化
│   ├── api.ts                 # 后端任务接口 / 回传 URL & body 构造
│   ├── fetch.ts               # 带超时的 fetch 封装
│   ├── pluginKeywordsMerge.ts # 关键词合并 / 去重
│   └── qrSession.ts           # web_session ↔ sessionHash 工具
│
├── types/
│   ├── xhs.ts                 # 小红书接口数据结构类型
│   └── messages.ts            # postMessage / runtime.sendMessage 消息类型
│
├── content/
│   ├── main.ts                # MAIN world：Proxy 包裹 fetch / XHR + __INITIAL_STATE__
│   └── isolate.ts             # ISOLATED world：postMessage→storage、回传、登录弹窗探测、倒计时浮层
│
├── background/
│   ├── index.ts               # 入口：sidePanel 行为 + 消息分发 + alarm 恢复
│   ├── callback.ts            # xhsCallbackFetch（POST 回传，占位 host 拦截）
│   ├── auto-task.ts           # 自动任务循环（拆分为 performPreStartValidation / fetchKeywordsRound / openKeywordUrl / waitBetweenKeywords）
│   ├── auto-login.ts          # SMS 自动登录 / 切换账号
│   ├── qr-login.ts            # 扫码登录（远端代扫 + 二维码内容上送 + 轮询）
│   ├── injected.ts            # 由 chrome.scripting 注入页面 MAIN 的工具函数集
│   └── utils.ts               # tab/storage/cookie/账号配额 等通用工具
│
└── panel/                     # 侧边栏 Vue 应用
    ├── index.html
    ├── main.ts
    ├── App.vue
    ├── style.css              # tailwind + 业务公共样式
    ├── composables/
    │   ├── useStorageRef.ts   # ref ↔ chrome.storage.local 双向同步（单订阅分发）
    │   └── useActiveTabUrl.ts
    ├── services/              # storage 之上的领域服务
    │   ├── accountStore.ts    # 账号列表（含 SMS / QR 双模态）
    │   └── keywordStore.ts    # 关键词列表 + 任务元数据合并
    ├── state/
    │   └── manualExecuteState.ts  # 「手动顺序执行」全局状态
    └── components/
        ├── ApiConfigSection.vue     # 接口 / 搜索页 / 登录页 / API 探针
        ├── AccountSection.vue       # 账号列表 + 批量添加 + 接码测试 + QR 二维码
        ├── AccountActions.vue       # 自动退出 / 手动登录（按 loginMode 分发）
        ├── KeywordSection.vue       # 关键词列表 + 发布时间筛选
        ├── ManualExecuteSection.vue # 手动顺序执行（含已执行去重 + 全局随机间隔）
        ├── AutoTaskSection.vue      # 自动任务控制
        ├── ExecutionLogSection.vue  # 日志面板（ring buffer + 实时广播）
        ├── CollapsibleStep.vue      # 可折叠分步容器
        ├── NoteTable.vue            # 笔记表格
        └── CreatorTable.vue         # 达人表格
```

## 安装与开发

```bash
npm install        # 安装依赖
npm run dev        # 开发模式（带 HMR，加载 dist/ 到 Chrome）
npm run build      # 生产构建（自动 bump version + vue-tsc 类型检查 + vite build）
npm run icons      # 生成多尺寸 png 图标（gen-icons.mjs）
npm run pack       # 把 dist/ 打成 release/<name>-<version>.zip
npm test           # vitest run（一次性跑完）
npm run test:watch # vitest dev 模式
```

加载到 Chrome：

1. `npm run build`
2. 打开 `chrome://extensions`，开启右上角「开发者模式」
3. 点「加载已解压的扩展程序」，选择本仓库的 `dist/` 目录
4. 在小红书 / Rednote 站点页面打开侧边栏即可

> dev 模式下：`npm run dev` 后用「加载已解压」选 `dist/`，更改源码会自动热更新。

## 数据流

```
[页面 MAIN]                [ISOLATED]              [Background SW]              [Side Panel]
fetch/XHR Proxy 拦截  ─►  postMessage  ─►  chrome.runtime.sendMessage    读 storage / sendMessage
__INITIAL_STATE__         写 storage          xhsCallbackFetch (POST)     渲染表格 + 控制按钮
                          回传请求 ──────►   发请求 → 业务方 API           日志 ring buffer 监听
                          登录弹窗探测 ─►    自动登录 / 切换账号 / 续跑
                          二维码内容 ───►    QR 远端代扫 / 轮询登录态
```

- 拦截目标：`/api/sns/web/v1/search/notes`（xiaohongshu / rednote 双站点）、`/api/sns/web/v1/user_posted`
- 持久化：`chrome.storage.local`，最多缓存 50 页（`MAX_PAGES_IN_STORAGE`）
- 回传接口：`POST {apiHost}/xhs_extension/add_xhs_app_search_result`
- 任务接口：`GET {apiHost}/xhs_extension/get_keyword_task`
- 占位 host（`https://your-api.example/`）会被 background 拦截，禁止启动任务 / 回传

## storage key 分组（`src/shared/constants.ts`）

| 分组 | 说明 | 典型 key |
| --- | --- | --- |
| `PERSIST_KEYS` | 用户配置 / 凭据 / 长期业务数据 | `apiHost`、`accountList`、`qrSessionStats`、`pluginSearchKeywords`、`loginMode`、`searchTriggerMode` |
| `RUNTIME_KEYS` | 进程协调状态（需跨 SW 重启恢复） | `autoTaskRunning`、`autoTaskResumeState`、`xhsLoggedIn`、`pluginPaused`、`countdownRemainSec` |
| `TRANSIENT_KEYS` | 瞬态（丢失可容忍） | `searchNotesPages`、`creatorListPages`、`autoTaskLogLine`、`apiLastProbe` |

完整定义见 `STORAGE_KEYS` / `PERSIST_KEYS` / `RUNTIME_KEYS` / `TRANSIENT_KEYS`。

## 关键模式

### 搜索触发模式（`searchTriggerMode`）

| 模式 | 说明 | 失败回退 |
| --- | --- | --- |
| `url` | URL 直跳（默认，最快最稳） | 不回退 |
| `human` | 拟人输入：鼠标轨迹 + 逐字键入 + Enter | 失败 → URL 兜底 |
| `quick` | 速填：直接填值 + 派发 Enter 键 | 失败 → URL 兜底 |

切换在「下一关键词」生效，不打断当前正在执行的关键词。

### 登录模式（`loginMode`）

| 模式 | 账号 ID | 数据来源 |
| --- | --- | --- |
| `sms` | `accountList[index]`（手机号） | 接码链接拉验证码 |
| `qrcode` | `web_session` 的 `sessionHash` | 远端代扫接口（`qrLoginApiUrl`）+ 轮询登录态 |

两种模式独立维护账号列表与每日采集上限。

## 反检测要点

- `window.fetch` / `XHR.prototype.open` / `XHR.prototype.send` 全部用 `Proxy` 包裹，`toString()` 仍含 `[native code]`；`new XMLHttpRequest() instanceof XMLHttpRequest` 保持为 `true`
- XHR 的 `_url` / `_body` 等元信息存到 `WeakMap`，不污染实例（`for...in` 看不到）
- `manifest.content_scripts` 中 MAIN world 注入加 `all_frames: true`，覆盖同源 iframe
- 生产构建 `esbuild.drop = ['console', 'debugger']`，避免 stack 中泄露 `chrome-extension://<id>`
- 关键操作间隔走 `sleepJitter(ms, 0.2)`，±20% 抖动

详见 `docs/2026-04-optimizations.md`。

## 验证清单（手动）

- [ ] 未配置 API host → 启动自动任务被拒，面板提示「未启动（接口未配置）」
- [ ] 未登录 + 未勾选自动登录 → 启动被拒
- [ ] 任务运行中切换浏览器 tab → 倒计时浮层仍出现在**原 tab**
- [ ] 连续多条日志 → 面板全部显示（ring buffer 不漏）
- [ ] 关闭面板再打开 → 看到最近的历史日志
- [ ] 词间等待 ≥ 25s 期间触发 SW 回收 → alarm 唤醒后从恢复点续跑
- [ ] 在小红书 devtools 执行 `window.fetch.toString()` / `XMLHttpRequest.prototype.open.toString()` → 含 `[native code]`

## 注意事项

- 首次安装会把 `apiHost` 默认为 `https://your-api.example/`，**请在侧栏「接口根地址」中改为真实业务地址**，否则 background 会拒绝启动任务并拒绝回传
- 回传走 background SW 发起，规避 CORS 与混合内容问题
- `chrome.scripting` 注入函数限制：函数不能引用闭包外变量，只能传可序列化的 args；`background/injected.ts` 已遵循
- 切换 `loginMode` 前建议先「自动退出」清 cookie，避免残留 `web_session` 让登录态检测出错
