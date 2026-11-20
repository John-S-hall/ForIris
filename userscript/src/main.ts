import { extractChapterContent } from './core/extractor';
import { NovelPlayer } from './core/player';
import { ConfigStorage } from './core/storage';
import { ChapterLoader } from './core/chapterLoader';
import { EdgeWorkerTTSProvider } from './core/tts/edgeWorker';
import { FloatingBar } from './ui/floatingBar';
import type { ChapterContent } from './core/tts/types';

export const VERSION = '0.1.0';

function initNovelTTS(): void {
  // 1. 防重复挂载：严格禁止在子 iframe 中运行
  if (typeof window !== 'undefined' && window.self !== window.top) {
    return;
  }

  // 2. 加载用户跨站持久化配置
  const config = ConfigStorage.load();

  // 3. 初始化 Provider 与 辅助引擎
  const workerProvider = new EdgeWorkerTTSProvider({
    workerUrl: config.workerUrl || 'http://localhost:8787',
    token: config.token || 'dev-secret',
  });

  const chapterLoader = new ChapterLoader(window.location.href);
  let currentChapter: ChapterContent | null = null;
  let nextChapterUrl: string | null = null;

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
        handleAutoNextChapter();
      },
    },
  });

  // 5. 自动下一章连播逻辑
  const handleAutoNextChapter = async () => {
    if (!nextChapterUrl) {
      bar.showToast('已播放至最后一章');
      return;
    }

    bar.showToast('正在加载下一章…');
    try {
      const targetUrl = nextChapterUrl;
      const loaded = await chapterLoader.loadChapter(targetUrl);

      if (!loaded || loaded.paragraphs.length === 0) {
        bar.showToast('下一章正文提取失败或已到达全书末尾');
        return;
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
      console.error('[NovelTTS] Failed to auto advance chapter:', err);
      bar.showToast(`下一章加载失败: ${err.message || err}`);
    }
  };

  // 6. 初始化悬浮 UI
  const bar = new FloatingBar(config, {
    onPlayToggle: async () => {
      const state = player.getState();
      if (state === 'playing') {
        player.pause();
        return;
      }
      if (state === 'paused') {
        player.resume();
        return;
      }

      // 从 idle 状态启动播放
      if (!currentChapter) {
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

      // 未配置 Worker 时友好提示
      if (!config.workerUrl) {
        bar.showToast('未配置 Worker，将自动使用系统语音试听（可点右上角齿轮配置）');
      }

      await player.playChapter(currentChapter);
    },
    onNextSentence: () => {
      player.nextSentence();
    },
    onPrevSentence: () => {
      player.previousSentence();
    },
    onNextChapter: () => {
      handleAutoNextChapter();
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
    onJumpChapterUrl: (url) => {
      window.location.href = url;
    },
  });

  // 7. 挂载 UI 并注册油猴菜单
  const mountUI = () => {
    bar.mount(document.body);
  };

  if (document.body) {
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
