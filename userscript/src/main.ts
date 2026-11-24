import {
  extractChapterContent,
  extractNextChapterUrl,
  extractPrevChapterUrl,
  extractTocUrl,
  findContentElement,
} from './core/extractor';
import { normalizeHttpUrl } from './core/tocExtractor';
import { chunkParagraphs } from './core/chunker';
import { NovelPlayer } from './core/player';
import { ConfigStorage, type ReaderSettings } from './core/storage';
import { ChapterLoader } from './core/chapterLoader';
import { EdgeWorkerTTSProvider } from './core/tts/edgeWorker';
import { FloatingBar } from './ui/floatingBar';
import { ReaderView, type LoadedReaderChapter } from './ui/readerView';
import { PageHighlighter } from './ui/pageHighlighter';
import type { ChapterContent, TocData, TocItem } from './core/tts/types';

export const VERSION = '0.4.0';

function countEffectiveChars(paragraphs: string[]): number {
  return paragraphs.reduce((sum, p) => sum + p.replace(/\s+/g, '').length, 0);
}

function initNovelTTS(): void {
  // 1. 防重复挂载：严格禁止在子 iframe 中运行
  if (typeof window !== 'undefined' && window.self !== window.top) {
    return;
  }

  // 2. 加载用户跨站持久化配置
  const config = ConfigStorage.load();

  // 3. 初始化 Provider、章节加载器与原网页高亮器
  const workerProvider = new EdgeWorkerTTSProvider({
    workerUrl: config.workerUrl || '',
    token: config.token || 'dev-secret',
  });

  const initialPageUrl = window.location.href;
  const chapterLoader = new ChapterLoader(initialPageUrl);
  const pageHighlighter = new PageHighlighter();

  const toChapterId = (url: string): string =>
    normalizeHttpUrl(url, window.location.href) || url;

  // 多章滑动窗口与目录状态
  let loadedChapters: LoadedReaderChapter[] = [];
  const readingHistory: TocItem[] = [];
  let visibleChapterId: string | null = null;
  let playingChapterId: string | null = null;
  let activeChunkIndex = -1;
  let lastSeenHref = initialPageUrl;

  let isChapterLoading = false;
  let isAppendingNext = false;
  let knownTocUrl: string | null = null;
  const tocCache = new Map<string, TocData>();
  let tocLoadingMore = false;

  let bar!: FloatingBar;
  let readerView!: ReaderView;

  const isPlayerActive = (): boolean => {
    const state = player.getState();
    return state === 'playing' || state === 'loading' || state === 'paused';
  };

  const getVisibleChapter = (): LoadedReaderChapter | null =>
    loadedChapters.find((c) => c.id === visibleChapterId) || loadedChapters[0] || null;

  const getPlayingChapter = (): LoadedReaderChapter | null =>
    loadedChapters.find((c) => c.id === playingChapterId) || getVisibleChapter();

  const recordHistory = (url: string, title: string) => {
    const id = toChapterId(url);
    if (!readingHistory.some((item) => item.url === id)) {
      readingHistory.push({
        title: title || id,
        url: id,
      });
    }
  };

  const makeLoadedChapter = (url: string, chapter: ChapterContent): LoadedReaderChapter => {
    const id = toChapterId(url);
    if (chapter.tocUrl) {
      knownTocUrl = chapter.tocUrl;
    }
    recordHistory(url, chapter.title);
    return {
      id,
      url,
      chapter,
      chunks: chunkParagraphs(chapter.paragraphs),
    };
  };

  const syncBrowserUrlAndTitle = (targetUrl: string, title: string) => {
    try {
      window.history.replaceState(null, '', targetUrl);
      document.title = title;
    } catch {
      // 跨域或沙箱环境静默忽略
    }
    lastSeenHref = window.location.href;
  };

  // 4. 初始化播放器
  const player = new NovelPlayer({
    provider: workerProvider,
    voice: config.voice,
    rate: config.rate,
    events: {
      onStateChange: (state) => {
        bar.updatePlayerState(state);
        readerView.updatePlayerState(state);
        if (state === 'idle' && !isChapterLoading) {
          activeChunkIndex = -1;
          pageHighlighter.clear();
          readerView.setActiveChunk(null, -1);
        }
      },
      onIndexChange: (idx, total, text) => {
        activeChunkIndex = idx;
        bar.updateProgress(idx, total, text);
        readerView.updateProgress(idx, total);
        readerView.setActiveChunk(playingChapterId, idx);

        const playing = getPlayingChapter();
        if (!readerView.isOpen() && playing?.url === initialPageUrl) {
          pageHighlighter.highlight(text);
        }
      },
      onToast: (msg) => {
        bar.showToast(msg);
      },
      onChapterEnd: () => {
        void handleChapterEnd();
      },
    },
  });

  // 按需解析当前页正文
  const ensureInitialChapterParsed = (silent = false): LoadedReaderChapter | null => {
    const href = window.location.href;
    if (loadedChapters.length === 0 || lastSeenHref !== href) {
      if (!silent) {
        bar.showToast('正在解析小说正文…');
      }
      const extracted = extractChapterContent(document, href);
      lastSeenHref = href;

      if (!extracted || extracted.paragraphs.length === 0) {
        loadedChapters = [];
        visibleChapterId = null;
        return null;
      }

      const item = makeLoadedChapter(href, extracted);
      loadedChapters = [item];
      visibleChapterId = item.id;
      chapterLoader.markVisited(href);
      pageHighlighter.setContainer(findContentElement(document));
      bar.updateChapter(extracted.title);

      if (readerView.isOpen()) {
        readerView.replaceChapter(item);
      }
    }
    return getVisibleChapter();
  };

  // 打开 / 关闭阅读模式
  const openReader = (): void => {
    const current = ensureInitialChapterParsed(true);
    if (!current || current.chunks.length === 0) {
      bar.showToast('未识别到小说正文，无法开启阅读模式');
      return;
    }

    pageHighlighter.clear();
    if (!readerView.isOpen()) {
      // 若此前已有其他加载态未在 ReaderView 中同步，以当前 loadedChapters 重建
      readerView.replaceChapter(loadedChapters[0]);
      for (let i = 1; i < loadedChapters.length; i++) {
        readerView.appendChapter(loadedChapters[i]);
      }
      if (visibleChapterId && visibleChapterId !== loadedChapters[0].id) {
        readerView.scrollToChapter(visibleChapterId);
      }
    }

    const activeOrVisible = getPlayingChapter() || current;
    readerView.updatePlayerState(player.getState());
    readerView.updateProgress(
      activeChunkIndex >= 0 ? activeChunkIndex : -1,
      activeOrVisible.chunks.length
    );

    const latestCfg = ConfigStorage.load();
    readerView.syncRate(latestCfg.rate);
    readerView.syncVoice(latestCfg.voice);
    readerView.syncConfigInputs(latestCfg.workerUrl, latestCfg.token);
    readerView.applySettings(latestCfg.reader);

    bar.setSuppressed(true);
    readerView.open();

    if (activeChunkIndex >= 0 && isPlayerActive() && playingChapterId) {
      readerView.setActiveChunk(playingChapterId, activeChunkIndex);
    }
  };

  const closeReader = (): void => {
    readerView.close();
    bar.setSuppressed(false);

    const playing = getPlayingChapter();
    if (isPlayerActive() && activeChunkIndex >= 0 && playing?.url === initialPageUrl) {
      const sentence = player.getSentences()[activeChunkIndex];
      if (sentence) {
        pageHighlighter.highlight(sentence);
      }
    }
  };

  // 共享同步解锁 + 播放/暂停控制
  const handlePlayToggle = async (): Promise<void> => {
    if (isChapterLoading) {
      bar.showToast('正在加载章节，请稍候…');
      return;
    }

    const state = player.getState();

    if (state === 'playing' || state === 'loading') {
      player.pause();
      return;
    }

    if (state === 'paused') {
      if (!player.isFallbackMode()) {
        player.unlockAllAudio({ audio: true, speech: false });
      }
      player.resume();
      return;
    }

    // idle / error 启动播放：同步解锁音频
    const currentCfg = ConfigStorage.load();
    const hasWorker = Boolean(currentCfg.workerUrl.trim());

    if (hasWorker) {
      player.unlockAllAudio({ audio: true, speech: true });
    } else {
      player.switchToFallback('未配置 Worker，已自动使用系统语音朗读（可点齿轮配置）');
    }

    try {
      const target = ensureInitialChapterParsed(readerView.isOpen());
      if (!target) {
        bar.showToast('未识别到小说正文，无法播放');
        return;
      }

      if (!readerView.isOpen() && target.url === initialPageUrl) {
        pageHighlighter.setContainer(findContentElement(document));
      }

      playingChapterId = target.id;
      await player.playChapter(target.chapter);
    } catch (err: any) {
      console.error('[NovelTTS] Play error:', err);
      bar.showToast(`播放失败: ${err?.message || err}`);
    }
  };

  // 双击阅读模式任意章节中的任意一句直接起播 / 跳播
  const handleSeekSentence = (chapterId: string, chunkIndex: number): void => {
    if (isChapterLoading) {
      bar.showToast('正在加载章节，请稍候…');
      return;
    }

    const currentCfg = ConfigStorage.load();
    const hasWorker = Boolean(currentCfg.workerUrl.trim());
    if (hasWorker) {
      player.unlockAllAudio({ audio: true, speech: true });
    } else if (!player.isFallbackMode()) {
      player.switchToFallback('未配置 Worker，已自动使用系统语音朗读');
    }

    const target =
      loadedChapters.find((c) => c.id === chapterId) || ensureInitialChapterParsed(true);
    if (!target || target.chunks.length === 0) {
      bar.showToast('未识别到小说正文，无法播放');
      return;
    }

    const safeIndex = Math.max(0, Math.min(chunkIndex, target.chunks.length - 1));
    bar.showToast(`从第 ${safeIndex + 1} 句开始朗读`);

    if (
      target.id === playingChapterId &&
      player.getState() !== 'idle' &&
      player.getSentences().length > 0
    ) {
      player.seek(safeIndex);
      return;
    }

    playingChapterId = target.id;
    bar.updateChapter(
      target.chapter.title,
      target.url !== initialPageUrl ? target.url : undefined
    );
    syncBrowserUrlAndTitle(target.url, target.chapter.title);
    void player.playChapter(target.chapter, safeIndex);
  };

  // 无限滚动：滑近当前末章底部时静默预加载并拼接下一章
  const handleAppendNextChapter = async (): Promise<void> => {
    if (isAppendingNext || isChapterLoading || loadedChapters.length === 0) {
      return;
    }

    const tail = loadedChapters[loadedChapters.length - 1];
    const nextUrl = tail.chapter.nextChapterUrl;
    if (!nextUrl) {
      readerView.setAppendStatus('end');
      return;
    }

    isAppendingNext = true;
    readerView.setAppendStatus('loading');

    try {
      const loaded = await chapterLoader.loadChapter(nextUrl, { allowVisited: false });
      if (loaded === null) {
        // 已在 visitedUrls 中（防环），停止继续自动向后拼接
        readerView.setAppendStatus('end');
        return;
      }
      if (loaded.paragraphs.length === 0) {
        throw new Error('未提取到有效正文');
      }

      const nextItem = makeLoadedChapter(nextUrl, loaded);
      loadedChapters.push(nextItem);
      const evictedIds = readerView.appendChapter(nextItem);
      if (evictedIds.length > 0) {
        loadedChapters = loadedChapters.filter((c) => !evictedIds.includes(c.id));
      }
    } catch (err: any) {
      console.warn('[NovelTTS] Infinite append failed:', err);
      readerView.setAppendStatus('error', err?.message || String(err));
    } finally {
      isAppendingNext = false;
    }
  };

  // 本章朗读完毕后的无缝跨章接力
  const handleChapterEnd = async (): Promise<void> => {
    const playingIdx = loadedChapters.findIndex((c) => c.id === playingChapterId);

    // 1. 下一章已在无限滚动窗口中预加载完成 -> 零等待直接续播
    if (playingIdx >= 0 && playingIdx + 1 < loadedChapters.length) {
      const nextItem = loadedChapters[playingIdx + 1];
      playingChapterId = nextItem.id;
      activeChunkIndex = -1;
      bar.updateChapter(
        nextItem.chapter.title,
        nextItem.url !== initialPageUrl ? nextItem.url : undefined
      );
      bar.showToast(`已开始播放：${nextItem.chapter.title}`);
      syncBrowserUrlAndTitle(nextItem.url, nextItem.chapter.title);

      if (!ConfigStorage.load().workerUrl.trim()) {
        player.switchToFallback();
      }
      await player.playChapter(nextItem.chapter);
      return;
    }

    // 2. 阅读模式下开启无限滚动且下一章尚未预加载 -> 静默拉取后追加拼接并续播
    const cfg = ConfigStorage.load();
    if (readerView.isOpen() && cfg.reader.infiniteScroll) {
      const playing = getPlayingChapter();
      const targetUrl =
        playing?.chapter.nextChapterUrl || extractNextChapterUrl(document, window.location.href);

      if (!targetUrl) {
        bar.showToast('已播放至最后一章');
        return;
      }
      if (isChapterLoading || isAppendingNext) return;

      isChapterLoading = true;
      readerView.setChapterLoading(true);
      bar.showToast('正在加载下一章…');

      try {
        const loaded = await chapterLoader.loadChapter(targetUrl, { allowVisited: false });
        if (!loaded || loaded.paragraphs.length === 0) {
          throw new Error('下一章正文提取失败或已到达边界');
        }

        const nextItem = makeLoadedChapter(targetUrl, loaded);
        loadedChapters.push(nextItem);
        const evictedIds = readerView.appendChapter(nextItem);
        if (evictedIds.length > 0) {
          loadedChapters = loadedChapters.filter((c) => !evictedIds.includes(c.id));
        }

        playingChapterId = nextItem.id;
        bar.updateChapter(
          nextItem.chapter.title,
          nextItem.url !== initialPageUrl ? nextItem.url : undefined
        );
        bar.showToast(`已开始播放：${nextItem.chapter.title}`);
        syncBrowserUrlAndTitle(nextItem.url, nextItem.chapter.title);

        if (!cfg.workerUrl.trim()) {
          player.switchToFallback();
        }
        await player.playChapter(nextItem.chapter);
      } catch (err: any) {
        console.warn('[NovelTTS] Auto-append next chapter on play end failed:', err);
        bar.showToast(`下一章自动加载失败 (${err?.message || err})，可点下一章直接跳转`);
      } finally {
        isChapterLoading = false;
        readerView.setChapterLoading(false);
      }
      return;
    }

    // 3. 普通单章或原网页模式：替换加载下一章
    await handleLoadChapter('next', { isManual: false, autoPlay: true });
  };

  // 手动上下章切换（或非无限滚动模式自动切章）
  const handleLoadChapter = async (
    direction: 'prev' | 'next',
    options: { isManual: boolean; autoPlay: boolean }
  ): Promise<void> => {
    if (options.isManual && options.autoPlay) {
      player.unlockAllAudio({ audio: true, speech: true });
    }

    if (isChapterLoading) return;

    // 若在阅读模式点“下一章”且后续章已拼接在当前窗口中，直接平滑切换过去
    const vis = getVisibleChapter();
    if (direction === 'next' && readerView.isOpen() && vis) {
      const visIdx = loadedChapters.findIndex((c) => c.id === vis.id);
      if (visIdx >= 0 && visIdx + 1 < loadedChapters.length) {
        const nextLoaded = loadedChapters[visIdx + 1];
        readerView.scrollToChapter(nextLoaded.id);
        bar.updateChapter(
          nextLoaded.chapter.title,
          nextLoaded.url !== initialPageUrl ? nextLoaded.url : undefined
        );
        syncBrowserUrlAndTitle(nextLoaded.url, nextLoaded.chapter.title);

        if (options.autoPlay) {
          if (player.getState() !== 'idle') player.stop();
          playingChapterId = nextLoaded.id;
          bar.showToast(`已开始播放：${nextLoaded.chapter.title}`);
          if (!ConfigStorage.load().workerUrl.trim()) {
            player.switchToFallback();
          }
          await player.playChapter(nextLoaded.chapter);
        }
        return;
      }
    }

    let targetUrl: string | null = null;
    if (direction === 'next') {
      const tail = loadedChapters[loadedChapters.length - 1];
      targetUrl = tail?.chapter.nextChapterUrl || extractNextChapterUrl(document, window.location.href);
    } else {
      const head = loadedChapters[0];
      targetUrl = head?.chapter.prevChapterUrl || extractPrevChapterUrl(document, window.location.href);
    }

    if (!targetUrl) {
      bar.showToast(direction === 'prev' ? '已是第一章' : '已播放至最后一章');
      return;
    }

    if (player.getState() !== 'idle') {
      player.stop();
    }

    isChapterLoading = true;
    readerView.setChapterLoading(true);
    bar.showToast(direction === 'prev' ? '正在加载上一章…' : '正在加载下一章…');

    try {
      const loaded = await chapterLoader.loadChapter(targetUrl, {
        allowVisited: options.isManual,
      });

      if (!loaded || loaded.paragraphs.length === 0) {
        throw new Error('章节正文提取失败或已到达边界');
      }

      const newItem = makeLoadedChapter(targetUrl, loaded);
      loadedChapters = [newItem];
      visibleChapterId = newItem.id;
      playingChapterId = options.autoPlay ? newItem.id : null;
      activeChunkIndex = -1;
      pageHighlighter.resetPosition();

      const isCrossChapter = targetUrl !== initialPageUrl;
      bar.updateChapter(loaded.title, isCrossChapter ? targetUrl : undefined);
      readerView.replaceChapter(newItem);
      syncBrowserUrlAndTitle(targetUrl, loaded.title);

      if (options.autoPlay) {
        bar.showToast(`已开始播放：${loaded.title}`);
        if (!ConfigStorage.load().workerUrl.trim()) {
          player.switchToFallback();
        }
        await player.playChapter(loaded);
      } else {
        bar.updateProgress(-1, newItem.chunks.length);
        readerView.updateProgress(-1, newItem.chunks.length);
        bar.showToast(`已加载：${loaded.title}`);
      }
    } catch (err: any) {
      console.warn('[NovelTTS] Failed to load chapter silently:', err);

      if (options.isManual) {
        bar.showToast('静默加载受限，正在直接跳转章节…');
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 300);
      } else {
        bar.showToast(`下一章自动加载失败 (${err?.message || err})，可点下一章直接跳转`);
      }
    } finally {
      isChapterLoading = false;
      readerView.setChapterLoading(false);
    }
  };

  // 目录链接探测与抽屉联动
  const resolveTocUrl = (): string | null => {
    const vis = getVisibleChapter();
    return vis?.chapter.tocUrl || knownTocUrl || extractTocUrl(document, window.location.href);
  };

  const handleOpenToc = async (forceRefresh = false): Promise<void> => {
    const tocUrl = resolveTocUrl();
    const currentVisUrl = getVisibleChapter()?.url || window.location.href;

    if (!tocUrl) {
      readerView.setTocState(
        {
          status: 'error',
          tocUrl: null,
          errorMessage: '当前页面未识别到目录链接',
          items: [],
          historyItems: readingHistory,
        },
        currentVisUrl
      );
      return;
    }

    const cached = tocCache.get(tocUrl);
    if (cached && !forceRefresh) {
      readerView.setTocState(
        {
          status: 'ready',
          tocUrl,
          bookTitle: cached.bookTitle,
          items: cached.items,
          nextPageUrl: cached.nextPageUrl,
          historyItems: readingHistory,
        },
        currentVisUrl
      );
      return;
    }

    readerView.setTocState(
      {
        status: 'loading',
        tocUrl,
        items: [],
        historyItems: readingHistory,
      },
      currentVisUrl
    );

    try {
      const data = await chapterLoader.loadToc(tocUrl);
      tocCache.set(tocUrl, data);
      readerView.setTocState(
        {
          status: data.items.length > 0 ? 'ready' : 'error',
          tocUrl,
          bookTitle: data.bookTitle,
          items: data.items,
          nextPageUrl: data.nextPageUrl,
          errorMessage: data.items.length === 0 ? '未能从目录页解析出章节列表' : undefined,
          historyItems: readingHistory,
        },
        currentVisUrl
      );
    } catch (err: any) {
      console.warn('[NovelTTS] Load TOC failed:', err);
      readerView.setTocState(
        {
          status: 'error',
          tocUrl,
          errorMessage: `目录抓取受限 (${err?.message || err})`,
          items: [],
          historyItems: readingHistory,
        },
        currentVisUrl
      );
    }
  };

  const handleLoadMoreToc = async (nextPageUrl: string): Promise<void> => {
    const tocUrl = resolveTocUrl();
    if (!tocUrl || tocLoadingMore) return;
    const cached = tocCache.get(tocUrl);
    if (!cached) return;

    tocLoadingMore = true;
    const currentVisUrl = getVisibleChapter()?.url || window.location.href;

    readerView.setTocState(
      {
        status: 'ready',
        tocUrl,
        bookTitle: cached.bookTitle,
        items: cached.items,
        nextPageUrl: cached.nextPageUrl,
        loadingMore: true,
        historyItems: readingHistory,
      },
      currentVisUrl
    );

    try {
      const moreData = await chapterLoader.loadToc(nextPageUrl);
      const seen = new Set(cached.items.map((it) => it.url));
      for (const item of moreData.items) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          cached.items.push(item);
        }
      }
      cached.nextPageUrl = moreData.nextPageUrl;
    } catch (err: any) {
      bar.showToast(`加载下一页目录失败: ${err?.message || err}`);
    } finally {
      tocLoadingMore = false;
      readerView.setTocState(
        {
          status: 'ready',
          tocUrl,
          bookTitle: cached.bookTitle,
          items: cached.items,
          nextPageUrl: cached.nextPageUrl,
          loadingMore: false,
          historyItems: readingHistory,
        },
        currentVisUrl
      );
    }
  };

  const handleSelectTocChapter = async (targetUrl: string, title: string): Promise<void> => {
    if (isChapterLoading) {
      bar.showToast('正在加载章节，请稍候…');
      return;
    }

    const wasListening = isPlayerActive();
    if (wasListening) {
      const hasWorker = Boolean(ConfigStorage.load().workerUrl.trim());
      if (hasWorker) {
        player.unlockAllAudio({ audio: true, speech: true });
      }
    }

    const targetId = toChapterId(targetUrl);
    const existing = loadedChapters.find((c) => c.id === targetId);
    if (existing) {
      visibleChapterId = existing.id;
      readerView.scrollToChapter(existing.id);
      bar.updateChapter(
        existing.chapter.title,
        existing.url !== initialPageUrl ? existing.url : undefined
      );
      syncBrowserUrlAndTitle(existing.url, existing.chapter.title);

      if (wasListening) {
        if (player.getState() !== 'idle') player.stop();
        playingChapterId = existing.id;
        await player.playChapter(existing.chapter);
      }
      return;
    }

    if (player.getState() !== 'idle') {
      player.stop();
    }

    isChapterLoading = true;
    readerView.setChapterLoading(true);
    bar.showToast(`正在加载：${title}…`);

    try {
      chapterLoader.resetVisited(targetUrl);
      const loaded = await chapterLoader.loadChapter(targetUrl, { allowVisited: true });
      if (!loaded || loaded.paragraphs.length === 0) {
        throw new Error('未能提取到章节正文');
      }

      const newItem = makeLoadedChapter(targetUrl, loaded);
      loadedChapters = [newItem];
      visibleChapterId = newItem.id;
      playingChapterId = wasListening ? newItem.id : null;
      activeChunkIndex = -1;
      pageHighlighter.resetPosition();

      bar.updateChapter(loaded.title, targetUrl !== initialPageUrl ? targetUrl : undefined);
      readerView.replaceChapter(newItem);
      syncBrowserUrlAndTitle(targetUrl, loaded.title);

      if (wasListening) {
        if (!ConfigStorage.load().workerUrl.trim()) {
          player.switchToFallback();
        }
        bar.showToast(`已开始播放：${loaded.title}`);
        await player.playChapter(loaded);
      } else {
        bar.updateProgress(-1, newItem.chunks.length);
        readerView.updateProgress(-1, newItem.chunks.length);
        bar.showToast(`已跳转：${loaded.title}`);
      }
    } catch (err: any) {
      console.warn('[NovelTTS] Jump from TOC failed:', err);
      bar.showToast('目录跳章受限，正在打开章节原页…');
      setTimeout(() => {
        window.location.href = targetUrl;
      }, 300);
    } finally {
      isChapterLoading = false;
      readerView.setChapterLoading(false);
    }
  };

  // 共享参数与 Worker 配置同步
  const handleRateChange = (rate: number) => {
    player.setRate(rate);
    ConfigStorage.save({ rate });
    bar.syncRate(rate);
    readerView.syncRate(rate);
  };

  const handleVoiceChange = (voice: string) => {
    player.setVoice(voice);
    ConfigStorage.save({ voice });
    bar.syncVoice(voice);
    readerView.syncVoice(voice);
  };

  const handleSaveConfig = (workerUrl: string, token: string) => {
    const trimmedUrl = workerUrl.trim();
    const effectiveToken = token.trim() || 'dev-secret';
    ConfigStorage.save({ workerUrl: trimmedUrl, token: effectiveToken });
    bar.syncConfigInputs(trimmedUrl, effectiveToken);
    readerView.syncConfigInputs(trimmedUrl, effectiveToken);

    if (trimmedUrl) {
      workerProvider.updateConfig(trimmedUrl, effectiveToken);
      player.setProvider(workerProvider);
      bar.showToast('配置已保存并生效');
    } else {
      workerProvider.updateConfig('', effectiveToken);
      player.switchToFallback('已清空 Worker 地址，将使用系统语音朗读');
    }
  };

  const handleTestConfig = async (workerUrl: string, token: string) => {
    const effectiveToken = token.trim() || 'dev-secret';
    return await workerProvider.testConnection(workerUrl, effectiveToken);
  };

  // 5. 初始化精简悬浮球与仿夸克阅读模式
  bar = new FloatingBar(config, {
    onPlayToggle: () => {
      void handlePlayToggle();
    },
    onNextSentence: () => player.nextSentence(),
    onPrevSentence: () => player.previousSentence(),
    onNextChapter: () => {
      void handleLoadChapter('next', { isManual: true, autoPlay: true });
    },
    onOpenReader: openReader,
    onRateChange: handleRateChange,
    onVoiceChange: handleVoiceChange,
    onSaveConfig: handleSaveConfig,
    onTestConfig: handleTestConfig,
    onJumpChapterUrl: (url) => {
      window.location.href = url;
    },
    onBallPositionChange: (pos) => {
      ConfigStorage.save({ ballPosition: pos });
    },
  });

  readerView = new ReaderView(config, {
    onClose: closeReader,
    onPlayToggle: () => {
      void handlePlayToggle();
    },
    onStop: () => player.stop(),
    onPrevSentence: () => player.previousSentence(),
    onNextSentence: () => player.nextSentence(),
    onSeekSentence: handleSeekSentence,
    onPrevChapter: () => {
      void handleLoadChapter('prev', { isManual: true, autoPlay: isPlayerActive() });
    },
    onNextChapter: () => {
      void handleLoadChapter('next', { isManual: true, autoPlay: isPlayerActive() });
    },
    onRequestAppendNext: () => {
      void handleAppendNextChapter();
    },
    onOpenToc: () => {
      void handleOpenToc(false);
    },
    onRefreshToc: () => {
      void handleOpenToc(true);
    },
    onLoadMoreToc: (nextPageUrl) => {
      void handleLoadMoreToc(nextPageUrl);
    },
    onSelectTocChapter: (url, title) => {
      void handleSelectTocChapter(url, title);
    },
    onOpenExternalToc: (url) => {
      window.location.href = url;
    },
    onVisibleChapterChange: (chapterId, chapterUrl, title) => {
      visibleChapterId = chapterId;
      bar.updateChapter(title, chapterUrl !== initialPageUrl ? chapterUrl : undefined);
      syncBrowserUrlAndTitle(chapterUrl, title);
    },
    onRateChange: handleRateChange,
    onVoiceChange: handleVoiceChange,
    onSaveConfig: handleSaveConfig,
    onTestConfig: handleTestConfig,
    onJumpChapterUrl: (url) => {
      window.location.href = url;
    },
    onSettingsChange: (patch: Partial<ReaderSettings>) => {
      ConfigStorage.saveReaderSettings(patch);
    },
    onToast: (msg) => bar.showToast(msg),
  });

  // 6. 挂载 UI 并检测自动进入阅读模式
  const tryAutoEnterReader = () => {
    if (!ConfigStorage.load().reader.autoEnter || readerView.isOpen()) {
      return;
    }
    const item = ensureInitialChapterParsed(true);
    if (
      item &&
      item.chapter.paragraphs.length >= 2 &&
      countEffectiveChars(item.chapter.paragraphs) >= 200
    ) {
      openReader();
    }
  };

  const mountUI = () => {
    const parent = document.documentElement || document.body;
    bar.mount(parent);
    readerView.mount(parent);
    tryAutoEnterReader();
  };

  if (document.readyState === 'loading') {
    bar.mount(document.documentElement || document.body);
    window.addEventListener('DOMContentLoaded', mountUI, { once: true });
  } else {
    mountUI();
  }

  if (typeof GM_registerMenuCommand === 'function') {
    try {
      GM_registerMenuCommand('显示/隐藏听书悬浮球', () => {
        if (readerView.isOpen()) {
          closeReader();
        }
        bar.toggleVisible();
      });
      GM_registerMenuCommand('开启/关闭阅读模式', () => {
        if (readerView.isOpen()) {
          closeReader();
        } else {
          openReader();
        }
      });
    } catch {
      // 忽略
    }
  }
}

// 启动入口
initNovelTTS();
