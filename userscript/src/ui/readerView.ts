import type { AppConfig, ReaderSettings, ReaderTheme } from '../core/storage';
import type { StructuredChunk } from '../core/chunker';
import type { ConnectionTestResult } from '../core/tts/edgeWorker';
import { normalizeHttpUrl } from '../core/tocExtractor';
import type { ChapterContent, PlayerState, TocItem } from '../core/tts/types';
import { READER_STYLES } from './readerStyles';
import {
  SVG_PAUSE_PATH,
  SVG_PLAY_PATH,
  buildVoiceOptionsHtml,
  executeConnectionTest,
  getNextRate,
} from './sharedControls';

export interface LoadedReaderChapter {
  id: string;
  url: string;
  chapter: ChapterContent;
  chunks: StructuredChunk[];
}

export interface TocViewState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  tocUrl?: string | null;
  bookTitle?: string;
  items: TocItem[];
  nextPageUrl?: string | null;
  loadingMore?: boolean;
  errorMessage?: string;
  historyItems?: TocItem[];
}

export type AppendStatus = 'idle' | 'loading' | 'error' | 'end';

export interface ReaderViewEvents {
  onClose: () => void;
  onPlayToggle: () => void;
  onStop: () => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onSeekSentence: (chapterId: string, chunkIndex: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onRequestAppendNext: () => void;
  onOpenToc: () => void;
  onRefreshToc: () => void;
  onLoadMoreToc: (nextPageUrl: string) => void;
  onSelectTocChapter: (url: string, title: string) => void;
  onOpenExternalToc: (url: string) => void;
  onVisibleChapterChange?: (chapterId: string, chapterUrl: string, title: string) => void;
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
const MAX_RENDERED_CHAPTERS = 5;
const INFINITE_SCROLL_PRELOAD_PX = 700;

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
 * 仿夸克浏览器精简版阅读模式（Shadow DOM 隔离，支持目录抽屉与无限滚动拼接）
 */
export class ReaderView {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private events: ReaderViewEvents;
  private initialNormUrl: string | null = null;

  private settings: ReaderSettings;
  private currentRate: number;
  private playerState: PlayerState = 'idle';

  // 多章节滑动窗口
  private chapters: LoadedReaderChapter[] = [];
  private chapterSectionMap = new Map<string, HTMLElement>();
  private visibleChapterId: string | null = null;
  private activeChapterId: string | null = null;
  private activeChunkIndex = -1;
  private totalChunks = 0;
  private isChapterLoading = false;
  private appendStatus: AppendStatus = 'idle';
  private appendErrorMessage = '';

  // 目录抽屉状态
  private isTocOpen = false;
  private tocSortDesc = false;
  private tocSearchQuery = '';
  private tocActiveUrl = '';
  private tocState: TocViewState = { status: 'idle', items: [] };

  private opened = false;
  private isMenuOpen = false;
  private activeSubpanel: DockSubpanel = 'none';

  // 原网页滚动锁定备份
  private savedHtmlOverflow: string | null = null;
  private savedBodyOverflow: string | null = null;

  // 手动滑动保护与双击识别
  private lastUserScrollAt = 0;
  private programmaticScrollUntil = 0;
  private lastTapChapterId = '';
  private lastTapChunkIdx = -1;
  private lastTapAt = 0;
  private singleTapTimer: ReturnType<typeof setTimeout> | null = null;

  // DOM 引用
  private rootEl!: HTMLElement;
  private scrollEl!: HTMLElement;
  private statusTitleEl!: HTMLElement;
  private statusProgressEl!: HTMLElement;
  private topPrevBtn!: HTMLButtonElement;
  private chaptersRootEl!: HTMLElement;
  private tailStatusEl!: HTMLElement;
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
  private infiniteScrollInput!: HTMLInputElement;

  private ttsProgressEl!: HTMLElement;
  private ttsPlayBtn!: HTMLButtonElement;
  private ttsPlayIcon!: SVGElement;
  private rateBtn!: HTMLButtonElement;
  private voiceSelect!: HTMLSelectElement;

  private workerInput!: HTMLInputElement;
  private tokenInput!: HTMLInputElement;
  private testBtn!: HTMLButtonElement;
  private testResultEl!: HTMLElement;

  private dockTocBtn!: HTMLButtonElement;
  private dockTtsBtn!: HTMLButtonElement;
  private dockAppearanceBtn!: HTMLButtonElement;
  private dockNextChBtn!: HTMLButtonElement;

  // 目录抽屉 DOM
  private tocBackdropEl!: HTMLElement;
  private tocDrawerEl!: HTMLElement;
  private tocBookTitleEl!: HTMLElement;
  private tocSearchInput!: HTMLInputElement;
  private tocSortBtn!: HTMLButtonElement;
  private tocListEl!: HTMLElement;
  private tocRefreshBtn!: HTMLButtonElement;
  private tocExternalBtn!: HTMLButtonElement;

  constructor(config: AppConfig, events: ReaderViewEvents) {
    this.events = events;
    this.settings = { ...config.reader };
    this.currentRate = config.rate;
    if (typeof window !== 'undefined' && window.location?.href) {
      this.initialNormUrl = normalizeHttpUrl(window.location.href, window.location.href);
    }

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
    this.closeTocDrawer();
    this.updateScrollStatus();
    this.updateRelocateVisibility();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.clearSingleTapTimer();
    this.setMenuOpen(false);
    this.closeTocDrawer();
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
    this.lastTapChapterId = '';
    this.lastTapChunkIdx = -1;
    this.lastTapAt = 0;
  }

  private notifyToast(message: string): void {
    this.events.onToast?.(message);
  }

  // ─── 多章节渲染与窗口管理 ──────────────────────────────────────────────

  private buildChapterSection(item: LoadedReaderChapter): HTMLElement {
    const section = document.createElement('section');
    section.className = 'reader-chapter';
    section.setAttribute('data-chapter-id', item.id);
    section.setAttribute('data-chapter-url', item.url);

    const h1 = document.createElement('h1');
    h1.className = 'reader-chapter-title';
    h1.textContent = item.chapter.title || '正文阅读';
    section.appendChild(h1);

    const segmentsByParagraph = new Map<number, Array<{ chunkIndex: number; text: string }>>();
    for (const chunk of item.chunks) {
      for (const seg of chunk.segments) {
        let list = segmentsByParagraph.get(seg.paragraphIndex);
        if (!list) {
          list = [];
          segmentsByParagraph.set(seg.paragraphIndex, list);
        }
        list.push({ chunkIndex: chunk.index, text: seg.text });
      }
    }

    item.chapter.paragraphs.forEach((paraText, pIdx) => {
      const pEl = document.createElement('p');
      pEl.className = 'reader-p';
      const segs = segmentsByParagraph.get(pIdx);
      if (segs && segs.length > 0) {
        for (const seg of segs) {
          const span = document.createElement('span');
          span.className = 'reader-sentence';
          span.setAttribute('data-chapter-id', item.id);
          span.setAttribute('data-chunk-index', String(seg.chunkIndex));
          span.textContent = seg.text;
          pEl.appendChild(span);
        }
      } else {
        pEl.textContent = paraText;
      }
      section.appendChild(pEl);
    });

    return section;
  }

  replaceChapter(item: LoadedReaderChapter): void {
    this.chapters = [item];
    this.chapterSectionMap.clear();

    const section = this.buildChapterSection(item);
    this.chapterSectionMap.set(item.id, section);
    this.chaptersRootEl.replaceChildren(section);

    this.visibleChapterId = item.id;
    this.activeChapterId = null;
    this.activeChunkIndex = -1;
    this.totalChunks = item.chunks.length;
    this.lastUserScrollAt = 0;

    this.appendStatus = item.chapter.nextChapterUrl ? 'idle' : 'end';
    this.appendErrorMessage = '';

    this.applyVisibleChapterMeta(item);
    this.updateChapterControlsUI();

    this.programmaticScrollUntil = Date.now() + 300;
    this.scrollEl.scrollTop = 0;
    this.updateScrollStatus();
    this.updateRelocateVisibility();
  }

  /**
   * 无限滚动向末尾追加新章节，超出 MAX_RENDERED_CHAPTERS 时自动裁剪较早章节 DOM 并保持视口零跳动
   * 返回被裁剪掉的章节 ID 列表供外部同步清理
   */
  appendChapter(item: LoadedReaderChapter): string[] {
    if (this.chapters.some((c) => c.id === item.id)) {
      return [];
    }

    this.chapters.push(item);
    const section = this.buildChapterSection(item);
    this.chapterSectionMap.set(item.id, section);
    this.chaptersRootEl.appendChild(section);

    const evicted: string[] = [];
    while (this.chapters.length > MAX_RENDERED_CHAPTERS) {
      const oldest = this.chapters[0];
      if (oldest.id !== this.activeChapterId && oldest.id !== this.visibleChapterId) {
        this.evictChapterAt(0, evicted);
        continue;
      }
      // 保护正在播放或正在阅读的章节，转而淘汰中间较早的可释放章节
      const altIdx = this.chapters.findIndex(
        (c, idx) =>
          idx > 0 &&
          idx < this.chapters.length - 1 &&
          c.id !== this.activeChapterId &&
          c.id !== this.visibleChapterId
      );
      if (altIdx === -1) break;
      this.evictChapterAt(altIdx, evicted);
    }

    this.appendStatus = item.chapter.nextChapterUrl ? 'idle' : 'end';
    this.appendErrorMessage = '';
    this.updateChapterControlsUI();
    return evicted;
  }

  private evictChapterAt(index: number, evictedOut: string[]): void {
    const [removed] = this.chapters.splice(index, 1);
    const sec = this.chapterSectionMap.get(removed.id);
    if (sec && sec.parentNode) {
      const beforeHeight = this.scrollEl.scrollHeight;
      sec.parentNode.removeChild(sec);
      const afterHeight = this.scrollEl.scrollHeight;
      const delta = beforeHeight - afterHeight;
      if (delta > 0) {
        this.programmaticScrollUntil = Date.now() + 300;
        this.scrollEl.scrollTop = Math.max(0, this.scrollEl.scrollTop - delta);
      }
    }
    this.chapterSectionMap.delete(removed.id);
    evictedOut.push(removed.id);
  }

  setAppendStatus(status: AppendStatus, errorMsg?: string): void {
    this.appendStatus = status;
    this.appendErrorMessage = errorMsg || '';
    this.updateChapterControlsUI();
  }

  setChapterLoading(loading: boolean): void {
    this.isChapterLoading = loading;
    this.updateChapterControlsUI();
  }

  private applyVisibleChapterMeta(vis: LoadedReaderChapter): void {
    const title = vis.chapter.title || '正文阅读';
    this.statusTitleEl.textContent = title;
    this.topTitleEl.textContent = title;

    const visNorm = normalizeHttpUrl(vis.url, vis.url);
    const showJump = Boolean(vis.url && (!this.initialNormUrl || visNorm !== this.initialNormUrl));
    this.jumpBtn.style.display = showJump ? 'inline-flex' : 'none';
  }

  private updateChapterControlsUI(): void {
    const head = this.chapters[0];
    const tail = this.chapters[this.chapters.length - 1];
    const visible = this.chapters.find((c) => c.id === this.visibleChapterId) || head;

    const hasPrev = Boolean(head?.chapter.prevChapterUrl);
    const hasTailNext = Boolean(tail?.chapter.nextChapterUrl);
    const hasVisibleNext = Boolean(visible?.chapter.nextChapterUrl || hasTailNext);

    this.topPrevBtn.disabled = this.isChapterLoading || !hasPrev;
    this.footerPrevBtn.disabled = this.isChapterLoading || !hasPrev;
    this.footerPrevBtn.style.display = this.settings.infiniteScroll ? 'none' : 'block';
    this.dockNextChBtn.disabled = this.isChapterLoading || !hasVisibleNext;

    if (!hasTailNext || this.appendStatus === 'end') {
      this.tailStatusEl.textContent = '已是最新章节';
      this.footerNextBtn.textContent = '已到末尾';
      this.footerNextBtn.disabled = true;
      return;
    }

    if (this.appendStatus === 'loading' || this.isChapterLoading) {
      this.tailStatusEl.textContent = '正在静默加载下一章…';
      this.footerNextBtn.textContent = '加载中…';
      this.footerNextBtn.disabled = true;
      return;
    }

    if (this.appendStatus === 'error') {
      this.tailStatusEl.textContent = this.appendErrorMessage
        ? `自动加载受限 (${this.appendErrorMessage})`
        : '自动加载受限，可点击下方按钮跳转下一章';
      this.footerNextBtn.textContent = '直接跳转下一章';
      this.footerNextBtn.disabled = false;
      return;
    }

    this.tailStatusEl.textContent = this.settings.infiniteScroll
      ? '继续下滑将自动无缝加载下一章'
      : '';
    this.footerNextBtn.textContent = '下一章';
    this.footerNextBtn.disabled = false;
  }

  // ─── 句级高亮与平滑跟随 ────────────────────────────────────────────────

  setActiveChunk(chapterId: string | null, index: number): void {
    this.activeChapterId = chapterId;
    this.activeChunkIndex = index;

    this.chaptersRootEl
      .querySelectorAll('.reader-sentence.active')
      .forEach((el) => el.classList.remove('active'));

    if (!chapterId || index < 0) {
      this.updateRelocateVisibility();
      this.updateScrollStatus();
      return;
    }

    const sectionEl = this.chapterSectionMap.get(chapterId);
    if (!sectionEl) {
      this.updateRelocateVisibility();
      this.updateScrollStatus();
      return;
    }

    const targets = sectionEl.querySelectorAll(`.reader-sentence[data-chunk-index="${index}"]`);
    targets.forEach((el) => el.classList.add('active'));

    const firstEl = targets[0] as HTMLElement | undefined;
    if (firstEl && Date.now() - this.lastUserScrollAt > USER_SCROLL_PROTECT_MS) {
      this.scrollToSentenceEl(firstEl);
    }

    this.updateScrollStatus();
    this.updateRelocateVisibility();
  }

  private findFirstActiveSentenceEl(): HTMLElement | null {
    if (!this.activeChapterId || this.activeChunkIndex < 0) return null;
    const sectionEl = this.chapterSectionMap.get(this.activeChapterId);
    if (!sectionEl) return null;
    return sectionEl.querySelector(
      `.reader-sentence[data-chunk-index="${this.activeChunkIndex}"]`
    ) as HTMLElement | null;
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

  /** 将视口滚动定位到当前窗口内已渲染的某一章 */
  scrollToChapter(chapterId: string): boolean {
    const sectionEl = this.chapterSectionMap.get(chapterId);
    if (!sectionEl) return false;

    const scrollRect = this.scrollEl.getBoundingClientRect();
    if (scrollRect.height <= 0) {
      try {
        sectionEl.scrollIntoView();
      } catch {
        // ignore
      }
    } else {
      const secRect = sectionEl.getBoundingClientRect();
      const targetTop = Math.max(0, secRect.top - scrollRect.top + this.scrollEl.scrollTop - 10);
      this.programmaticScrollUntil = Date.now() + 500;
      this.scrollEl.scrollTop = targetTop;
    }

    const ch = this.chapters.find((c) => c.id === chapterId);
    if (ch) {
      this.visibleChapterId = ch.id;
      this.applyVisibleChapterMeta(ch);
      this.updateChapterControlsUI();
    }
    return true;
  }

  // ─── 播放状态与参数同步 ────────────────────────────────────────────────

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
    const safeCurrent = Math.max(0, index + 1);
    const text = total > 0 ? `${safeCurrent} / ${total}` : '0 / 0';
    this.miniProgressEl.textContent = text;
    this.ttsProgressEl.textContent = total > 0 ? `第 ${safeCurrent} / ${total} 句` : '0 / 0';
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
    this.infiniteScrollInput.checked = Boolean(settings.infiniteScroll);

    this.shadow.querySelectorAll<HTMLElement>('[data-theme-opt]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeOpt === settings.theme);
    });
    this.shadow.querySelectorAll<HTMLElement>('[data-line-height]').forEach((btn) => {
      const val = Number.parseFloat(btn.dataset.lineHeight || '0');
      btn.classList.toggle('active', Math.abs(val - settings.lineHeight) < 0.05);
    });
    this.updateChapterControlsUI();
  }

  // ─── 目录抽屉管理 ──────────────────────────────────────────────────────

  openTocDrawer(): void {
    this.isTocOpen = true;
    this.setMenuOpen(false);
    this.tocBackdropEl.classList.add('open');
    this.tocDrawerEl.classList.add('open');
    this.events.onOpenToc();
  }

  closeTocDrawer(): void {
    if (!this.isTocOpen) return;
    this.isTocOpen = false;
    this.tocBackdropEl.classList.remove('open');
    this.tocDrawerEl.classList.remove('open');
  }

  setTocState(state: TocViewState, activeChapterUrl?: string): void {
    this.tocState = {
      ...state,
      items: [...state.items],
      historyItems: state.historyItems ? [...state.historyItems] : undefined,
    };
    if (activeChapterUrl) {
      this.tocActiveUrl = activeChapterUrl;
    }

    this.tocBookTitleEl.textContent = state.bookTitle || '小说目录';
    this.tocExternalBtn.disabled = !state.tocUrl;
    this.renderTocList();
  }

  private renderTocList(): void {
    const { status, items, nextPageUrl, loadingMore, errorMessage, historyItems } = this.tocState;
    const visUrl =
      this.tocActiveUrl ||
      this.chapters.find((c) => c.id === this.visibleChapterId)?.url ||
      '';
    const activeNorm = visUrl ? normalizeHttpUrl(visUrl, visUrl) : null;

    const frag = document.createDocumentFragment();

    if (status === 'loading') {
      const msg = document.createElement('div');
      msg.className = 'toc-empty';
      msg.textContent = '正在加载目录…';
      frag.appendChild(msg);
      this.appendHistoryItemsToFragment(frag, historyItems, activeNorm);
      this.tocListEl.replaceChildren(frag);
      return;
    }

    if (status === 'error' || items.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'toc-empty';
      msg.textContent =
        errorMessage || (status === 'error' ? '目录抓取受限，可刷新重试或打开原站目录' : '暂无目录章节');
      frag.appendChild(msg);
      this.appendHistoryItemsToFragment(frag, historyItems, activeNorm);
      this.tocListEl.replaceChildren(frag);
      return;
    }

    const ordered = this.tocSortDesc ? [...items].reverse() : items;
    const kw = this.tocSearchQuery.trim().toLowerCase();
    const filtered = kw
      ? ordered.filter((it) => it.title.toLowerCase().includes(kw))
      : ordered;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'toc-empty';
      empty.textContent = '没有匹配的章节标题';
      frag.appendChild(empty);
    } else {
      for (const item of filtered) {
        const btn = document.createElement('button');
        btn.className = 'toc-item';
        btn.textContent = item.title;
        btn.setAttribute('data-toc-url', item.url);
        const itemNorm = normalizeHttpUrl(item.url, item.url) || item.url;
        if (activeNorm && itemNorm === activeNorm) {
          btn.classList.add('active');
        }
        btn.addEventListener('click', () => {
          this.closeTocDrawer();
          this.events.onSelectTocChapter(item.url, item.title);
        });
        frag.appendChild(btn);
      }
    }

    if (nextPageUrl) {
      const moreBtn = document.createElement('button');
      moreBtn.id = 'rv-toc-load-more';
      moreBtn.className = 'toc-load-more';
      moreBtn.disabled = Boolean(loadingMore);
      moreBtn.textContent = loadingMore ? '正在加载下一页目录…' : '加载下一页目录';
      moreBtn.addEventListener('click', () => {
        this.events.onLoadMoreToc(nextPageUrl);
      });
      frag.appendChild(moreBtn);
    }

    this.tocListEl.replaceChildren(frag);

    const activeEl = this.tocListEl.querySelector('.toc-item.active') as HTMLElement | null;
    if (activeEl) {
      try {
        activeEl.scrollIntoView({ block: 'center' });
      } catch {
        // jsdom 忽略
      }
    }
  }

  private appendHistoryItemsToFragment(
    frag: DocumentFragment,
    historyItems: TocItem[] | undefined,
    activeNorm: string | null
  ): void {
    if (!historyItems || historyItems.length === 0) return;
    const label = document.createElement('div');
    label.className = 'toc-section-label';
    label.textContent = '本次已读章节记录';
    frag.appendChild(label);

    for (const item of historyItems) {
      const btn = document.createElement('button');
      btn.className = 'toc-item';
      btn.textContent = item.title;
      btn.setAttribute('data-toc-url', item.url);
      const itemNorm = normalizeHttpUrl(item.url, item.url) || item.url;
      if (activeNorm && itemNorm === activeNorm) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        this.closeTocDrawer();
        this.events.onSelectTocChapter(item.url, item.title);
      });
      frag.appendChild(btn);
    }
  }

  // ─── 内部滚动、状态栏与菜单控制 ────────────────────────────────────────

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
    const activeEl = this.isTtsActive() ? this.findFirstActiveSentenceEl() : null;
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

  private updateVisibleChapterFromScroll(): void {
    if (this.chapters.length === 0) return;

    const scrollRect = this.scrollEl.getBoundingClientRect();
    let target = this.chapters[0];

    if (this.chapters.length > 1 && scrollRect.height > 0) {
      const probeY = scrollRect.top + Math.min(scrollRect.height * 0.35, 220);
      for (const ch of this.chapters) {
        const sec = this.chapterSectionMap.get(ch.id);
        if (!sec) continue;
        const rect = sec.getBoundingClientRect();
        if (rect.top <= probeY) {
          target = ch;
        }
      }
    }

    if (target.id !== this.visibleChapterId) {
      this.visibleChapterId = target.id;
      this.applyVisibleChapterMeta(target);
      this.updateChapterControlsUI();
      this.events.onVisibleChapterChange?.(target.id, target.url, target.chapter.title || '');
    }
  }

  private maybeTriggerInfiniteAppend(): void {
    if (!this.opened || !this.settings.infiniteScroll || this.isChapterLoading) return;
    if (this.appendStatus !== 'idle' || this.chapters.length === 0) return;

    const tail = this.chapters[this.chapters.length - 1];
    if (!tail.chapter.nextChapterUrl) return;

    const visibleIdx = this.chapters.findIndex((c) => c.id === this.visibleChapterId);
    if (visibleIdx < this.chapters.length - 1) return;

    if (this.scrollEl.clientHeight <= 0) return;
    const distToBottom =
      this.scrollEl.scrollHeight - (this.scrollEl.scrollTop + this.scrollEl.clientHeight);
    if (distToBottom <= INFINITE_SCROLL_PRELOAD_PX) {
      this.events.onRequestAppendNext();
    }
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
    style.textContent = READER_STYLES;

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
          <div class="top-prev-wrap">
            <button class="top-prev-btn" id="rv-top-prev">↑ 上一章</button>
          </div>
          <div id="rv-chapters-root"></div>
          <div class="reader-tail-bar" id="rv-tail-bar">
            <div class="tail-status-text" id="rv-tail-status"></div>
            <div class="reader-footer-nav">
              <button class="footer-nav-btn" id="rv-footer-prev">上一章</button>
              <button class="footer-nav-btn primary" id="rv-footer-next">下一章</button>
            </div>
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
            <span class="setting-label">连读</span>
            <label class="switch-label">
              <input type="checkbox" id="rv-infinite-scroll" />
              <span>下滑自动无缝加载下一章</span>
            </label>
          </div>
          <div class="setting-row">
            <span class="setting-label">启动</span>
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

        <!-- 布局 2：仿夸克 4 键底栏 -->
        <div class="dock-actions">
          <button class="dock-btn" id="rv-dock-toc">目录</button>
          <button class="dock-btn" id="rv-dock-tts">听书</button>
          <button class="dock-btn" id="rv-dock-appearance">设置</button>
          <button class="dock-btn" id="rv-dock-next-ch">下一章</button>
        </div>
      </div>

      <!-- 左侧目录抽屉 -->
      <div class="toc-backdrop" id="rv-toc-backdrop"></div>
      <aside class="toc-drawer" id="rv-toc-drawer">
        <div class="toc-header">
          <span class="toc-book-title" id="rv-toc-book-title">小说目录</span>
          <button class="bar-text-btn" id="rv-toc-close">✕</button>
        </div>
        <div class="toc-tools">
          <input type="text" class="toc-search" id="rv-toc-search" placeholder="搜索章节标题…" />
          <button class="pill-btn" id="rv-toc-sort">倒序</button>
        </div>
        <div class="toc-list" id="rv-toc-list"></div>
        <div class="toc-footer">
          <button class="pill-btn" id="rv-toc-refresh">刷新目录</button>
          <button class="pill-btn" id="rv-toc-external">原站目录</button>
        </div>
      </aside>
    `;

    this.shadow.appendChild(style);
    this.shadow.appendChild(root);

    this.rootEl = root;
    this.scrollEl = this.shadow.querySelector('#rv-scroll')!;
    this.statusTitleEl = this.shadow.querySelector('#rv-status-title')!;
    this.statusProgressEl = this.shadow.querySelector('#rv-status-progress')!;
    this.topPrevBtn = this.shadow.querySelector('#rv-top-prev')!;
    this.chaptersRootEl = this.shadow.querySelector('#rv-chapters-root')!;
    this.tailStatusEl = this.shadow.querySelector('#rv-tail-status')!;
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
    this.infiniteScrollInput = this.shadow.querySelector('#rv-infinite-scroll')!;

    this.ttsProgressEl = this.shadow.querySelector('#rv-tts-progress')!;
    this.ttsPlayBtn = this.shadow.querySelector('#rv-tts-play')!;
    this.ttsPlayIcon = this.shadow.querySelector('#rv-tts-play-icon')! as SVGElement;
    this.rateBtn = this.shadow.querySelector('#rv-rate')!;
    this.voiceSelect = this.shadow.querySelector('#rv-voice')!;

    this.workerInput = this.shadow.querySelector('#rv-worker-url')!;
    this.tokenInput = this.shadow.querySelector('#rv-token')!;
    this.testBtn = this.shadow.querySelector('#rv-test-config')!;
    this.testResultEl = this.shadow.querySelector('#rv-test-result')!;

    this.dockTocBtn = this.shadow.querySelector('#rv-dock-toc')!;
    this.dockTtsBtn = this.shadow.querySelector('#rv-dock-tts')!;
    this.dockAppearanceBtn = this.shadow.querySelector('#rv-dock-appearance')!;
    this.dockNextChBtn = this.shadow.querySelector('#rv-dock-next-ch')!;

    this.tocBackdropEl = this.shadow.querySelector('#rv-toc-backdrop')!;
    this.tocDrawerEl = this.shadow.querySelector('#rv-toc-drawer')!;
    this.tocBookTitleEl = this.shadow.querySelector('#rv-toc-book-title')!;
    this.tocSearchInput = this.shadow.querySelector('#rv-toc-search')!;
    this.tocSortBtn = this.shadow.querySelector('#rv-toc-sort')!;
    this.tocListEl = this.shadow.querySelector('#rv-toc-list')!;
    this.tocRefreshBtn = this.shadow.querySelector('#rv-toc-refresh')!;
    this.tocExternalBtn = this.shadow.querySelector('#rv-toc-external')!;

    this.workerInput.value = config.workerUrl;
    this.tokenInput.value = config.token;
    this.voiceSelect.value = config.voice;
  }

  // ─── 事件绑定 ──────────────────────────────────────────────────────────

  private bindEvents(): void {
    const markUserScroll = () => {
      this.lastUserScrollAt = Date.now();
    };
    this.scrollEl.addEventListener('touchstart', markUserScroll, { passive: true });
    this.scrollEl.addEventListener('wheel', markUserScroll, { passive: true });
    this.scrollEl.addEventListener('scroll', () => {
      if (Date.now() > this.programmaticScrollUntil) {
        this.lastUserScrollAt = Date.now();
      }
      this.updateVisibleChapterFromScroll();
      this.updateScrollStatus();
      this.updateRelocateVisibility();
      this.maybeTriggerInfiniteAppend();
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
      if (
        !target ||
        target.closest('.reader-tail-bar, .top-prev-wrap, button, a, input, select')
      ) {
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

      const chapterId = sentenceEl.getAttribute('data-chapter-id') || '';
      const chunkIdx = Number.parseInt(sentenceEl.getAttribute('data-chunk-index') || '', 10);
      if (!chapterId || !Number.isFinite(chunkIdx) || chunkIdx < 0) {
        this.setMenuOpen(true);
        return;
      }

      const now = Date.now();
      if (
        this.lastTapChapterId === chapterId &&
        this.lastTapChunkIdx === chunkIdx &&
        now - this.lastTapAt <= 320
      ) {
        // 双击同一章同一句：同步触发起播（保留 iOS Safari 用户激活栈）
        this.clearSingleTapTimer();
        this.events.onSeekSentence(chapterId, chunkIdx);
        return;
      }

      this.clearSingleTapTimer();
      this.lastTapChapterId = chapterId;
      this.lastTapChunkIdx = chunkIdx;
      this.lastTapAt = now;
      this.singleTapTimer = setTimeout(() => {
        this.singleTapTimer = null;
        this.lastTapChapterId = '';
        this.lastTapChunkIdx = -1;
        if (this.opened && !this.isMenuOpen) {
          this.setMenuOpen(true);
        }
      }, 240);
    });

    // 回到朗读处
    this.relocateBtn.addEventListener('click', () => {
      this.lastUserScrollAt = 0;
      const activeEl = this.findFirstActiveSentenceEl();
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
      const visible =
        this.chapters.find((c) => c.id === this.visibleChapterId) || this.chapters[0];
      if (visible?.url) {
        this.events.onJumpChapterUrl(visible.url);
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

    // 排版与阅读设置
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
    this.infiniteScrollInput.addEventListener('change', () => {
      this.updateSettings({ infiniteScroll: this.infiniteScrollInput.checked });
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

    // 章首/章尾翻页
    this.topPrevBtn.addEventListener('click', () => this.events.onPrevChapter());
    this.footerPrevBtn.addEventListener('click', () => this.events.onPrevChapter());
    this.footerNextBtn.addEventListener('click', () => this.events.onNextChapter());

    // 布局 2：仿夸克 4 键底栏
    this.dockTocBtn.addEventListener('click', () => {
      this.openTocDrawer();
    });
    this.dockTtsBtn.addEventListener('click', () => {
      this.setSubpanel(this.activeSubpanel === 'tts' ? 'none' : 'tts');
    });
    this.dockAppearanceBtn.addEventListener('click', () => {
      this.setSubpanel(this.activeSubpanel === 'appearance' ? 'none' : 'appearance');
    });
    this.dockNextChBtn.addEventListener('click', () => {
      this.setMenuOpen(false);
      this.events.onNextChapter();
    });

    // 目录抽屉控制
    this.tocBackdropEl.addEventListener('click', () => this.closeTocDrawer());
    this.shadow.querySelector('#rv-toc-close')!.addEventListener('click', () => {
      this.closeTocDrawer();
    });
    this.tocSearchInput.addEventListener('input', () => {
      this.tocSearchQuery = this.tocSearchInput.value;
      this.renderTocList();
    });
    this.tocSortBtn.addEventListener('click', () => {
      this.tocSortDesc = !this.tocSortDesc;
      this.tocSortBtn.textContent = this.tocSortDesc ? '正序' : '倒序';
      this.renderTocList();
    });
    this.tocRefreshBtn.addEventListener('click', () => {
      this.events.onRefreshToc();
    });
    this.tocExternalBtn.addEventListener('click', () => {
      if (this.tocState.tocUrl) {
        this.events.onOpenExternalToc(this.tocState.tocUrl);
      }
    });
  }
}
