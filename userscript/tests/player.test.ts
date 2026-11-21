import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NovelPlayer } from '../src/core/player';
import type { ChapterContent, TTSProvider } from '../src/core/tts/types';

describe('player.ts - 核心播放器与预取状态机', () => {
  let mockProvider: TTSProvider;
  let createdUrls: string[] = [];
  let revokedUrls: string[] = [];
  let urlCounter = 0;

  beforeEach(() => {
    createdUrls = [];
    revokedUrls = [];
    urlCounter = 0;

    URL.createObjectURL = vi.fn().mockImplementation(() => {
      const u = `blob:http://localhost/mock-audio-${++urlCounter}`;
      createdUrls.push(u);
      return u;
    });

    URL.revokeObjectURL = vi.fn().mockImplementation((url: string) => {
      revokedUrls.push(url);
    });

    // Mock HTMLMediaElement play & pause
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn().mockReturnValue(undefined);

    // Mock Navigator MediaSession
    const mediaSessionActions: Record<string, () => void> = {};
    (navigator as any).mediaSession = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn().mockImplementation((action: string, handler: () => void) => {
        mediaSessionActions[action] = handler;
      }),
    };
    (globalThis as any)._mediaSessionActions = mediaSessionActions;

    // Mock window.speechSynthesis
    (window as any).speechSynthesis = {
      speak: vi.fn().mockImplementation((utterance: any) => {
        setTimeout(() => utterance.onstart?.(), 5);
        setTimeout(() => utterance.onend?.(), 20);
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      speaking: false,
      paused: false,
    };
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      rate = 1;
      lang = 'zh-CN';
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((err: any) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };

    mockProvider = {
      name: 'mock-provider',
      synthesize: vi.fn().mockImplementation(async (text: string) => {
        return `blob:http://localhost/mock-audio-${++urlCounter}`;
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const testChapter: ChapterContent = {
    title: '第一章 破晓',
    paragraphs: [
      '清晨明媚的阳光柔和地洒在广袤无垠的翠绿平原之上，微风吹拂着娇嫩青翠的草尖轻轻摇曳。',
      '少年缓缓从沉睡的梦境中苏醒过来，揉了揉惺忪的睡眼，推开略显破旧的木制房门走向庭院。',
      '远方连绵起伏的山峦在初升晨曦的照耀下泛着一层淡淡的金色光晕，宛如巨龙静卧在天地之间。',
      '他深深地知道，新一天的残酷极限特训又要开始了，绝对没有任何时间继续犹豫和退缩。',
      '深吸了一口山林间清凉湿润的空气，他神色坚定地握紧了手中那一柄磨砺多年的粗木长剑。',
    ],
    nextChapterUrl: 'http://localhost/chapter_2.html',
  };

  it('播放器状态机正常流转（idle -> loading -> playing -> paused -> idle）', async () => {
    const states: string[] = [];
    const player = new NovelPlayer({
      provider: mockProvider,
      events: {
        onStateChange: (state) => states.push(state),
      },
    });

    expect(player.getState()).toBe('idle');

    await player.playChapter(testChapter);
    expect(player.getState()).toBe('playing');
    expect(states).toContain('loading');
    expect(states).toContain('playing');

    player.pause();
    expect(player.getState()).toBe('paused');
    expect(navigator.mediaSession.playbackState).toBe('paused');

    player.resume();
    expect(player.getState()).toBe('playing');
    expect(navigator.mediaSession.playbackState).toBe('playing');

    player.stop();
    expect(player.getState()).toBe('idle');
  });

  it('预取队列行为：触发 N+1 与 N+2 预取，并在停止时调用 revokeObjectURL 释放内存', async () => {
    const player = new NovelPlayer({
      provider: mockProvider,
    });

    await player.playChapter(testChapter);
    // 首次播放第 0 句时，应当合成第 0 句，并触发第 1 句和第 2 句的预取
    expect(mockProvider.synthesize).toHaveBeenCalled();
    const callCount = (mockProvider.synthesize as any).mock.calls.length;
    // 应当调用了当前句 + 预取下 2 句（共 3 次）
    expect(callCount).toBeGreaterThanOrEqual(3);

    // 停止播放时，必须触发已生成 Blob URL 的释放
    player.stop();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('单句重试与连续 2 句失败自动无缝降级到 WebSpeech', async () => {
    let failureCount = 0;
    const failingProvider: TTSProvider = {
      name: 'failing-provider',
      synthesize: vi.fn().mockImplementation(async () => {
        failureCount++;
        throw new Error('Connection refused');
      }),
    };

    const toasts: string[] = [];
    const player = new NovelPlayer({
      provider: failingProvider,
      events: {
        onToast: (msg) => toasts.push(msg),
      },
    });

    await player.playChapter(testChapter);

    // 等待两次连续失败后的自动降级切换
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(player.isFallbackMode()).toBe(true);
    expect(toasts.some((t) => t.includes('系统语音朗读'))).toBe(true);
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it('Media Session 控制回调联动（play, pause, nexttrack, previoustrack）', async () => {
    const player = new NovelPlayer({
      provider: mockProvider,
    });

    await player.playChapter(testChapter);
    const actions = (globalThis as any)._mediaSessionActions;

    // 触发锁屏暂停
    actions.pause();
    expect(player.getState()).toBe('paused');

    // 触发锁屏继续播放
    actions.play();
    expect(player.getState()).toBe('playing');

    // 触发切下一句
    const initialIndex = player.getCurrentIndex();
    actions.nexttrack();
    expect(player.getCurrentIndex()).toBe(initialIndex + 1);

    // 触发切上一句
    actions.previoustrack();
    expect(player.getCurrentIndex()).toBe(initialIndex);
  });

  it('最后一章播放完毕时触发 onChapterEnd 事件', async () => {
    const onChapterEndMock = vi.fn();
    const shortChapter: ChapterContent = {
      title: '短章节',
      paragraphs: ['这是唯一的一句话，也是全文的终结。'],
      nextChapterUrl: null,
    };

    const player = new NovelPlayer({
      provider: mockProvider,
      events: {
        onChapterEnd: onChapterEndMock,
      },
    });

    await player.playChapter(shortChapter);
    // 直接调用切下一句以触发本章结束
    player.nextSentence();

    expect(onChapterEndMock).toHaveBeenCalled();
    expect(player.getState()).toBe('idle');
  });

  it('unlockAllAudio 同步调用解锁 audio 与 speechSynthesis', () => {
    const player = new NovelPlayer({
      provider: mockProvider,
    });
    player.unlockAllAudio();
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it('play 遭遇 NotAllowedError 时回滚为 paused 状态并弹出提示', async () => {
    const toasts: string[] = [];
    window.HTMLMediaElement.prototype.play = vi.fn().mockRejectedValue({
      name: 'NotAllowedError',
      message: 'The play method is not allowed by user gesture',
    });

    const player = new NovelPlayer({
      provider: mockProvider,
      events: {
        onToast: (msg) => toasts.push(msg),
      },
    });

    await player.playChapter(testChapter);

    expect(player.getState()).toBe('paused');
    expect(toasts.some((t) => t.includes('再点一次播放解锁声音'))).toBe(true);
  });

  it('未配置 Worker 时可主动切换至 switchToFallback 模式', () => {
    const toasts: string[] = [];
    const player = new NovelPlayer({
      provider: mockProvider,
      events: {
        onToast: (msg) => toasts.push(msg),
      },
    });

    player.switchToFallback('未配置 Worker，已自动使用系统语音朗读');
    expect(player.isFallbackMode()).toBe(true);
    expect(toasts.some((t) => t.includes('系统语音朗读'))).toBe(true);
  });
});
