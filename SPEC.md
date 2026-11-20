# 移动端网页小说听书插件架构与开发规范 (NovelTTS-Userscript)

## 1. 需求边界与输入输出 (Scope & I/O)

### 1.1 目标
打造一个免费、无限制、拟人音质、支持移动端息屏连播与自动翻页的网页小说听书油猴脚本，替代商业浏览器需要看广告的听书功能。

### 1.2 核心输入输出
- **输入**：任意移动端网页小说章节页 DOM（HTML 文档）+ 用户交互指令（播放/暂停/语速/音色/切章）。
- **输出**：
  1. 净化后的章节正文分句队列（`string[]`）。
  2. 连续无卡顿的语音音频流（通过原生 `<audio>` 播放，支持系统锁屏 Media Session 控制）。
  3. 悬浮于页面底部的轻量单手操作栏（Shadow DOM 隔离，不污染原网页样式）。

### 1.3 明确不做的事情 (Non-Goals / MVP 边界)
- 不做夸克手机版内部的 Hack/Hook 注入（运行载体为支持油猴脚本的手机浏览器，如 Via / X浏览器 / Edge / Safari+Stay）。
- 不做多端账号同步、云端书架或复杂爬虫书源市场。
- 不引入重型前端 UI 框架，油猴脚本保持轻量极简依赖。

---

## 2. 架构决策记录 (ADR)

| 决策点 | 选定方案 | 权衡依据与替代方案 |
| :--- | :--- | :--- |
| **运行载体** | 油猴脚本 (Userscript, `vite-plugin-monkey` 打包) | 兼容 Android (Via/X浏览器/Edge/Firefox) 与 iOS (Safari+Stay)，零审核成本。 |
| **TTS 引擎** | **主引擎**：Edge TTS (经 Cloudflare Worker 中转返回 MP3)<br>**兜底引擎**：`window.speechSynthesis` | 浏览器端直接 WebSocket 连微软接口存在 `Origin` 头受限及 `Sec-MS-GEC` 令牌校验失败风险；CF Worker 免费版足够个人无限使用，且返回标准音频流便于 `<audio>` 后台保活。断网或 Worker 不可用时自动降级到系统 TTS。 |
| **网络请求** | 油猴端统一使用 `GM_xmlhttpRequest` (`responseType: 'blob'`) | 彻底绕过小说站点的严格 CSP 与 CORS 限制，禁止直接用 `window.fetch` 请求 Worker。 |
| **正文提取** | `@mozilla/readability` + 启发式 DOM 兜底 | 覆盖主流小说站；当 Readability 提取字数 < 100 字时，触发基于最大文本块密度（如 `#content`, `.content`, `#chaptercontent` 等）的兜底提取。 |
| **UI 隔离** | 原生 TypeScript + Shadow DOM | 打包体积小（目标 < 80KB）、加载零延迟，避免与原网页 CSS 冲突。 |
| **后台保活** | 单 `<audio>` 实例复用 + 音频流预取队列 + `Media Session API` + `Wake Lock` | 移动端系统对 `<audio>` 播放流的后台优先级远高于 `speechSynthesis`，配合预取下 2 句消除断句卡顿。 |

---

## 3. 项目目录结构 (Monorepo)

```text
novel-tts-userscript/
├── worker/                     # Cloudflare Worker (Edge TTS 代理)
│   ├── src/index.ts            # 处理 Edge TTS WebSocket/令牌签名，输出 audio/mpeg
│   ├── wrangler.toml           # CF 部署配置
│   └── package.json
├── userscript/                 # 油猴脚本主体
│   ├── src/
│   │   ├── main.ts             # 入口：初始化 Shadow DOM UI 与控制器
│   │   ├── core/
│   │   │   ├── extractor.ts    # 正文提取 + 下一章链接识别 + 预加载解析
│   │   │   ├── chunker.ts      # 按标点切分短句（控制单句 30~120 字）
│   │   │   ├── player.ts       # 状态机 + 音频预取队列 (Prefetch N+1, N+2) + MediaSession
│   │   │   └── tts/
│   │   │       ├── types.ts    # TTSProvider 统一接口
│   │   │       ├── edgeWorker.ts   # 基于 GM_xmlhttpRequest 调用 CF Worker 获取 Blob URL
│   │   │       └── webSpeech.ts    # 浏览器原生兜底实现
│   │   └── ui/
│   │       └── floatingBar.ts  # Shadow DOM 底部悬浮控制条（单手操作优化）
│   ├── tests/                  # Vitest 单元测试
│   ├── vite.config.ts          # vite-plugin-monkey 配置
│   └── package.json
└── SPEC.md
```

---

## 4. 核心接口契约 (Module Contracts)

```ts
export interface ChapterContent {
  title: string;
  paragraphs: string[];
  nextChapterUrl: string | null;
}

export interface TTSOptions {
  voice: string;      // 默认 "zh-CN-XiaoxiaoNeural"
  rate: number;       // 语速倍率 0.5 ~ 2.5，默认 1.2
  signal?: AbortSignal;
}

export interface TTSProvider {
  readonly name: string;
  /** 返回可直接赋给 audio.src 的 Blob URL */
  synthesize(text: string, options: TTSOptions): Promise<string>;
}

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
```

---

## 5. 防御性工程与边界处理 (Defensive Rules)

1. **移动端自动播放解锁**：必须在用户首次点击「播放」按钮的同步调用栈内，解锁单个复用的 `HTMLAudioElement` 实例，后续切句与自动翻页全部复用该实例，严禁动态 `new Audio()`。
2. **内存防泄漏**：每播放完一句立即 `URL.revokeObjectURL(blobUrl)`；预取缓存池大小硬限制为最多 3 条。
3. **Worker 安全鉴权**：Worker 必须校验 `token`（支持环境变量配置 `AUTH_TOKEN`，本地开发默认 `dev-secret`），缺失或错误直接返回 HTTP 401；配置正确的 CORS 响应头。
4. **快速失败与自动降级**：
   - Worker 请求超时 8000ms，单句失败重试 1 次；连续 2 句失败弹出轻量 Toast 并自动切换至 `WebSpeechProvider`。
   - 正文提取为空时立即提示"未识别到小说正文"，禁止静默卡死。
5. **自动翻页防死循环**：记录已播 URL 集合（`Set<string>`），若"下一章"链接指向当前页或已播页，立即停止连播。

---

## 6. 分阶段迭代与验收计划 (Milestones)

### Milestone 1：搭建 Cloudflare Worker Edge TTS 代理
- **目标**：实现 `GET /tts?text=...&voice=...&rate=...&token=...`，正确完成微软 Edge TTS 接口鉴权/签名与 WebSocket 音频拼接，返回 `Content-Type: audio/mpeg` 音频流。
- **验收命令**：
  ```bash
  cd worker && npx wrangler dev --port 8787
  # 另一终端执行：
  curl -i "http://localhost:8787/tts?text=你好测试语音&voice=zh-CN-XiaoxiaoNeural&rate=1.2"
  curl -v "http://localhost:8787/tts?text=你好测试语音&voice=zh-CN-XiaoxiaoNeural&rate=1.2&token=dev-secret" --output test.mp3
  ```
- **预期结果**：无 token 请求返回 HTTP 401；带正确 token 返回 HTTP 200，`test.mp3` 文件大小 > 5KB 且音频头合法可播放。

### Milestone 2：油猴脚本骨架 + 正文提取与分句引擎
- **目标**：初始化 `vite-plugin-monkey` 项目，实现 `extractor.ts`（含下一章正则匹配 `下一章|下一页|下页`）与 `chunker.ts`（按 `。！？；\n` 切分，合并过短句、拆分超长句）。
- **验收命令**：`cd userscript && npm test`
- **预期结果**：Vitest 单测全部通过（覆盖 3 种常见小说网页 DOM 样本、下一章 URL 提取、长短句边界测试）。

### Milestone 3：核心播放器 + 预取队列 + Media Session
- **目标**：实现 `player.ts`（单 `<audio>` 复用、N+1/N+2 预取、Blob URL 释放、锁屏控制、失败自动降级 WebSpeech）。
- **验收命令**：`cd userscript && npm test && npm run build`
- **预期结果**：状态机与预取队列单测全部通过；成功打包产出 `dist/novel-tts.user.js` 且无 TS 报错。

### Milestone 4：Shadow DOM 悬浮 UI + 自动下一章无缝连播
- **目标**：实现移动端单手悬浮条（折叠态半透明圆球；展开态含播放/暂停、语速 `1.0x/1.2x/1.5x/2.0x`、音色选择、Worker 地址与 Token 配置、下一章按钮）；接入 `GM_xmlhttpRequest` 静默预拉取下一章并自动续播。
- **验收标准**：打包无报错，桌面端模拟移动端与真机油猴环境实测可连续跨章播放、锁屏控制正常。
