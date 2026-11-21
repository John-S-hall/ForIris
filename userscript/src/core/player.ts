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

  // 单例音频实例
  private audio: HTMLAudioElement;
  private isAudioUnlocked = false;

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
    this.rate = config.rate || 1.2;
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
    this.provider = provider;
    this.isUsingFallback = false;
    this.consecutiveFailures = 0;
    this.clearPrefetchCache();
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

  // ─── 音频事件与同步解锁 ──────────────────────────────────────────────────

  private setupAudioListeners(): void {
    if (!this.audio || typeof this.audio.addEventListener !== 'function') return;

    this.audio.addEventListener('ended', () => {
      this.handleSentenceEnd();
    });

    this.audio.addEventListener('error', () => {
      if (this.state === 'playing') {
        this.handlePlaybackFailure(new Error('Audio playback error'));
      }
    });
  }

  /**
   * 同步解锁函数：必须在播放手势的第一行同步调用
   * 一次性同步解锁：1) <audio> 实例；2) window.speechSynthesis
   */
  unlockAllAudio(): void {
    // 1. 同步解锁单例 HTMLAudioElement
    if (this.audio && typeof this.audio.play === 'function') {
      try {
        if (!this.audio.src || this.audio.src === '' || this.audio.src === SILENT_AUDIO_WAV) {
          this.audio.src = SILENT_AUDIO_WAV;
        }
        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              this.isAudioUnlocked = true;
            })
            .catch(() => {
              // 忽略静音测试播放错误
            });
        } else {
          this.isAudioUnlocked = true;
        }
      } catch {
        // 忽略
      }
    }

    // 2. 同步解锁 window.speechSynthesis
    if (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    ) {
      try {
        const dummyUtterance = new SpeechSynthesisUtterance('');
        dummyUtterance.volume = 0;
        window.speechSynthesis.speak(dummyUtterance);
      } catch {
        // 忽略
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
      this.fetchSentenceBlob(next1);
    }
    if (next2 < this.sentences.length) {
      this.fetchSentenceBlob(next2);
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
    if (index >= this.sentences.length) {
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

    const promise = (async () => {
      let lastError: Error | null = null;
      // 失败重试 1 次规则
      for (let attempt = 0; attempt < 2; attempt++) {
        if (abortController.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        try {
          const blobUrl = await this.provider.synthesize(text, options);
          const item = this.prefetchCache.get(index);
          if (item) {
            item.blobUrl = blobUrl;
          }
          return blobUrl;
        } catch (err: any) {
          if (err.name === 'AbortError') throw err;
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
      throw lastError || new Error(`Failed to synthesize sentence ${index}`);
    })();

    this.prefetchCache.set(index, {
      abortController,
      promise,
    });

    return promise;
  }

  // ─── 核心播放逻辑 ─────────────────────────────────────────────────────

  /**
   * 载入章节并开始播放
   */
  async playChapter(chapter: ChapterContent, startIndex = 0): Promise<void> {
    this.unlockAllAudio();
    this.stop();

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
      if (this.state !== 'loading') {
        // 如果在获取音频期间用户已暂停或停止
        return;
      }

      this.audio.src = blobUrl;
      const playPromise = this.audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        try {
          await playPromise;
        } catch (playErr: any) {
          // iOS Safari 自动播放拦截处理 (NotAllowedError)
          if (playErr.name === 'NotAllowedError') {
            this.setState('paused');
            this.events.onToast?.('请再点一次播放解锁声音');
            return;
          }
          throw playErr;
        }
      }

      this.setState('playing');
      this.consecutiveFailures = 0; // 成功播放重置连续错误计数
      await this.requestWakeLock();

      // 播放成功后并发预取 N+1, N+2
      this.triggerPrefetch();
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      await this.handlePlaybackFailure(err);
    }
  }

  /**
   * 单句播放失败与自动降级处理
   */
  private async handlePlaybackFailure(error: Error): Promise<void> {
    this.consecutiveFailures++;

    // 若连续 2 句失败，自动无缝降级到 WebSpeech
    if (this.consecutiveFailures >= 2) {
      this.isUsingFallback = true;
      this.clearPrefetchCache();
      this.events.onToast?.('Edge TTS 连接异常，已自动切换为系统语音朗读');
      this.playViaWebSpeech(this.sentences[this.currentIndex]);
      return;
    }

    // 首次失败，尝试跳到当前句重新朗读
    this.events.onError?.(error);
    setTimeout(() => {
      if (this.state === 'loading' || this.state === 'playing') {
        this.playCurrentSentence();
      }
    }, 500);
  }

  /**
   * 通过 WebSpeech 进行兜底朗读
   */
  private playViaWebSpeech(text: string): void {
    this.setState('playing');
    this.requestWakeLock();

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
      this.playCurrentSentence();
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

    this.setState('playing');
    this.requestWakeLock();

    if (this.isUsingFallback) {
      this.webSpeechEngine.resume();
    } else if (this.audio && typeof this.audio.play === 'function') {
      const playPromise = this.audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch((err: any) => {
          if (err.name === 'NotAllowedError') {
            this.setState('paused');
            this.events.onToast?.('请再点一次播放解锁声音');
            return;
          }
          // 若原音频恢复失败，重新载入当前句
          this.playCurrentSentence();
        });
      }
    }
  }

  stop(): void {
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
    this.unlockAllAudio();
    if (this.currentIndex < this.sentences.length - 1) {
      this.revokeCacheItem(this.currentIndex);
      this.currentIndex++;
      this.playCurrentSentence();
    } else {
      this.handleChapterEnd();
    }
  }

  previousSentence(): void {
    if (this.sentences.length === 0) return;
    this.unlockAllAudio();
    if (this.currentIndex > 0) {
      this.revokeCacheItem(this.currentIndex);
      this.currentIndex--;
      this.playCurrentSentence();
    } else {
      this.playCurrentSentence();
    }
  }

  seek(index: number): void {
    if (this.sentences.length === 0) return;
    this.unlockAllAudio();
    const target = Math.max(0, Math.min(index, this.sentences.length - 1));
    this.clearPrefetchCache();
    this.currentIndex = target;
    this.playCurrentSentence();
  }

  setRate(rate: number): void {
    this.rate = rate;
    // 语速变更后清空未来句的预取缓存，以新语速预取
    this.clearPrefetchCache();
    if (this.state === 'playing') {
      if (this.isUsingFallback) {
        this.playCurrentSentence();
      } else {
        this.audio.playbackRate = rate;
        this.triggerPrefetch();
      }
    }
  }

  setVoice(voice: string): void {
    this.voice = voice;
    this.clearPrefetchCache();
    if (this.state === 'playing') {
      this.playCurrentSentence();
    }
  }
}
