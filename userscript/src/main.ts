import {
  extractChapterContent,
  extractNextChapterUrl,
  extractPrevChapterUrl,
  findContentElement,
} from './core/extractor';
import { chunkParagraphs, type StructuredChunk } from './core/chunker';
import { NovelPlayer } from './core/player';
import { ConfigStorage, type ReaderSettings } from './core/storage';
import { ChapterLoader } from './core/chapterLoader';
import { EdgeWorkerTTSProvider } from './core/tts/edgeWorker';
import { FloatingBar } from './ui/floatingBar';
import { ReaderView } from './ui/readerView';
import { PageHighlighter } from './ui/pageHighlighter';
import type { ChapterContent } from './core/tts/types';

export const VERSION = '0.3.0';

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

  let currentChapter: ChapterContent | null = null;
  let currentChunks: StructuredChunk[] = [];
  let currentChapterUrl = initialPageUrl;
  let activeChunkIndex = -1;
  let lastSeenHref = initialPageUrl;
  let isChapterLoading = false;

  let bar!: FloatingBar;
  let readerView!: ReaderView;

  const isPlayerActive = (): boolean => {
    const state = player.getState();
    return state === 'playing' || state === 'loading' || state === 'paused';
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
          readerView.setActiveChunk(-1);
        }
      },
      onIndexChange: (idx, total, text) => {
        activeChunkIndex = idx;
        bar.updateProgress(idx, total, text);
        readerView.updateProgress(idx, total);
        readerView.setActiveChunk(idx);

        if (!readerView.isOpen() && currentChapterUrl === initialPageUrl) {
          pageHighlighter.highlight(text);
        }
      },
      onToast: (msg) => {
        bar.showToast(msg);
      },
      onChapterEnd: () => {
        void handleLoadChapter('next', { isManual: false, autoPlay: true });
      },
    },
  });

  // 按需解析当前页正文（页面未变更且已解析时直接复用，避免重复提取）
  const ensureCurrentChapterParsed = (silent = false): ChapterContent | null => {
    const href = window.location.href;
    if (!currentChapter || currentChapter.paragraphs.length === 0 || lastSeenHref !== href) {
      if (!silent) {
        bar.showToast('正在解析小说正文…');
      }
      const extracted = extractChapterContent(document, href);
      lastSeenHref = href;

      if (!extracted || extracted.paragraphs.length === 0) {
        currentChapter = null;
        currentChunks = [];
        return null;
      }

      currentChapter = extracted;
      currentChapterUrl = href;
      currentChunks = chunkParagraphs(extracted.paragraphs);
      chapterLoader.markVisited(href);
      pageHighlighter.setContainer(findContentElement(document));
      bar.updateChapter(extracted.title);
    }
    return currentChapter;
  };

  // 打开 / 关闭阅读模式
  const openReader = (): void => {
    const chapter = ensureCurrentChapterParsed(true);
    if (!chapter || currentChunks.length === 0) {
      bar.showToast('未识别到小说正文，无法开启阅读模式');
      return;
    }

    pageHighlighter.clear();
    const isCrossChapter = currentChapterUrl !== initialPageUrl;
    readerView.renderChapter(
      chapter,
      currentChunks,
      isCrossChapter ? currentChapterUrl : undefined
    );
    readerView.updatePlayerState(player.getState());
    readerView.updateProgress(
      activeChunkIndex >= 0 ? activeChunkIndex : -1,
      currentChunks.length
    );

    const latestCfg = ConfigStorage.load();
    readerView.syncRate(latestCfg.rate);
    readerView.syncVoice(latestCfg.voice);
    readerView.syncConfigInputs(latestCfg.workerUrl, latestCfg.token);
    readerView.applySettings(latestCfg.reader);

    bar.setSuppressed(true);
    readerView.open();

    if (activeChunkIndex >= 0 && isPlayerActive()) {
      readerView.setActiveChunk(activeChunkIndex);
    }
  };

  const closeReader = (): void => {
    readerView.close();
    bar.setSuppressed(false);

    if (isPlayerActive() && activeChunkIndex >= 0 && currentChapterUrl === initialPageUrl) {
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

    // idle / error 状态启动播放：必须在任何 await 之前同步解锁！
    const currentCfg = ConfigStorage.load();
    const hasWorker = Boolean(currentCfg.workerUrl.trim());

    if (hasWorker) {
      player.unlockAllAudio({ audio: true, speech: true });
    } else {
      player.switchToFallback('未配置 Worker，已自动使用系统语音朗读（可点齿轮配置）');
    }

    try {
      const chapter = ensureCurrentChapterParsed(readerView.isOpen());
      if (!chapter) {
        bar.showToast('未识别到小说正文，无法播放');
        return;
      }

      if (!readerView.isOpen() && currentChapterUrl === initialPageUrl) {
        pageHighlighter.setContainer(findContentElement(document));
      }

      await player.playChapter(chapter);
    } catch (err: any) {
      console.error('[NovelTTS] Play error:', err);
      bar.showToast(`播放失败: ${err?.message || err}`);
    }
  };

  // 从阅读模式双击任意句直接起播 / 跳转（严格同步首行解锁）
  const handleSeekSentence = (chunkIndex: number): void => {
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

    const chapter = ensureCurrentChapterParsed(true);
    if (!chapter || currentChunks.length === 0) {
      bar.showToast('未识别到小说正文，无法播放');
      return;
    }

    const safeIndex = Math.max(0, Math.min(chunkIndex, currentChunks.length - 1));
    bar.showToast(`从第 ${safeIndex + 1} 句开始朗读`);

    if (player.getState() === 'idle' || player.getSentences().length === 0) {
      void player.playChapter(chapter, safeIndex);
    } else {
      player.seek(safeIndex);
    }
  };

  // 上/下一章静默加载与无缝协同
  const handleLoadChapter = async (
    direction: 'prev' | 'next',
    options: { isManual: boolean; autoPlay: boolean }
  ): Promise<void> => {
    if (options.isManual && options.autoPlay) {
      player.unlockAllAudio({ audio: true, speech: true });
    }

    if (isChapterLoading) return;

    let targetUrl: string | null = null;
    if (direction === 'next') {
      targetUrl =
        currentChapter?.nextChapterUrl || extractNextChapterUrl(document, window.location.href);
    } else {
      targetUrl =
        currentChapter?.prevChapterUrl || extractPrevChapterUrl(document, window.location.href);
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

      currentChapter = loaded;
      currentChapterUrl = targetUrl;
      currentChunks = chunkParagraphs(loaded.paragraphs);
      activeChunkIndex = -1;
      pageHighlighter.resetPosition();

      const isCrossChapter = targetUrl !== initialPageUrl;
      bar.updateChapter(loaded.title, isCrossChapter ? targetUrl : undefined);
      readerView.renderChapter(
        loaded,
        currentChunks,
        isCrossChapter ? targetUrl : undefined
      );

      // 同步浏览器地址与标题（同源策略安全防护）
      try {
        window.history.replaceState(null, '', targetUrl);
        document.title = loaded.title;
      } catch {
        // 跨域或沙箱环境静默忽略
      }
      lastSeenHref = window.location.href;

      if (options.autoPlay) {
        bar.showToast(`已开始播放：${loaded.title}`);
        if (!ConfigStorage.load().workerUrl.trim()) {
          player.switchToFallback();
        }
        await player.playChapter(loaded);
      } else {
        bar.updateProgress(-1, currentChunks.length);
        readerView.updateProgress(-1, currentChunks.length);
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

  // 5. 初始化精简版悬浮 UI 与仿夸克阅读模式 UI
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
    const chapter = ensureCurrentChapterParsed(true);
    if (chapter && chapter.paragraphs.length >= 2 && countEffectiveChars(chapter.paragraphs) >= 200) {
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
