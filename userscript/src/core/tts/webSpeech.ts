import type { TTSOptions, TTSProvider } from './types';

export interface WebSpeechCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

/**
 * 封装浏览器原生 window.speechSynthesis 引擎
 */
export class WebSpeechEngine {
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }

  speak(text: string, options: TTSOptions, callbacks?: WebSpeechCallbacks): void {
    if (!this.isSupported()) {
      callbacks?.onError?.(new Error('Web Speech Synthesis 在当前浏览器中不受支持'));
      return;
    }

    try {
      // iOS WebKit 修复：仅在确实有待播或正在朗读的任务时才调用 cancel()，避免吞掉当前首句
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        this.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      // 语速倍率：SpeechSynthesis 的 rate 范围一般是 0.1 ~ 10，默认 1.0
      utterance.rate = Math.max(0.5, Math.min(2.5, options.rate || 1.0));
      utterance.lang = 'zh-CN';

      utterance.onstart = () => {
        callbacks?.onStart?.();
      };

      utterance.onend = () => {
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        callbacks?.onEnd?.();
      };

      utterance.onerror = (event) => {
        // 'canceled' or 'interrupted' 不视为主流程异常
        if (event.error === 'canceled' || event.error === 'interrupted') {
          return;
        }
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        callbacks?.onError?.(new Error(`SpeechSynthesis 朗读错误: ${event.error}`));
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  pause(): void {
    if (this.isSupported() && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
  }

  resume(): void {
    if (this.isSupported() && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }

  cancel(): void {
    if (this.isSupported()) {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      this.currentUtterance = null;
    }
  }
}

/**
 * 实现统一 TTSProvider 接口的 WebSpeech 兜底适配器
 */
export class WebSpeechTTSProvider implements TTSProvider {
  readonly name = 'web-speech';
  private engine: WebSpeechEngine;

  constructor(engine?: WebSpeechEngine) {
    this.engine = engine || new WebSpeechEngine();
  }

  getEngine(): WebSpeechEngine {
    return this.engine;
  }

  async synthesize(_text: string, _options: TTSOptions): Promise<string> {
    throw new Error('WebSpeechTTSProvider does not generate audio blob URLs; use direct speech mode');
  }
}
