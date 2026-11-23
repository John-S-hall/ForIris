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
      pending: false,
      paused: false,
    };
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      rate = 1;
      volume = 1;
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
      synthesize: vi.fn().mockImplementation(async () => {
        return `blob:http://localhost/mock-audio-${++urlCounter}`;
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(mockProvider.synthesize).toHaveBeenCalled();
    const callCount = (mockProvider.synthesize as any).mock.calls.length;
    expect(callCount).toBeGreaterThanOrEqual(3);

    player.stop();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('setRate 不叠加修改 audio.playbackRate（保持 1.0），且不撤销正在播放的当前句 Blob', async () => {
    const player = new NovelPlayer({
      provider: mockProvider,
      rate: 1.0,
    });

    await player.playChapter(testChapter);
    const currentBlob = (player as any).audio.src;
    expect((player as any).audio.playbackRate).toBe(1.0);

    revokedUrls = [];
    player.setRate(1.5);

    // 必须保持 playbackRate === 1.0，不得造成双重倍速
    expect((player as any).audio.playbackRate).toBe(1.0);
    // 不得撤销正在播放的 currentIndex 的 Blob
    expect(revokedUrls).not.toContain(currentBlob);
  });

  it('预取/合成失败不投毒缓存：500ms 后重试会真正重新调用 synthesize', async () => {
    vi.useFakeTimers();
    let synthesizeCalls = 0;
    const flakyProvider: TTSProvider = {
      name: 'flaky-provider',
      synthesize: vi.fn().mockImplementation(async () => {
        synthesizeCalls++;
        if (synthesizeCalls <= 2) {
          throw new Error('Transient error');
        }
        return `blob:http://localhost/recovered-${synthesizeCalls}`;
      }),
    };

    const player = new NovelPlayer({
      provider: flakyProvider,
    });

    await player.playChapter(testChapter);
    // 第 1 轮 playCurrentSentence 内尝试 2 次均失败（calls = 2），进入 500ms 重试
    expect(synthesizeCalls).toBe(2);

    await vi.advanceTimersByTimeAsync(550);
    // 500ms 后重试应再次真正调用 synthesize 并恢复播放
    expect(synthesizeCalls).toBeGreaterThanOrEqual(3);
    expect(player.getState()).toBe('playing');
    expect(player.isFallbackMode()).toBe(false);
  });

  it('快速连点 nextSentence 竞态防御：旧句异步完成后不得抢占当前播放并主动释放过时 Blob', async () => {
    let resolvers: Array<(url: string) => void> = [];
    const delayedProvider: TTSProvider = {
      name: 'delayed-provider',
      synthesize: vi.fn().mockImplementation(() => {
        return new Promise<string>((resolve) => {
          resolvers.push(resolve);
        });
      }),
    };

    const player = new NovelPlayer({
      provider: delayedProvider,
    });

    const p1 = player.playChapter(testChapter); // index 0
    await Promise.resolve();
    player.nextSentence(); // index 1
    await Promise.resolve();

    // 先让过时的第 0 句 resolve
    resolvers[0]('blob:http://localhost/stale-0');
    await Promise.resolve();
    await p1;

    // 过时第 0 句不得覆写 audio.src，且应被销毁释放
    expect((player as any).audio.src).not.toBe('blob:http://localhost/stale-0');
    expect(revokedUrls).toContain('blob:http://localhost/stale-0');

    // 再让最新的第 1 句 resolve
    resolvers[1]('blob:http://localhost/fresh-1');
    await vi.waitFor(() => {
      expect((player as any).audio.src).toBe('blob:http://localhost/fresh-1');
    });
  });

  it('loading 阶段暂停后恢复：应重新加载当前句而不是保持静音', async () => {
    let resolveSynth!: (url: string) => void;
    const slowProvider: TTSProvider = {
      name: 'slow-provider',
      synthesize: vi.fn().mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveSynth = resolve;
          })
      ).mockImplementation(async () => 'blob:http://localhost/resumed-audio'),
    };

    const player = new NovelPlayer({
      provider: slowProvider,
    });

    const playPromise = player.playChapter(testChapter);
    expect(player.getState()).toBe('loading');

    player.pause();
    expect(player.getState()).toBe('paused');

    // 即使旧的慢请求此时完成，也不得把状态变回 playing
    resolveSynth('blob:http://localhost/late-audio');
    await playPromise;
    expect(player.getState()).toBe('paused');

    // 点击继续播放应重新加载并进入 playing
    player.resume();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(player.getState()).toBe('playing');
  });

  it('单句重试与连续 2 句失败自动无缝降级到 WebSpeech', async () => {
    const failingProvider: TTSProvider = {
      name: 'failing-provider',
      synthesize: vi.fn().mockImplementation(async () => {
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
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(player.isFallbackMode()).toBe(true);
    expect(toasts.some((t) => t.includes('系统语音朗读'))).toBe(true);
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it('setProvider 在系统语音降级播放中保存配置时，立即切回 Edge TTS 朗读', async () => {
    const failingProvider: TTSProvider = {
      name: 'failing-provider',
      synthesize: vi.fn().mockRejectedValue(new Error('HTTP 401')),
    };

    const player = new NovelPlayer({
      provider: failingProvider,
    });

    await player.playChapter(testChapter);
    await vi.waitFor(() => {
      expect(player.isFallbackMode()).toBe(true);
    }, { timeout: 1000 });
    expect(player.getState()).toBe('playing');

    // 修复配置并更新 Provider
    player.setProvider(mockProvider);
    await vi.waitFor(() => {
      expect(mockProvider.synthesize).toHaveBeenCalled();
      expect(player.getState()).toBe('playing');
    });

    expect(player.isFallbackMode()).toBe(false);
  });

  it('Media Session 控制回调联动（play, pause, nexttrack, previoustrack）', async () => {
    const player = new NovelPlayer({
      provider: mockProvider,
    });

    await player.playChapter(testChapter);
    const actions = (globalThis as any)._mediaSessionActions;

    actions.pause();
    expect(player.getState()).toBe('paused');

    actions.play();
    expect(player.getState()).toBe('playing');

    const initialIndex = player.getCurrentIndex();
    actions.nexttrack();
    expect(player.getCurrentIndex()).toBe(initialIndex + 1);

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
    player.nextSentence();

    expect(onChapterEndMock).toHaveBeenCalled();
    expect(player.getState()).toBe('idle');
  });

  it('unlockAllAudio 幂等同步解锁 audio 与 speechSynthesis', () => {
    const player = new NovelPlayer({
      provider: mockProvider,
    });

    player.unlockAllAudio();
    player.unlockAllAudio();

    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
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
