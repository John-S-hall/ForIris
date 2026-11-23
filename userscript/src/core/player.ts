import type { ChapterContent, PlayerState, TTSOptions, TTSProvider } from './tts/types';
import { WebSpeechEngine } from './tts/webSpeech';
import { chunkText } from './chunker';

export interface PlayerEvents {
  onStateChange?: (state: PlayerState) => void;
  onIndexChange?: (index: number, total: number, currentSentence: string) => void;
  onChapterEnd?: () => void;
  onToast?: (message: string) => void;
  onError?: (error: Error) => void;
}

export interface PlayerConfig {
  provider: TTSProvider;
  voice?: string;
  rate?: number;
  events?: PlayerEvents;
}

export interface UnlockOptions {
  audio?: boolean;
  speech?: boolean;
}

interface CacheItem {
  blobUrl?: string;
  promise?: Promise<string>;
  abortController: AbortController;
}

const MAX_CACHE_SIZE = 3;
const SILENT_AUDIO_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export class NovelPlayer {
  private state: PlayerState = 'idle';
  private provider: TTSProvider;
  private webSpeechEngine: WebSpeechEngine;
  private isUsingFallback = false;

  // 单例音频实例与解锁状态
  private audio: HTMLAudioElement;
  private isAudioUnlocked = false;
  private isSpeechUnlocked = false;

  // 异步竞态控制与重试定时器
  private playToken = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  // 章节与句子队列
  private currentChapter: ChapterContent | null = null;
  private sentences: string[] = [];
  private currentIndex = 0;

  // 预取缓存池 (最多 3 条)
  private prefetchCache = new Map<number, CacheItem>();

  // 播放配置
  private voice: string;
  private rate: number;

  // 容错与重试计数
  private consecutiveFailures = 0;

  // 事件回调
  private events: PlayerEvents;

  // Wake Lock
  private wakeLockSentinel: any = null;

  constructor(config: PlayerConfig) {
    this.provider = config.provider;
    this.voice = config.voice || 'zh-CN-XiaoxiaoNeural';
    this.rate = config.rate ?? 1.0;
    this.events = config.events || {};
    this.webSpeechEngine = new WebSpeechEngine();

    // 初始化单例 audio 元素
    this.audio = typeof Audio !== 'undefined' ? new Audio() : ({} as HTMLAudioElement);
    this.setupAudioListeners();
    this.setupMediaSession();
  }

  // ─── 状态机管理 ────────────────────────────────────────────────────────

  getState(): PlayerState {
    return this.state;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  getSentences(): string[] {
    return this.sentences;
  }

  isFallbackMode(): boolean {
    return this.isUsingFallback;
  }

  setEvents(events: PlayerEvents): void {
    this.events = { ...this.events, ...events };
  }

  setProvider(provider: TTSProvider): void {
    const wasActive = this.state === 'playing' || this.state === 'loading';
    const wasFallback = this.isUsingFallback;

    this.provider = provider;
    this.isUsingFallback = false;
    this.consecutiveFailures = 0;
    this.clearRetryTimer();
    this.clearPrefetchCache();

    if (wasActive) {
      if (wasFallback) {
        this.webSpeechEngine.cancel();
      } else if (this.audio && typeof this.audio.pause === 'function') {
        this.audio.pause();
      }
      void this.playCurrentSentence();
    }
  }

  switchToFallback(reason?: string): void {
    this.isUsingFallback = true;
    this.clearPrefetchCache();
    if (reason) {
      this.events.onToast?.(reason);
    }
  }

  private setState(newState: PlayerState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.events.onStateChange?.(newState);
    this.updateMediaSessionState();
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  // ─── 音频事件与同步解锁 ──────────────────────────────────────────────────

  private setupAudioListeners(): void {
    if (!this.audio || typeof this.audio.addEventListener !== 'function') return;

    this.audio.addEventListener('ended', () => {
      if (this.state !== 'playing' || !this.audio.src || this.audio.src === SILENT_AUDIO_WAV) {
        return;
      }
      this.handleSentenceEnd();
    });

    this.audio.addEventListener('error', () => {
      if (this.state !== 'playing' || !this.audio.src || this.audio.src === SILENT_AUDIO_WAV) {
        return;
      }
      void this.handlePlaybackFailure(new Error('Audio playback error'), this.playToken);
    });
  }

  /**
   * 同步解锁函数：必须在播放手势的第一行同步调用
   * 幂等解锁：1) <audio> 实例；2) window.speechSynthesis
   */
  unlockAllAudio(opts: UnlockOptions = {}): void {
    const unlockAudio = opts.audio ?? true;
    const unlockSpeech = opts.speech ?? true;

    // 1. 同步解锁单例 HTMLAudioElement
    if (
      unlockAudio &&
      !this.isAudioUnlocked &&
      this.audio &&
      typeof this.audio.play === 'function'
    ) {
      try {
        if (!this.audio.src || this.audio.src === '' || this.audio.src === SILENT_AUDIO_WAV) {
          this.audio.src = SILENT_AUDIO_WAV;
          this.isAudioUnlocked = true;
          const playPromise = this.audio.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise
              .then(() => {
                this.isAudioUnlocked = true;
              })
              .catch((err: any) => {
                if (err?.name === 'NotAllowedError') {
                  this.isAudioUnlocked = false;
                }
              });
          }
        }
      } catch {
        this.isAudioUnlocked = false;
      }
    }

    // 2. 同步解锁 window.speechSynthesis
    if (
      unlockSpeech &&
      !this.isSpeechUnlocked &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    ) {
      try {
        const dummyUtterance = new SpeechSynthesisUtterance('');
        dummyUtterance.volume = 0;
        window.speechSynthesis.speak(dummyUtterance);
        this.isSpeechUnlocked = true;
      } catch {
        this.isSpeechUnlocked = false;
      }
    }
  }

  // ─── 后台保活：Media Session 与 Wake Lock ────────────────────────────

  private setupMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const session = navigator.mediaSession;
    try {
      session.setActionHandler('play', () => this.resume());
      session.setActionHandler('pause', () => this.pause());
      session.setActionHandler('previoustrack', () => this.previousSentence());
      session.setActionHandler('nexttrack', () => this.nextSentence());
    } catch {
      // 忽略部分平台不支持某些 action
    }
  }

  private updateMediaSessionMetadata(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !this.currentChapter) {
      return;
    }

    const currentText = this.sentences[this.currentIndex] || '';
    const progress = `(${this.currentIndex + 1}/${this.sentences.length})`;

    try {
      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `${this.currentChapter.title} ${progress}`,
          artist: 'NovelTTS 朗读器',
          album: currentText.slice(0, 30),
        });
      }
    } catch {
      // 忽略环境差异
    }
  }

  private updateMediaSessionState(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      if (this.state === 'playing') {
        navigator.mediaSession.playbackState = 'playing';
      } else if (this.state === 'paused') {
        navigator.mediaSession.playbackState = 'paused';
      } else {
        navigator.mediaSession.playbackState = 'none';
      }
    } catch {
      // 忽略
    }
  }

  private async requestWakeLock(): Promise<void> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      if (!this.wakeLockSentinel) {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      }
    } catch {
      // 部分浏览器安全策略静默忽略
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release();
      } catch {
        // 忽略
      }
      this.wakeLockSentinel = null;
    }
  }

  // ─── 预取队列与内存管理 ───────────────────────────────────────────────

  /**
   * 彻底清空并释放所有预取缓存中的 Blob URL 及正在进行的请求
   */
  private clearPrefetchCache(): void {
    this.prefetchCache.forEach((item) => {
      try {
        item.abortController.abort();
      } catch {
        // 忽略
      }
      if (item.blobUrl) {
        try {
          URL.revokeObjectURL(item.blobUrl);
        } catch {
          // 忽略
        }
      }
    });
    this.prefetchCache.clear();
  }

  /**
   * 仅清理未来预取缓存（保留当前正在播放句的 Blob URL，防止中断）
   */
  private clearFuturePrefetchCache(): void {
    this.prefetchCache.forEach((item, key) => {
      if (key === this.currentIndex) return;
      try {
        item.abortController.abort();
      } catch {
        // 忽略
      }
      if (item.blobUrl) {
        try {
          URL.revokeObjectURL(item.blobUrl);
        } catch {
          // 忽略
        }
      }
      this.prefetchCache.delete(key);
    });
  }

  /**
   * 释放单条已播放完毕或无用的缓存
   */
  private revokeCacheItem(index: number): void {
    const item = this.prefetchCache.get(index);
    if (!item) return;

    try {
      item.abortController.abort();
    } catch {
      // 忽略
    }
    if (item.blobUrl) {
      try {
        URL.revokeObjectURL(item.blobUrl);
      } catch {
        // 忽略
      }
    }
    this.prefetchCache.delete(index);
  }

  /**
   * 触发预取下一个与下下个句子 (N+1, N+2)
   */
  private triggerPrefetch(): void {
    if (this.isUsingFallback) return;

    const next1 = this.currentIndex + 1;
    const next2 = this.currentIndex + 2;

    if (next1 < this.sentences.length) {
      this.fetchSentenceBlob(next1).catch(() => {});
    }
    if (next2 < this.sentences.length) {
      this.fetchSentenceBlob(next2).catch(() => {});
    }

    // 硬限制：清理超出当前视野的过期缓存，确保总数 <= MAX_CACHE_SIZE
    this.prefetchCache.forEach((_, key) => {
      if (key < this.currentIndex || key > this.currentIndex + 2) {
        this.revokeCacheItem(key);
      }
    });
  }

  /**
   * 获取或并发请求指定句子的音频 Blob URL
   */
  private async fetchSentenceBlob(index: number): Promise<string> {
    if (index < 0 || index >= this.sentences.length) {
      throw new Error(`Sentence index out of range: ${index}`);
    }

    const cached = this.prefetchCache.get(index);
    if (cached) {
      if (cached.blobUrl) return cached.blobUrl;
      if (cached.promise) return cached.promise;
    }

    // 若缓存已满（>= 3），清理掉距离最远的条目
    if (this.prefetchCache.size >= MAX_CACHE_SIZE) {
      const keys = Array.from(this.prefetchCache.keys());
      const furthestKey = keys.reduce((max, curr) =>
        Math.abs(curr - this.currentIndex) > Math.abs(max - this.currentIndex) ? curr : max
      );
      this.revokeCacheItem(furthestKey);
    }

    const abortController = new AbortController();
    const text = this.sentences[index];
    const options: TTSOptions = {
      voice: this.voice,
      rate: this.rate,
      signal: abortController.signal,
    };

    const item: CacheItem = { abortController };

    const promise = (async () => {
      try {
        let lastError: Error | null = null;
        // 失败重试 1 次规则
        for (let attempt = 0; attempt < 2; attempt++) {
          if (abortController.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          try {
            const blobUrl = await this.provider.synthesize(text, options);
            // 若在合成完成前缓存已被撤销/替换，立即释放刚创建的 Blob URL 防止泄漏
            if (abortController.signal.aborted || this.prefetchCache.get(index) !== item) {
              try {
                URL.revokeObjectURL(blobUrl);
              } catch {
                // ignore
              }
              throw new DOMException('Aborted', 'AbortError');
            }
            item.blobUrl = blobUrl;
            return blobUrl;
          } catch (err: any) {
            if (err?.name === 'AbortError') throw err;
            lastError = err instanceof Error ? err : new Error(String(err));
          }
        }
        throw lastError || new Error(`Failed to synthesize sentence ${index}`);
      } catch (err) {
        // 彻底删除失败/取消项，避免下次重用已失败 Promise（防缓存投毒）
        if (this.prefetchCache.get(index) === item) {
          this.prefetchCache.delete(index);
        }
        throw err;
      }
    })();

    item.promise = promise;
    this.prefetchCache.set(index, item);

    return promise;
  }

  // ─── 核心播放逻辑 ─────────────────────────────────────────────────────

  /**
   * 载入章节并开始播放
   */
  async playChapter(chapter: ChapterContent, startIndex = 0): Promise<void> {
    this.clearRetryTimer();
    this.playToken++;

    if (this.state !== 'idle') {
      this.stop();
    } else {
      this.clearPrefetchCache();
    }

    this.currentChapter = chapter;
    this.sentences = chunkText(chapter.paragraphs);

    if (this.sentences.length === 0) {
      this.events.onToast?.('未识别到小说正文，无法播放');
      this.setState('idle');
      return;
    }

    this.currentIndex = Math.max(0, Math.min(startIndex, this.sentences.length - 1));
    await this.playCurrentSentence();
  }

  /**
   * 播放当前索引所指向的句子
   */
  private async playCurrentSentence(): Promise<void> {
    this.clearRetryTimer();
    const token = ++this.playToken;

    if (this.currentIndex >= this.sentences.length) {
      this.handleChapterEnd();
      return;
    }

    this.setState('loading');
    this.updateMediaSessionMetadata();
    this.events.onIndexChange?.(
      this.currentIndex,
      this.sentences.length,
      this.sentences[this.currentIndex]
    );

    // 1. 若当前处于兜底降级模式，直接走 WebSpeech
    if (this.isUsingFallback) {
      this.playViaWebSpeech(this.sentences[this.currentIndex]);
      return;
    }

    // 2. 正常 Edge Worker 播放流程
    try {
      const blobUrl = await this.fetchSentenceBlob(this.currentIndex);
      if (token !== this.playToken || this.state !== 'loading') {
        return;
      }

      // Edge Worker 已通过 SSML 合成目标语速，playbackRate 始终固定为 1.0
      this.audio.playbackRate = 1.0;
      this.audio.src = blobUrl;
      const playPromise = this.audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        try {
          await playPromise;
        } catch (playErr: any) {
          if (token !== this.playToken) {
            try {
              this.audio.pause();
            } catch {
              // ignore
            }
            return;
          }
          // iOS Safari 自动播放拦截处理 (NotAllowedError)
          if (playErr?.name === 'NotAllowedError') {
            this.isAudioUnlocked = false;
            this.setState('paused');
            this.events.onToast?.('请再点一次播放解锁声音');
            return;
          }
          throw playErr;
        }
      }

      if (token !== this.playToken) {
        try {
          this.audio.pause();
        } catch {
          // ignore
        }
        return;
      }

      this.isAudioUnlocked = true;
      this.setState('playing');
      this.consecutiveFailures = 0; // 成功播放重置连续错误计数
      await this.requestWakeLock();

      if (token !== this.playToken || this.getState() !== 'playing') {
        return;
      }

      // 播放成功后并发预取 N+1, N+2
      this.triggerPrefetch();
    } catch (err: any) {
      if (token !== this.playToken || err?.name === 'AbortError') return;
      await this.handlePlaybackFailure(err instanceof Error ? err : new Error(String(err)), token);
    }
  }

  /**
   * 单句播放失败与自动降级处理
   */
  private async handlePlaybackFailure(error: Error, token: number): Promise<void> {
    if (token !== this.playToken) return;

    this.consecutiveFailures++;

    // 若连续 2 句失败，自动无缝降级到 WebSpeech
    if (this.consecutiveFailures >= 2) {
      this.isUsingFallback = true;
      this.clearPrefetchCache();
      this.events.onToast?.(`Edge TTS 异常 (${error.message})，已自动切换为系统语音朗读`);
      this.playViaWebSpeech(this.sentences[this.currentIndex]);
      return;
    }

    // 首次失败，500ms 后重新尝试合成并播放当前句
    this.events.onError?.(error);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (token === this.playToken && (this.state === 'loading' || this.state === 'playing')) {
        void this.playCurrentSentence();
      }
    }, 500);
  }

  /**
   * 通过 WebSpeech 进行兜底朗读
   */
  private playViaWebSpeech(text: string): void {
    this.setState('playing');
    this.isSpeechUnlocked = true;
    void this.requestWakeLock();

    this.webSpeechEngine.speak(
      text,
      { voice: this.voice, rate: this.rate },
      {
        onStart: () => {
          this.setState('playing');
        },
        onEnd: () => {
          this.handleSentenceEnd();
        },
        onError: (err) => {
          this.events.onError?.(err);
          // 若系统 WebSpeech 也报错，尝试下一句
          this.handleSentenceEnd();
        },
      }
    );
  }

  /**
   * 句子播放完毕的回调
   */
  private handleSentenceEnd(): void {
    if (this.state !== 'playing') return;

    // 释放刚播完的音频资源，防止内存泄漏
    this.revokeCacheItem(this.currentIndex);

    this.currentIndex++;
    if (this.currentIndex >= this.sentences.length) {
      this.handleChapterEnd();
    } else {
      void this.playCurrentSentence();
    }
  }

  /**
   * 本章全部播放完成
   */
  private handleChapterEnd(): void {
    this.stop();
    this.events.onChapterEnd?.();
  }

  // ─── 用户控制方法 ─────────────────────────────────────────────────────

  pause(): void {
    if (this.state !== 'playing' && this.state !== 'loading') return;

    this.clearRetryTimer();
    this.playToken++;

    if (this.isUsingFallback) {
      this.webSpeechEngine.pause();
    } else if (this.audio && typeof this.audio.pause === 'function') {
      this.audio.pause();
    }

    this.releaseWakeLock();
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;

    if (this.isUsingFallback) {
      if (typeof window !== 'undefined' && window.speechSynthesis?.paused) {
        this.setState('playing');
        void this.requestWakeLock();
        this.webSpeechEngine.resume();
      } else {
        void this.playCurrentSentence();
      }
      return;
    }

    // 若是在 loading 阶段暂停或音频源仍为静音占位，重新载入当前句
    if (!this.audio.src || this.audio.src === SILENT_AUDIO_WAV) {
      void this.playCurrentSentence();
      return;
    }

    this.setState('playing');
    void this.requestWakeLock();

    if (this.audio && typeof this.audio.play === 'function') {
      this.audio.playbackRate = 1.0;
      const playPromise = this.audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            this.isAudioUnlocked = true;
          })
          .catch((err: any) => {
            if (err?.name === 'NotAllowedError') {
              this.isAudioUnlocked = false;
              this.releaseWakeLock();
              this.setState('paused');
              this.events.onToast?.('请再点一次播放解锁声音');
              return;
            }
            // 若原音频恢复失败，重新载入当前句
            void this.playCurrentSentence();
          });
      }
    }
  }

  stop(): void {
    this.clearRetryTimer();
    this.playToken++;

    if (this.isUsingFallback) {
      this.webSpeechEngine.cancel();
    } else if (this.audio) {
      try {
        if (typeof this.audio.pause === 'function') this.audio.pause();
        this.audio.src = '';
      } catch {
        // 忽略
      }
    }

    this.releaseWakeLock();
    this.clearPrefetchCache();
    this.setState('idle');
  }

  nextSentence(): void {
    if (this.sentences.length === 0) return;
    this.clearRetryTimer();
    this.unlockAllAudio({ audio: !this.isUsingFallback, speech: false });
    if (this.currentIndex < this.sentences.length - 1) {
      this.revokeCacheItem(this.currentIndex);
      this.currentIndex++;
      void this.playCurrentSentence();
    } else {
      this.handleChapterEnd();
    }
  }

  previousSentence(): void {
    if (this.sentences.length === 0) return;
    this.clearRetryTimer();
    this.unlockAllAudio({ audio: !this.isUsingFallback, speech: false });
    if (this.currentIndex > 0) {
      this.revokeCacheItem(this.currentIndex);
      this.currentIndex--;
    }
    void this.playCurrentSentence();
  }

  seek(index: number): void {
    if (this.sentences.length === 0) return;
    this.clearRetryTimer();
    this.unlockAllAudio({ audio: !this.isUsingFallback, speech: false });
    const target = Math.max(0, Math.min(index, this.sentences.length - 1));
    this.clearPrefetchCache();
    this.currentIndex = target;
    void this.playCurrentSentence();
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.state === 'playing') {
      if (this.isUsingFallback) {
        this.clearPrefetchCache();
        void this.playCurrentSentence();
      } else {
        // Edge Worker 已通过 SSML 合成目标语速，严禁叠加修改 audio.playbackRate；
        // 仅清理未来预取缓存，保留当前正在播放的句
        this.clearFuturePrefetchCache();
        this.triggerPrefetch();
      }
    } else if (this.state === 'loading') {
      this.clearPrefetchCache();
      void this.playCurrentSentence();
    } else {
      this.clearPrefetchCache();
    }
  }

  setVoice(voice: string): void {
    this.voice = voice;
    this.clearPrefetchCache();
    if (this.state === 'playing' || this.state === 'loading') {
      void this.playCurrentSentence();
    }
  }
}
