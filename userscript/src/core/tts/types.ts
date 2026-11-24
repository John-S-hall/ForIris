export interface ChapterContent {
  title: string;
  paragraphs: string[];
  nextChapterUrl: string | null;
  prevChapterUrl?: string | null;
}

export interface TTSOptions {
  voice: string;      // 默认 "zh-CN-XiaoxiaoNeural"
  rate: number;       // 语速倍率 0.5 ~ 2.5，默认 1.2
  signal?: AbortSignal;
}

export interface TTSProvider {
  readonly name: string;
  /** 返回可直接赋给 audio.src 的 Blob URL */
  synthesize(text: string, options: TTSOptions): Promise<string>;
}

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
