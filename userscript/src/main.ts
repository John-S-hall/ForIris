import { extractChapterContent } from './core/extractor';
import { NovelPlayer } from './core/player';
import { ConfigStorage } from './core/storage';
import { ChapterLoader } from './core/chapterLoader';
import { EdgeWorkerTTSProvider } from './core/tts/edgeWorker';
import { FloatingBar } from './ui/floatingBar';
import type { ChapterContent } from './core/tts/types';

export const VERSION = '0.2.0';

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
  let isActionPending = false;

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
        handleAutoNextChapter(false);
      },
    },
  });

  // 5. 下一章连播逻辑 (isManual: 是否用户手动点击)
  const handleAutoNextChapter = async (isManual = false) => {
    if (!nextChapterUrl) {
      bar.showToast('已播放至最后一章');
      return;
    }

    if (isActionPending) return;
    isActionPending = true;

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
      bar.updateChapter(loaded.title, loaded.nextChapterUrl, targetUrl);
      bar.showToast(`已开始播放：${loaded.title}`);

      // 同步浏览器地址与标题（同源策略安全防护）
      try {
        window.history.replaceState(null, '', targetUrl);
        document.title = loaded.title;
      } catch {
        // 跨域或沙箱环境静默忽略
      }

      // 无缝续播
      await player.playChapter(loaded);
    } catch (err: any) {
      console.warn('[NovelTTS] Failed to load next chapter silently:', err);

      // 手动点击「下一章」时遇到防爬限制 (如 403) 则兜底直接跳转
      if (isManual) {
        bar.showToast('防爬限制，正在直接跳转下一章…');
        setTimeout(() => {
          window.location.href = targetUrl;
        }, 300);
      } else {
        bar.showToast(`下一章加载失败: ${err?.message || err}`);
      }
    } finally {
      isActionPending = false;
    }
  };

  // 6. 初始化悬浮 UI
  const bar = new FloatingBar(config, {
    onPlayToggle: async () => {
      // 核心修复 3：第一行必须同步解锁，严禁放在 await 之后！
      player.unlockAllAudio();

      if (isActionPending) return;
      isActionPending = true;

      try {
        const state = player.getState();
        if (state === 'playing') {
          player.pause();
          return;
        }
        if (state === 'paused') {
          player.resume();
          return;
        }

        // 未配置 Worker 时干净处理：直接走系统语音，无需空等网络报错
        const currentCfg = ConfigStorage.load();
        if (!currentCfg.workerUrl) {
          player.switchToFallback('未配置 Worker，已自动使用系统语音朗读（可点齿轮配置）');
        }

        // 核心修复 5：若当前页面已解析过，直接重放或从当前进度启动，不重复弹“正在解析…”
        if (!currentChapter || currentChapter.paragraphs.length === 0) {
          bar.showToast('正在解析小说正文…');
          const extracted = extractChapterContent(document, window.location.href);

          if (!extracted || extracted.paragraphs.length === 0) {
            bar.showToast('未识别到小说正文，无法播放');
            return;
          }

          currentChapter = extracted;
          nextChapterUrl = extracted.nextChapterUrl;
          chapterLoader.markVisited(window.location.href);
          bar.updateChapter(extracted.title, extracted.nextChapterUrl);
        }

        await player.playChapter(currentChapter);
      } catch (err: any) {
        console.error('[NovelTTS] Play error:', err);
        bar.showToast(`播放失败: ${err?.message || err}`);
      } finally {
        isActionPending = false;
      }
    },
    onNextSentence: () => {
      player.nextSentence();
    },
    onPrevSentence: () => {
      player.previousSentence();
    },
    onNextChapter: () => {
      handleAutoNextChapter(true);
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
      ConfigStorage.save({ workerUrl, token });
      workerProvider.updateConfig(workerUrl, token);
      player.setProvider(workerProvider);
      bar.showToast('配置已保存并生效');
    },
    onTestConfig: async (workerUrl, token) => {
      return await workerProvider.testConnection(workerUrl, token);
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
