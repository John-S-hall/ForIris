import type { AppConfig, ReaderSettings, ReaderTheme } from '../core/storage';
import type { StructuredChunk } from '../core/chunker';
import type { ConnectionTestResult } from '../core/tts/edgeWorker';
import type { ChapterContent, PlayerState } from '../core/tts/types';
import {
  SVG_PAUSE_PATH,
  SVG_PLAY_PATH,
  buildVoiceOptionsHtml,
  executeConnectionTest,
  getNextRate,
} from './sharedControls';

export interface ReaderViewEvents {
  onClose: () => void;
  onPlayToggle: () => void;
  onStop: () => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onSeekSentence: (chunkIndex: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onRateChange: (rate: number) => void;
  onVoiceChange: (voice: string) => void;
  onSaveConfig: (workerUrl: string, token: string) => void;
  onTestConfig: (workerUrl: string, token: string) => Promise<ConnectionTestResult>;
  onJumpChapterUrl: (url: string) => void;
  onSettingsChange: (patch: Partial<ReaderSettings>) => void;
  onToast?: (message: string) => void;
}

type DockSubpanel = 'none' | 'appearance' | 'tts' | 'worker';

const USER_SCROLL_PROTECT_MS = 4000;
const LINE_HEIGHT_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1.6, label: '紧凑' },
  { value: 1.85, label: '适中' },
  { value: 2.1, label: '宽松' },
];
const THEME_PRESETS: ReadonlyArray<{ value: ReaderTheme; label: string; swatch: string }> = [
  { value: 'light', label: '日间', swatch: '#ffffff' },
  { value: 'sepia', label: '羊皮纸', swatch: '#f4ecd8' },
  { value: 'green', label: '护眼绿', swatch: '#cce8cf' },
  { value: 'dark', label: '夜间', swatch: '#141923' },
];

/**
 * 仿夸克浏览器的上下滚动精简版阅读模式（Shadow DOM 完全隔离）
 */
export class ReaderView {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private events: ReaderViewEvents;

  private settings: ReaderSettings;
  private currentRate: number;
  private playerState: PlayerState = 'idle';
  private activeChunkIndex = -1;
  private totalChunks = 0;
  private currentChapterUrl: string | null = null;
  private hasPrevChapter = false;
  private hasNextChapter = false;
  private isChapterLoading = false;

  private opened = false;
  private isMenuOpen = false;
  private activeSubpanel: DockSubpanel = 'none';

  // 原网页滚动锁定备份
  private savedHtmlOverflow: string | null = null;
  private savedBodyOverflow: string | null = null;

  // 手动滑动保护与双击识别
  private lastUserScrollAt = 0;
  private programmaticScrollUntil = 0;
  private lastTapChunkIdx = -1;
  private lastTapAt = 0;
  private singleTapTimer: ReturnType<typeof setTimeout> | null = null;

  // DOM 引用
  private rootEl!: HTMLElement;
  private scrollEl!: HTMLElement;
  private statusTitleEl!: HTMLElement;
  private statusProgressEl!: HTMLElement;
  private articleTitleEl!: HTMLElement;
  private articleBodyEl!: HTMLElement;
  private footerPrevBtn!: HTMLButtonElement;
  private footerNextBtn!: HTMLButtonElement;
  private relocateBtn!: HTMLButtonElement;

  private miniBarEl!: HTMLElement;
  private miniPlayBtn!: HTMLButtonElement;
  private miniPlayIcon!: SVGElement;
  private miniProgressEl!: HTMLElement;

  private topBarEl!: HTMLElement;
  private topTitleEl!: HTMLElement;
  private jumpBtn!: HTMLButtonElement;

  private bottomDockEl!: HTMLElement;
  private panelAppearanceEl!: HTMLElement;
  private panelTtsEl!: HTMLElement;
  private panelWorkerEl!: HTMLElement;

  private fontValEl!: HTMLElement;
  private autoEnterInput!: HTMLInputElement;

  private ttsProgressEl!: HTMLElement;
  private ttsPlayBtn!: HTMLButtonElement;
  private ttsPlayIcon!: SVGElement;
  private rateBtn!: HTMLButtonElement;
  private voiceSelect!: HTMLSelectElement;

  private workerInput!: HTMLInputElement;
  private tokenInput!: HTMLInputElement;
  private testBtn!: HTMLButtonElement;
  private testResultEl!: HTMLElement;

  private dockPrevChBtn!: HTMLButtonElement;
  private dockTtsBtn!: HTMLButtonElement;
  private dockAppearanceBtn!: HTMLButtonElement;
  private dockNextChBtn!: HTMLButtonElement;

  constructor(config: AppConfig, events: ReaderViewEvents) {
    this.events = events;
    this.settings = { ...config.reader };
    this.currentRate = config.rate;

    this.host = document.createElement('novel-tts-reader-host');
    this.host.id = 'novel-tts-reader-root';
    this.applyHostStyles();
    this.shadow = this.host.attachShadow({ mode: 'open' });

    this.render(config);
    this.applySettings(this.settings);
    this.bindEvents();
  }

  private applyHostStyles(): void {
    this.host.style.setProperty('position', 'fixed', 'important');
    this.host.style.setProperty('inset', '0', 'important');
    this.host.style.setProperty('z-index', '2147483645', 'important');
    this.host.style.setProperty('display', 'none', 'important');
    this.host.style.setProperty('margin', '0', 'important');
    this.host.style.setProperty('padding', '0', 'important');
    this.host.style.setProperty('border', '0', 'important');
    this.host.style.setProperty('background', 'transparent', 'important');
  }

  mount(parent?: HTMLElement): void {
    const target = parent || document.documentElement || document.body;
    if (target && !target.contains(this.host)) {
      target.appendChild(this.host);
    }
  }

  unmount(): void {
    this.clearSingleTapTimer();
    this.restorePageOverflow();
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
  }

  isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.mount();

    if (typeof document !== 'undefined') {
      this.savedHtmlOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (document.body) {
        this.savedBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
    }

    this.host.style.setProperty('display', 'block', 'important');
    this.setMenuOpen(false);
    this.updateScrollStatus();
    this.updateRelocateVisibility();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.clearSingleTapTimer();
    this.setMenuOpen(false);
    this.host.style.setProperty('display', 'none', 'important');
    this.restorePageOverflow();
  }

  private restorePageOverflow(): void {
    if (typeof document === 'undefined') return;
    if (this.savedHtmlOverflow !== null) {
      document.documentElement.style.overflow = this.savedHtmlOverflow;
      this.savedHtmlOverflow = null;
    }
    if (this.savedBodyOverflow !== null && document.body) {
      document.body.style.overflow = this.savedBodyOverflow;
      this.savedBodyOverflow = null;
    }
  }

  private clearSingleTapTimer(): void {
    if (this.singleTapTimer !== null) {
      clearTimeout(this.singleTapTimer);
      this.singleTapTimer = null;
    }
    this.lastTapChunkIdx = -1;
    this.lastTapAt = 0;
  }

  private notifyToast(message: string): void {
    this.events.onToast?.(message);
  }

  // ─── 章节渲染与状态同步 ────────────────────────────────────────────────

  renderChapter(
    chapter: ChapterContent,
    chunks: StructuredChunk[],
    chapterUrl?: string
  ): void {
    const title = chapter.title || '正文阅读';
    this.statusTitleEl.textContent = title;
    this.topTitleEl.textContent = title;
    this.articleTitleEl.textContent = title;

    this.currentChapterUrl = chapterUrl || null;
    this.jumpBtn.style.display = chapterUrl ? 'inline-flex' : 'none';

    this.hasPrevChapter = Boolean(chapter.prevChapterUrl);
    this.hasNextChapter = Boolean(chapter.nextChapterUrl);
    this.updateChapterButtonsDisabled();

    this.totalChunks = chunks.length;
    this.activeChunkIndex = -1;
    this.lastUserScrollAt = 0;

    // 按段落索引分组 chunk 片段
    const segmentsByParagraph = new Map<number, Array<{ chunkIndex: number; text: string }>>();
    for (const chunk of chunks) {
      for (const seg of chunk.segments) {
        let list = segmentsByParagraph.get(seg.paragraphIndex);
        if (!list) {
          list = [];
          segmentsByParagraph.set(seg.paragraphIndex, list);
        }
        list.push({ chunkIndex: chunk.index, text: seg.text });
      }
    }

    const fragment = document.createDocumentFragment();
    chapter.paragraphs.forEach((paraText, pIdx) => {
      const pEl = document.createElement('p');
      pEl.className = 'reader-p';
      const segs = segmentsByParagraph.get(pIdx);
      if (segs && segs.length > 0) {
        for (const seg of segs) {
          const span = document.createElement('span');
          span.className = 'reader-sentence';
          span.setAttribute('data-chunk-index', String(seg.chunkIndex));
          span.textContent = seg.text;
          pEl.appendChild(span);
        }
      } else {
        pEl.textContent = paraText;
      }
      fragment.appendChild(pEl);
    });

    this.articleBodyEl.replaceChildren(fragment);

    // 新章节滚回顶部
    this.programmaticScrollUntil = Date.now() + 300;
    this.scrollEl.scrollTop = 0;
    this.updateScrollStatus();
    this.updateRelocateVisibility();
  }

  setActiveChunk(index: number): void {
    this.activeChunkIndex = index;

    const prevActives = this.articleBodyEl.querySelectorAll('.reader-sentence.active');
    prevActives.forEach((el) => el.classList.remove('active'));

    if (index < 0) {
      this.updateRelocateVisibility();
      this.updateScrollStatus();
      return;
    }

    const targets = this.articleBodyEl.querySelectorAll(
      `.reader-sentence[data-chunk-index="${index}"]`
    );
    targets.forEach((el) => el.classList.add('active'));

    const firstEl = targets[0] as HTMLElement | undefined;
    if (firstEl && Date.now() - this.lastUserScrollAt > USER_SCROLL_PROTECT_MS) {
      this.scrollToSentenceEl(firstEl);
    }

    this.updateScrollStatus();
    this.updateRelocateVisibility();
  }

  private scrollToSentenceEl(el: HTMLElement): void {
    const scrollRect = this.scrollEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (scrollRect.height <= 0) {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        // jsdom 忽略
      }
      return;
    }

    const offsetTop = elRect.top - scrollRect.top + this.scrollEl.scrollTop;
    const targetTop = Math.max(0, offsetTop - scrollRect.height * 0.38);
    this.programmaticScrollUntil = Date.now() + 700;

    if (typeof this.scrollEl.scrollTo === 'function') {
      try {
        this.scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' });
      } catch {
        this.scrollEl.scrollTop = targetTop;
      }
    } else {
      this.scrollEl.scrollTop = targetTop;
    }
  }

  setChapterLoading(loading: boolean): void {
    this.isChapterLoading = loading;
    this.updateChapterButtonsDisabled();
  }

  private updateChapterButtonsDisabled(): void {
    const prevDisabled = this.isChapterLoading || !this.hasPrevChapter;
    const nextDisabled = this.isChapterLoading || !this.hasNextChapter;
    this.footerPrevBtn.disabled = prevDisabled;
    this.dockPrevChBtn.disabled = prevDisabled;
    this.footerNextBtn.disabled = nextDisabled;
    this.dockNextChBtn.disabled = nextDisabled;
  }

  updatePlayerState(state: PlayerState): void {
    this.playerState = state;
    const playIconPath = state === 'playing' ? SVG_PAUSE_PATH : SVG_PLAY_PATH;
    const playLabel = state === 'playing' ? '暂停' : state === 'loading' ? '加载中…' : '播放';

    this.miniPlayIcon.innerHTML = playIconPath;
    this.miniPlayBtn.title = playLabel;
    this.ttsPlayIcon.innerHTML = playIconPath;
    this.ttsPlayBtn.title = playLabel;

    this.dockTtsBtn.classList.toggle('is-playing', this.isTtsActive());
    this.updateMiniBarVisibility();
    this.updateScrollStatus();
    this.updateRelocateVisibility();
  }

  updateProgress(index: number, total: number): void {
    this.totalChunks = total;
    const text = total > 0 ? `${index + 1} / ${total}` : '0 / 0';
    this.miniProgressEl.textContent = text;
    this.ttsProgressEl.textContent = total > 0 ? `第 ${index + 1} / ${total} 句` : '0 / 0';
    this.updateScrollStatus();
  }

  syncRate(rate: number): void {
    this.currentRate = rate;
    this.rateBtn.textContent = `${rate.toFixed(1)}x`;
  }

  syncVoice(voice: string): void {
    this.voiceSelect.value = voice;
  }

  syncConfigInputs(workerUrl: string, token: string): void {
    this.workerInput.value = workerUrl;
    this.tokenInput.value = token;
  }

  applySettings(settings: ReaderSettings): void {
    this.settings = { ...settings };
    this.rootEl.setAttribute('data-theme', settings.theme);
    this.rootEl.style.setProperty('--reader-font-size', `${settings.fontSize}px`);
    this.rootEl.style.setProperty('--reader-line-height', String(settings.lineHeight));

    this.fontValEl.textContent = `${settings.fontSize}px`;
    this.autoEnterInput.checked = Boolean(settings.autoEnter);

    this.shadow.querySelectorAll<HTMLElement>('[data-theme-opt]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeOpt === settings.theme);
    });
    this.shadow.querySelectorAll<HTMLElement>('[data-line-height]').forEach((btn) => {
      const val = Number.parseFloat(btn.dataset.lineHeight || '0');
      btn.classList.toggle('active', Math.abs(val - settings.lineHeight) < 0.05);
    });
  }

  private isTtsActive(): boolean {
    return (
      this.playerState === 'playing' ||
      this.playerState === 'loading' ||
      this.playerState === 'paused'
    );
  }

  private updateMiniBarVisibility(): void {
    const show = this.isTtsActive() && !this.isMenuOpen;
    this.miniBarEl.classList.toggle('visible', show);
  }

  private updateScrollStatus(): void {
    if (this.isTtsActive() && this.totalChunks > 0 && this.activeChunkIndex >= 0) {
      this.statusProgressEl.textContent = `🔊 ${this.activeChunkIndex + 1} / ${this.totalChunks}`;
      return;
    }

    const maxScroll = Math.max(0, this.scrollEl.scrollHeight - this.scrollEl.clientHeight);
    if (maxScroll <= 0) {
      this.statusProgressEl.textContent = '0%';
      return;
    }
    const pct = Math.max(
      0,
      Math.min(100, Math.round((this.scrollEl.scrollTop / maxScroll) * 100))
    );
    this.statusProgressEl.textContent = `${pct}%`;
  }

  private updateRelocateVisibility(): void {
    if (!this.isTtsActive() || this.activeChunkIndex < 0) {
      this.relocateBtn.classList.remove('visible');
      return;
    }

    const activeEl = this.articleBodyEl.querySelector(
      `.reader-sentence[data-chunk-index="${this.activeChunkIndex}"]`
    ) as HTMLElement | null;
    if (!activeEl) {
      this.relocateBtn.classList.remove('visible');
      return;
    }

    const scrollRect = this.scrollEl.getBoundingClientRect();
    if (scrollRect.height <= 0) {
      this.relocateBtn.classList.remove('visible');
      return;
    }

    const elRect = activeEl.getBoundingClientRect();
    const outOfView = elRect.bottom < scrollRect.top + 36 || elRect.top > scrollRect.bottom - 36;
    this.relocateBtn.classList.toggle('visible', outOfView);
  }

  private setMenuOpen(open: boolean, initialPanel: DockSubpanel = 'none'): void {
    this.isMenuOpen = open;
    this.topBarEl.classList.toggle('open', open);
    this.bottomDockEl.classList.toggle('open', open);
    this.setSubpanel(open ? initialPanel : 'none');
    this.updateMiniBarVisibility();
  }

  private setSubpanel(panel: DockSubpanel): void {
    this.activeSubpanel = panel;
    this.panelAppearanceEl.classList.toggle('open', panel === 'appearance');
    this.panelTtsEl.classList.toggle('open', panel === 'tts');
    this.panelWorkerEl.classList.toggle('open', panel === 'worker');

    this.dockAppearanceBtn.classList.toggle('active', panel === 'appearance');
    this.dockTtsBtn.classList.toggle('active', panel === 'tts');
  }

  private updateSettings(patch: Partial<ReaderSettings>): void {
    const next: ReaderSettings = { ...this.settings, ...patch };
    this.applySettings(next);
    this.events.onSettingsChange(patch);
  }

  // ─── DOM 渲染 ──────────────────────────────────────────────────────────

  private render(config: AppConfig): void {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Segoe UI", Roboto, sans-serif;
        -webkit-tap-highlight-color: transparent;
      }

      .reader-root {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        background: var(--bg);
        color: var(--text);
        --reader-font-size: 18px;
        --reader-line-height: 1.85;
      }

      /* 4 套夸克风格主题 */
      .reader-root[data-theme="light"] {
        --bg: #f8fafc;
        --surface: #ffffff;
        --dock-bg: rgba(255, 255, 255, 0.96);
        --text: #1e293b;
        --muted: #64748b;
        --border: rgba(15, 23, 42, 0.1);
        --hl-bg: rgba(14, 165, 233, 0.2);
        --hl-text: #0f172a;
        --accent: #0284c7;
        --btn-bg: rgba(15, 23, 42, 0.06);
      }
      .reader-root[data-theme="sepia"] {
        --bg: #f4ecd8;
        --surface: #efe4c8;
        --dock-bg: rgba(246, 238, 218, 0.96);
        --text: #3d3122;
        --muted: #7c6950;
        --border: rgba(61, 49, 34, 0.12);
        --hl-bg: rgba(217, 119, 6, 0.22);
        --hl-text: #291f14;
        --accent: #b45309;
        --btn-bg: rgba(61, 49, 34, 0.08);
      }
      .reader-root[data-theme="green"] {
        --bg: #cce8cf;
        --surface: #d8efd9;
        --dock-bg: rgba(212, 238, 215, 0.96);
        --text: #1e3322;
        --muted: #4b6950;
        --border: rgba(30, 51, 34, 0.12);
        --hl-bg: rgba(16, 185, 129, 0.26);
        --hl-text: #0f2414;
        --accent: #059669;
        --btn-bg: rgba(30, 51, 34, 0.08);
      }
      .reader-root[data-theme="dark"] {
        --bg: #12151c;
        --surface: #1a1f29;
        --dock-bg: rgba(20, 25, 36, 0.96);
        --text: #cbd5e1;
        --muted: #64748b;
        --border: rgba(255, 255, 255, 0.1);
        --hl-bg: rgba(56, 189, 248, 0.22);
        --hl-text: #f8fafc;
        --accent: #38bdf8;
        --btn-bg: rgba(255, 255, 255, 0.08);
      }

      /* 顶部常驻极简微状态栏 */
      .status-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: calc(30px + env(safe-area-inset-top, 0px));
        padding: env(safe-area-inset-top, 0px) 18px 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 11px;
        color: var(--muted);
        background: var(--bg);
        z-index: 2;
        pointer-events: none;
        box-sizing: border-box;
      }
      .status-title {
        min-width: 0;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .status-progress {
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }

      /* 竖向滚动正文区 */
      .reader-scroll {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: manipulation;
      }
      .reader-article {
        max-width: 720px;
        margin: 0 auto;
        padding: calc(44px + env(safe-area-inset-top, 0px)) 20px calc(110px + env(safe-area-inset-bottom, 0px));
        box-sizing: border-box;
      }
      .reader-chapter-title {
        font-size: calc(var(--reader-font-size) + 4px);
        line-height: 1.4;
        font-weight: 700;
        margin: 0 0 22px;
        color: var(--hl-text);
      }
      .reader-p {
        margin: 0 0 0.85em;
        font-size: var(--reader-font-size);
        line-height: var(--reader-line-height);
        text-indent: 2em;
        word-break: break-word;
      }
      .reader-sentence {
        border-radius: 3px;
        transition: background-color 0.2s, color 0.2s;
      }
      .reader-sentence.active {
        background: var(--hl-bg);
        color: var(--hl-text);
        box-shadow: 0 0 0 2px var(--hl-bg);
      }

      /* 章节底部上下章翻页按钮 */
      .reader-footer-nav {
        display: flex;
        gap: 12px;
        margin-top: 32px;
        padding-top: 20px;
        border-top: 1px solid var(--border);
      }
      .footer-nav-btn {
        flex: 1;
        height: 44px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--btn-bg);
        color: var(--text);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .footer-nav-btn.primary {
        border-color: var(--accent);
        color: var(--accent);
      }
      .footer-nav-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      /* 回到朗读处浮动胶囊 */
      .relocate-btn {
        position: fixed;
        right: 16px;
        bottom: calc(74px + env(safe-area-inset-bottom, 0px));
        padding: 7px 12px;
        border-radius: 18px;
        border: 1px solid var(--accent);
        background: var(--dock-bg);
        color: var(--accent);
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transform: translateY(8px);
        transition: opacity 0.2s, transform 0.2s;
        z-index: 4;
      }
      .relocate-btn.visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }

      /* 迷你底部听书栏 (无正文文字预览，仅控播与进度) */
      .mini-tts-bar {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: calc(10px + env(safe-area-inset-bottom, 0px));
        height: 48px;
        padding: 0 12px;
        border-radius: 24px;
        background: var(--dock-bg);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--border);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        z-index: 4;
        box-sizing: border-box;
      }
      .mini-tts-bar.visible {
        display: flex;
      }
      .mini-controls {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mini-btn {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: none;
        background: var(--btn-bg);
        color: var(--text);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .mini-btn.primary {
        background: var(--accent);
        color: #ffffff;
      }
      .mini-btn svg {
        fill: currentColor;
      }
      .mini-progress {
        font-size: 12px;
        color: var(--muted);
        font-variant-numeric: tabular-nums;
      }

      /* 仿夸克滑出顶栏 */
      .top-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px;
        background: var(--dock-bg);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        transform: translateY(-105%);
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 6;
        box-sizing: border-box;
      }
      .top-bar.open {
        transform: translateY(0);
      }
      .top-title {
        flex: 1;
        min-width: 0;
        text-align: center;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bar-text-btn {
        border: none;
        background: none;
        color: var(--text);
        font-size: 13px;
        padding: 5px 8px;
        border-radius: 6px;
        cursor: pointer;
        flex-shrink: 0;
      }
      .bar-text-btn.accent {
        color: var(--accent);
        background: var(--btn-bg);
        font-size: 12px;
      }

      /* 仿夸克滑出底栏 */
      .bottom-dock {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
        background: var(--dock-bg);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border-top: 1px solid var(--border);
        box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.18);
        transform: translateY(105%);
        transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 6;
        box-sizing: border-box;
      }
      .bottom-dock.open {
        transform: translateY(0);
      }

      .subpanel {
        display: none;
        padding-bottom: 12px;
        margin-bottom: 10px;
        border-bottom: 1px solid var(--border);
      }
      .subpanel.open {
        display: block;
      }

      /* 排版设置行 */
      .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      .setting-row:last-child {
        margin-bottom: 0;
      }
      .setting-label {
        font-size: 12px;
        color: var(--muted);
        flex-shrink: 0;
      }
      .btn-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        justify-content: flex-end;
      }
      .pill-btn {
        border: 1px solid var(--border);
        background: var(--btn-bg);
        color: var(--text);
        font-size: 12px;
        padding: 5px 12px;
        border-radius: 14px;
        cursor: pointer;
      }
      .pill-btn.active {
        border-color: var(--accent);
        color: var(--accent);
        font-weight: 600;
      }
      .font-val {
        font-size: 13px;
        min-width: 40px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .theme-swatch {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 9px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--btn-bg);
        color: var(--text);
        font-size: 11px;
        cursor: pointer;
      }
      .theme-swatch.active {
        border-color: var(--accent);
        color: var(--accent);
        font-weight: 600;
      }
      .swatch-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(128, 128, 128, 0.35);
      }
      .switch-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text);
        cursor: pointer;
      }

      /* 听书设置子面板 (无正文预览框) */
      .tts-info-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 10px;
      }
      .tts-controls-row {
        display: flex;
        align-items: center;
        justify-content: space-around;
        margin-bottom: 10px;
      }
      .tts-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: var(--btn-bg);
        color: var(--text);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .tts-btn.primary {
        width: 50px;
        height: 50px;
        background: var(--accent);
        color: #ffffff;
      }
      .tts-btn svg {
        fill: currentColor;
      }
      .tts-params-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .voice-select {
        background: var(--btn-bg);
        border: 1px solid var(--border);
        color: var(--text);
        font-size: 12px;
        padding: 5px 8px;
        border-radius: 8px;
        outline: none;
        max-width: 135px;
      }
      .voice-select option {
        background: var(--surface);
        color: var(--text);
      }

      /* Worker 配置子面板 */
      .field {
        margin-bottom: 8px;
      }
      .field label {
        display: block;
        font-size: 11px;
        color: var(--muted);
        margin-bottom: 4px;
      }
      .field input {
        width: 100%;
        box-sizing: border-box;
        background: var(--btn-bg);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 6px 10px;
        color: var(--text);
        font-size: 12px;
        outline: none;
      }
      .worker-btn-row {
        display: flex;
        gap: 8px;
      }
      .save-btn {
        flex: 1;
        background: var(--accent);
        color: #ffffff;
        border: none;
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .test-btn {
        flex: 1;
        background: var(--btn-bg);
        color: var(--accent);
        border: 1px solid var(--accent);
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .test-result {
        display: none;
        margin-top: 8px;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.4;
      }
      .test-result.success {
        display: block;
        background: rgba(34, 197, 94, 0.15);
        border: 1px solid rgba(34, 197, 94, 0.35);
        color: #16a34a;
      }
      .test-result.error {
        display: block;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.35);
        color: #dc2626;
      }

      /* 底层 4 键主操作栏 */
      .dock-actions {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }
      .dock-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 6px 4px;
        border: none;
        border-radius: 8px;
        background: none;
        color: var(--text);
        font-size: 11px;
        cursor: pointer;
      }
      .dock-btn.active,
      .dock-btn.is-playing {
        color: var(--accent);
        font-weight: 600;
      }
      .dock-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
    `;

    const lineHeightButtonsHtml = LINE_HEIGHT_PRESETS.map(
      (p) =>
        `<button class="pill-btn" data-line-height="${p.value}">${p.label} (${p.value})</button>`
    ).join('');

    const themeButtonsHtml = THEME_PRESETS.map(
      (t) =>
        `<button class="theme-swatch" data-theme-opt="${t.value}"><span class="swatch-dot" style="background:${t.swatch}"></span><span>${t.label}</span></button>`
    ).join('');

    const root = document.createElement('div');
    root.className = 'reader-root';
    root.innerHTML = `
      <div class="status-header">
        <span class="status-title" id="rv-status-title">阅读模式</span>
        <span class="status-progress" id="rv-status-progress">0%</span>
      </div>

      <div class="reader-scroll" id="rv-scroll">
        <article class="reader-article">
          <h1 class="reader-chapter-title" id="rv-article-title"></h1>
          <div class="reader-body" id="rv-article-body"></div>
          <div class="reader-footer-nav">
            <button class="footer-nav-btn" id="rv-footer-prev">上一章</button>
            <button class="footer-nav-btn primary" id="rv-footer-next">下一章</button>
          </div>
        </article>
      </div>

      <button class="relocate-btn" id="rv-relocate">回到朗读处</button>

      <div class="mini-tts-bar" id="rv-mini-bar">
        <div class="mini-controls">
          <button class="mini-btn" id="rv-mini-prev" title="上一句">
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button class="mini-btn primary" id="rv-mini-play" title="播放/暂停">
            <svg width="18" height="18" viewBox="0 0 24 24" id="rv-mini-play-icon">${SVG_PLAY_PATH}</svg>
          </button>
          <button class="mini-btn" id="rv-mini-next" title="下一句">
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>
        <span class="mini-progress" id="rv-mini-progress">0 / 0</span>
        <button class="mini-btn" id="rv-mini-menu" title="展开菜单">
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
        </button>
      </div>

      <div class="top-bar" id="rv-top-bar">
        <button class="bar-text-btn" id="rv-exit">← 退出阅读</button>
        <span class="top-title" id="rv-top-title">阅读模式</span>
        <button class="bar-text-btn accent" id="rv-jump" style="display:none">查看原文</button>
        <button class="bar-text-btn" id="rv-top-worker" title="配置 Worker">⚙️</button>
      </div>

      <div class="bottom-dock" id="rv-bottom-dock">
        <div class="subpanel" id="rv-panel-appearance">
          <div class="setting-row">
            <span class="setting-label">字号</span>
            <div class="btn-group">
              <button class="pill-btn" id="rv-font-dec">A-</button>
              <span class="font-val" id="rv-font-val">18px</span>
              <button class="pill-btn" id="rv-font-inc">A+</button>
            </div>
          </div>
          <div class="setting-row">
            <span class="setting-label">行距</span>
            <div class="btn-group">${lineHeightButtonsHtml}</div>
          </div>
          <div class="setting-row">
            <span class="setting-label">背景</span>
            <div class="btn-group">${themeButtonsHtml}</div>
          </div>
          <div class="setting-row">
            <span class="setting-label">偏好</span>
            <label class="switch-label">
              <input type="checkbox" id="rv-auto-enter" />
              <span>打开小说页自动进入阅读模式</span>
            </label>
          </div>
        </div>

        <div class="subpanel" id="rv-panel-tts">
          <div class="tts-info-row">
            <span id="rv-tts-progress">0 / 0</span>
            <span>双击正文任意句可从该处朗读</span>
          </div>
          <div class="tts-controls-row">
            <button class="tts-btn" id="rv-tts-prev" title="上一句">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button class="tts-btn primary" id="rv-tts-play" title="播放/暂停">
              <svg width="24" height="24" viewBox="0 0 24 24" id="rv-tts-play-icon">${SVG_PLAY_PATH}</svg>
            </button>
            <button class="tts-btn" id="rv-tts-next" title="下一句">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
            <button class="tts-btn" id="rv-tts-stop" title="停止朗读">
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
            </button>
          </div>
          <div class="tts-params-row">
            <button class="pill-btn" id="rv-rate">${config.rate.toFixed(1)}x</button>
            <select class="voice-select" id="rv-voice">${buildVoiceOptionsHtml()}</select>
            <button class="pill-btn" id="rv-open-worker">Worker配置</button>
          </div>
        </div>

        <div class="subpanel" id="rv-panel-worker">
          <div class="field">
            <label>Edge TTS Worker 地址 (URL)</label>
            <input type="text" id="rv-worker-url" placeholder="https://xxx.workers.dev 或 http://localhost:8787" />
          </div>
          <div class="field">
            <label>Worker 鉴权密钥 (Token，默认 dev-secret)</label>
            <input type="text" id="rv-token" placeholder="dev-secret" />
          </div>
          <div class="worker-btn-row">
            <button class="save-btn" id="rv-save-config">保存配置</button>
            <button class="test-btn" id="rv-test-config">测试连接</button>
          </div>
          <div class="test-result" id="rv-test-result"></div>
        </div>

        <div class="dock-actions">
          <button class="dock-btn" id="rv-dock-prev-ch">上一章</button>
          <button class="dock-btn" id="rv-dock-tts">听书</button>
          <button class="dock-btn" id="rv-dock-appearance">设置</button>
          <button class="dock-btn" id="rv-dock-next-ch">下一章</button>
        </div>
      </div>
    `;

    this.shadow.appendChild(style);
    this.shadow.appendChild(root);

    this.rootEl = root;
    this.scrollEl = this.shadow.querySelector('#rv-scroll')!;
    this.statusTitleEl = this.shadow.querySelector('#rv-status-title')!;
    this.statusProgressEl = this.shadow.querySelector('#rv-status-progress')!;
    this.articleTitleEl = this.shadow.querySelector('#rv-article-title')!;
    this.articleBodyEl = this.shadow.querySelector('#rv-article-body')!;
    this.footerPrevBtn = this.shadow.querySelector('#rv-footer-prev')!;
    this.footerNextBtn = this.shadow.querySelector('#rv-footer-next')!;
    this.relocateBtn = this.shadow.querySelector('#rv-relocate')!;

    this.miniBarEl = this.shadow.querySelector('#rv-mini-bar')!;
    this.miniPlayBtn = this.shadow.querySelector('#rv-mini-play')!;
    this.miniPlayIcon = this.shadow.querySelector('#rv-mini-play-icon')! as SVGElement;
    this.miniProgressEl = this.shadow.querySelector('#rv-mini-progress')!;

    this.topBarEl = this.shadow.querySelector('#rv-top-bar')!;
    this.topTitleEl = this.shadow.querySelector('#rv-top-title')!;
    this.jumpBtn = this.shadow.querySelector('#rv-jump')!;

    this.bottomDockEl = this.shadow.querySelector('#rv-bottom-dock')!;
    this.panelAppearanceEl = this.shadow.querySelector('#rv-panel-appearance')!;
    this.panelTtsEl = this.shadow.querySelector('#rv-panel-tts')!;
    this.panelWorkerEl = this.shadow.querySelector('#rv-panel-worker')!;

    this.fontValEl = this.shadow.querySelector('#rv-font-val')!;
    this.autoEnterInput = this.shadow.querySelector('#rv-auto-enter')!;

    this.ttsProgressEl = this.shadow.querySelector('#rv-tts-progress')!;
    this.ttsPlayBtn = this.shadow.querySelector('#rv-tts-play')!;
    this.ttsPlayIcon = this.shadow.querySelector('#rv-tts-play-icon')! as SVGElement;
    this.rateBtn = this.shadow.querySelector('#rv-rate')!;
    this.voiceSelect = this.shadow.querySelector('#rv-voice')!;

    this.workerInput = this.shadow.querySelector('#rv-worker-url')!;
    this.tokenInput = this.shadow.querySelector('#rv-token')!;
    this.testBtn = this.shadow.querySelector('#rv-test-config')!;
    this.testResultEl = this.shadow.querySelector('#rv-test-result')!;

    this.dockPrevChBtn = this.shadow.querySelector('#rv-dock-prev-ch')!;
    this.dockTtsBtn = this.shadow.querySelector('#rv-dock-tts')!;
    this.dockAppearanceBtn = this.shadow.querySelector('#rv-dock-appearance')!;
    this.dockNextChBtn = this.shadow.querySelector('#rv-dock-next-ch')!;

    this.workerInput.value = config.workerUrl;
    this.tokenInput.value = config.token;
    this.voiceSelect.value = config.voice;
  }

  // ─── 事件绑定 ──────────────────────────────────────────────────────────

  private bindEvents(): void {
    // 滚动监听与手动滑动保护
    const markUserScroll = () => {
      this.lastUserScrollAt = Date.now();
    };
    this.scrollEl.addEventListener('touchstart', markUserScroll, { passive: true });
    this.scrollEl.addEventListener('wheel', markUserScroll, { passive: true });
    this.scrollEl.addEventListener('scroll', () => {
      if (Date.now() > this.programmaticScrollUntil) {
        this.lastUserScrollAt = Date.now();
      }
      this.updateScrollStatus();
      this.updateRelocateVisibility();
    });

    // 正文区滑动 vs 单击切菜单 vs 双击句起播
    let downX = 0;
    let downY = 0;
    let pointerMoved = false;

    this.scrollEl.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          downX = e.touches[0].clientX;
          downY = e.touches[0].clientY;
          pointerMoved = false;
        }
      },
      { passive: true }
    );
    this.scrollEl.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 1) {
          if (Math.hypot(e.touches[0].clientX - downX, e.touches[0].clientY - downY) > 10) {
            pointerMoved = true;
          }
        }
      },
      { passive: true }
    );
    this.scrollEl.addEventListener('mousedown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      pointerMoved = false;
    });
    this.scrollEl.addEventListener('mousemove', (e) => {
      if (e.buttons && Math.hypot(e.clientX - downX, e.clientY - downY) > 10) {
        pointerMoved = true;
      }
    });

    this.scrollEl.addEventListener('click', (e) => {
      if (pointerMoved) {
        pointerMoved = false;
        return;
      }

      try {
        if (window.getSelection()?.toString().trim()) {
          return;
        }
      } catch {
        // ignore
      }

      const target = e.target as HTMLElement | null;
      if (!target || target.closest('.reader-footer-nav, button, a, input, select')) {
        return;
      }

      if (this.isMenuOpen) {
        this.clearSingleTapTimer();
        this.setMenuOpen(false);
        return;
      }

      const sentenceEl = target.closest('.reader-sentence[data-chunk-index]') as HTMLElement | null;
      if (!sentenceEl) {
        this.clearSingleTapTimer();
        this.setMenuOpen(true);
        return;
      }

      const chunkIdx = Number.parseInt(sentenceEl.getAttribute('data-chunk-index') || '', 10);
      if (!Number.isFinite(chunkIdx) || chunkIdx < 0) {
        this.setMenuOpen(true);
        return;
      }

      const now = Date.now();
      if (this.lastTapChunkIdx === chunkIdx && now - this.lastTapAt <= 320) {
        // 双击同一句：同步清掉菜单定时器并立即触发起播（保留 iOS Safari 用户激活栈）
        this.clearSingleTapTimer();
        this.events.onSeekSentence(chunkIdx);
        return;
      }

      this.clearSingleTapTimer();
      this.lastTapChunkIdx = chunkIdx;
      this.lastTapAt = now;
      this.singleTapTimer = setTimeout(() => {
        this.singleTapTimer = null;
        this.lastTapChunkIdx = -1;
        if (this.opened && !this.isMenuOpen) {
          this.setMenuOpen(true);
        }
      }, 240);
    });

    // 回到朗读处
    this.relocateBtn.addEventListener('click', () => {
      this.lastUserScrollAt = 0;
      const activeEl = this.articleBodyEl.querySelector(
        `.reader-sentence[data-chunk-index="${this.activeChunkIndex}"]`
      ) as HTMLElement | null;
      if (activeEl) {
        this.scrollToSentenceEl(activeEl);
      }
      this.relocateBtn.classList.remove('visible');
    });

    // 顶栏按钮
    this.shadow.querySelector('#rv-exit')!.addEventListener('click', () => {
      this.events.onClose();
    });
    this.jumpBtn.addEventListener('click', () => {
      if (this.currentChapterUrl) {
        this.events.onJumpChapterUrl(this.currentChapterUrl);
      }
    });
    this.shadow.querySelector('#rv-top-worker')!.addEventListener('click', () => {
      this.setSubpanel(this.activeSubpanel === 'worker' ? 'none' : 'worker');
    });

    // 迷你条按钮
    this.shadow.querySelector('#rv-mini-prev')!.addEventListener('click', () => {
      this.events.onPrevSentence();
    });
    this.miniPlayBtn.addEventListener('click', () => {
      this.events.onPlayToggle();
    });
    this.shadow.querySelector('#rv-mini-next')!.addEventListener('click', () => {
      this.events.onNextSentence();
    });
    this.shadow.querySelector('#rv-mini-menu')!.addEventListener('click', () => {
      this.setMenuOpen(true, 'tts');
    });

    // 排版设置
    this.shadow.querySelector('#rv-font-dec')!.addEventListener('click', () => {
      this.updateSettings({ fontSize: Math.max(14, this.settings.fontSize - 2) });
    });
    this.shadow.querySelector('#rv-font-inc')!.addEventListener('click', () => {
      this.updateSettings({ fontSize: Math.min(28, this.settings.fontSize + 2) });
    });
    this.shadow.querySelectorAll<HTMLElement>('[data-line-height]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = Number.parseFloat(btn.dataset.lineHeight || '1.85');
        if (Number.isFinite(val)) {
          this.updateSettings({ lineHeight: val });
        }
      });
    });
    this.shadow.querySelectorAll<HTMLElement>('[data-theme-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.themeOpt as ReaderTheme;
        if (theme) {
          this.updateSettings({ theme });
        }
      });
    });
    this.autoEnterInput.addEventListener('change', () => {
      this.updateSettings({ autoEnter: this.autoEnterInput.checked });
    });

    // 听书子面板控制
    this.shadow.querySelector('#rv-tts-prev')!.addEventListener('click', () => {
      this.events.onPrevSentence();
    });
    this.ttsPlayBtn.addEventListener('click', () => {
      this.events.onPlayToggle();
    });
    this.shadow.querySelector('#rv-tts-next')!.addEventListener('click', () => {
      this.events.onNextSentence();
    });
    this.shadow.querySelector('#rv-tts-stop')!.addEventListener('click', () => {
      this.events.onStop();
    });
    this.rateBtn.addEventListener('click', () => {
      this.currentRate = getNextRate(this.currentRate);
      this.rateBtn.textContent = `${this.currentRate.toFixed(1)}x`;
      this.events.onRateChange(this.currentRate);
      this.notifyToast(`语速已切换为 ${this.currentRate.toFixed(1)}x`);
    });
    this.voiceSelect.addEventListener('change', () => {
      this.events.onVoiceChange(this.voiceSelect.value);
      this.notifyToast('音色已更新');
    });
    this.shadow.querySelector('#rv-open-worker')!.addEventListener('click', () => {
      this.setSubpanel('worker');
    });

    // Worker 配置保存与测连
    this.shadow.querySelector('#rv-save-config')!.addEventListener('click', () => {
      const url = this.workerInput.value.trim();
      const token = this.tokenInput.value.trim();
      this.events.onSaveConfig(url, token);
      this.setSubpanel('tts');
    });
    this.testBtn.addEventListener('click', () => {
      void executeConnectionTest({
        urlInput: this.workerInput,
        tokenInput: this.tokenInput,
        testBtn: this.testBtn,
        resultEl: this.testResultEl,
        onTest: (url, token) => this.events.onTestConfig(url, token),
        onEmptyUrl: () => this.notifyToast('请先输入 Worker 地址'),
      });
    });

    // 底层 4 键主栏与章节底部翻页
    this.footerPrevBtn.addEventListener('click', () => this.events.onPrevChapter());
    this.footerNextBtn.addEventListener('click', () => this.events.onNextChapter());
    this.dockPrevChBtn.addEventListener('click', () => {
      this.setMenuOpen(false);
      this.events.onPrevChapter();
    });
    this.dockNextChBtn.addEventListener('click', () => {
      this.setMenuOpen(false);
      this.events.onNextChapter();
    });
    this.dockTtsBtn.addEventListener('click', () => {
      this.setSubpanel(this.activeSubpanel === 'tts' ? 'none' : 'tts');
    });
    this.dockAppearanceBtn.addEventListener('click', () => {
      this.setSubpanel(this.activeSubpanel === 'appearance' ? 'none' : 'appearance');
    });
  }
}
