import { extractChapterContent, extractNextChapterUrl } from './core/extractor';
import { NovelPlayer } from './core/player';
import { ConfigStorage } from './core/storage';
import { ChapterLoader } from './core/chapterLoader';
import { EdgeWorkerTTSProvider } from './core/tts/edgeWorker';
import { FloatingBar } from './ui/floatingBar';
import type { ChapterContent } from './core/tts/types';

export const VERSION = '0.2.1';

function initNovelTTS(): void {
  // 1. 防重复挂载：严格禁止在子 iframe 中运行
  if (typeof window !== 'undefined' && window.self !== window.top) {
    return;
  }

  // 2. 加载用户跨站持久化配置
  const config = ConfigStorage.load();

  // 3. 初始化 Provider 与 辅助引擎
  const workerProvider = new EdgeWorkerTTSProvider({
    workerUrl: config.workerUrl || '',
    token: config.token || 'dev-secret',
  });

  const chapterLoader = new ChapterLoader(window.location.href);
  let currentChapter: ChapterContent | null = null;
  let nextChapterUrl: string | null = null;
  let lastSeenHref = window.location.href;
  let isChapterLoading = false;

  // 4. 初始化播放器
  const player = new NovelPlayer({
    provider: workerProvider,
    voice: config.voice,
    rate: config.rate,
    events: {
      onStateChange: (state) => {
        bar.updatePlayerState(state);
      },
      onIndexChange: (idx, total, text) => {
        bar.updateProgress(idx, total, text);
      },
      onToast: (msg) => {
        bar.showToast(msg);
      },
      onChapterEnd: () => {
        void handleAutoNextChapter(false);
      },
    },
  });

  // 按需解析当前页正文（页面未变更且已解析时直接复用，避免重复提取）
  const ensureCurrentChapterParsed = (): ChapterContent | null => {
    const href = window.location.href;
    if (!currentChapter || currentChapter.paragraphs.length === 0 || lastSeenHref !== href) {
      bar.showToast('正在解析小说正文…');
      const extracted = extractChapterContent(document, href);
      lastSeenHref = href;

      if (!extracted || extracted.paragraphs.length === 0) {
        currentChapter = null;
        nextChapterUrl = extracted?.nextChapterUrl ?? null;
        return null;
      }

      currentChapter = extracted;
      nextChapterUrl = extracted.nextChapterUrl;
      chapterLoader.markVisited(href);
      bar.updateChapter(extracted.title);
    }
    return currentChapter;
  };

  // 5. 下一章连播逻辑 (isManual: 是否用户手动点击)
  const handleAutoNextChapter = async (isManual = false) => {
    if (isManual) {
      player.unlockAllAudio({ audio: true, speech: true });
    }

    if (isChapterLoading) return;

    // 若用户进入页面后未先点播放就直接点“下一章”，实时从当前 DOM 兜底提取下一章链接
    if (!nextChapterUrl) {
      nextChapterUrl = extractNextChapterUrl(document, window.location.href);
    }

    if (!nextChapterUrl) {
      bar.showToast('已播放至最后一章');
      return;
    }

    if (player.getState() !== 'idle') {
      player.stop();
    }

    isChapterLoading = true;
    bar.showToast('正在加载下一章…');
    const targetUrl = nextChapterUrl;

    try {
      const loaded = await chapterLoader.loadChapter(targetUrl);

      if (!loaded || loaded.paragraphs.length === 0) {
        throw new Error('下一章正文提取失败或已到达全书末尾');
      }

      currentChapter = loaded;
      nextChapterUrl = loaded.nextChapterUrl;

      // 更新 UI 信息
      bar.updateChapter(loaded.title, targetUrl);
      bar.showToast(`已开始播放：${loaded.title}`);

      // 同步浏览器地址与标题（同源策略安全防护）
      try {
        window.history.replaceState(null, '', targetUrl);
        document.title = loaded.title;
      } catch {
        // 跨域或沙箱环境静默忽略
      }
      lastSeenHref = window.location.href;

      if (!ConfigStorage.load().workerUrl.trim()) {
        player.switchToFallback();
      }

      // 无缝续播
      await player.playChapter(loaded);
    } catch (err: any) {
      console.warn('[NovelTTS] Failed to load next chapter silently:', err);

      // 手动点击「下一章」时遇到防爬限制 (如 403) 则兜底直接跳转
      if (isManual) {
        bar.showToast('静默加载受限，正在直接跳转下一章…');
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 300);
      } else {
        bar.showToast(`下一章自动加载失败 (${err?.message || err})，可点下一章直接跳转`);
      }
    } finally {
      isChapterLoading = false;
    }
  };

  // 6. 初始化悬浮 UI
  const bar = new FloatingBar(config, {
    onPlayToggle: async () => {
      if (isChapterLoading) {
        bar.showToast('正在加载下一章，请稍候…');
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
        // 未配置 Worker 时直接走系统语音，避免插入空 dummy utterance 导致 iOS 吞掉首句
        player.switchToFallback('未配置 Worker，已自动使用系统语音朗读（可点齿轮配置）');
      }

      try {
        const chapter = ensureCurrentChapterParsed();
        if (!chapter) {
          bar.showToast('未识别到小说正文，无法播放');
          return;
        }

        await player.playChapter(chapter);
      } catch (err: any) {
        console.error('[NovelTTS] Play error:', err);
        bar.showToast(`播放失败: ${err?.message || err}`);
      }
    },
    onNextSentence: () => {
      player.nextSentence();
    },
    onPrevSentence: () => {
      player.previousSentence();
    },
    onNextChapter: () => {
      void handleAutoNextChapter(true);
    },
    onRateChange: (rate) => {
      player.setRate(rate);
      ConfigStorage.save({ rate });
    },
    onVoiceChange: (voice) => {
      player.setVoice(voice);
      ConfigStorage.save({ voice });
    },
    onSaveConfig: (workerUrl, token) => {
      const trimmedUrl = workerUrl.trim();
      const effectiveToken = token.trim() || 'dev-secret';
      ConfigStorage.save({ workerUrl: trimmedUrl, token: effectiveToken });
      bar.syncConfigInputs(trimmedUrl, effectiveToken);

      if (trimmedUrl) {
        workerProvider.updateConfig(trimmedUrl, effectiveToken);
        player.setProvider(workerProvider);
        bar.showToast('配置已保存并生效');
      } else {
        workerProvider.updateConfig('', effectiveToken);
        player.switchToFallback('已清空 Worker 地址，将使用系统语音朗读');
      }
    },
    onTestConfig: async (workerUrl, token) => {
      const effectiveToken = token.trim() || 'dev-secret';
      return await workerProvider.testConnection(workerUrl, effectiveToken);
    },
    onJumpChapterUrl: (url) => {
      window.location.href = url;
    },
    onBallPositionChange: (pos) => {
      ConfigStorage.save({ ballPosition: pos });
    },
  });

  // 7. 挂载 UI（挂载至 documentElement，确保最高层级与防 body overflow）
  const mountUI = () => {
    bar.mount(document.documentElement || document.body);
  };

  if (document.documentElement || document.body) {
    mountUI();
  } else {
    window.addEventListener('DOMContentLoaded', mountUI);
  }

  if (typeof GM_registerMenuCommand === 'function') {
    try {
      GM_registerMenuCommand('显示/隐藏听书悬浮球', () => {
        bar.toggleVisible();
      });
    } catch {
      // 忽略
    }
  }
}

// 启动入口
initNovelTTS();
