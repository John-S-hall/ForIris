import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSpeechEngine } from '../src/core/tts/webSpeech';

describe('webSpeech.ts - iOS WebKit 吞音修复验证', () => {
  const originalSpeech = (window as any).speechSynthesis;
  const originalUtterance = (globalThis as any).SpeechSynthesisUtterance;

  beforeEach(() => {
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      rate = 1;
      lang = 'zh-CN';
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };
  });

  afterEach(() => {
    (window as any).speechSynthesis = originalSpeech;
    (globalThis as any).SpeechSynthesisUtterance = originalUtterance;
    vi.restoreAllMocks();
  });

  it('空闲状态下调用 speak/cancel 不应触发 speechSynthesis.cancel()（避免 iOS 吞掉首句）', () => {
    const cancelMock = vi.fn();
    const speakMock = vi.fn();
    (window as any).speechSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      cancel: cancelMock,
      speak: speakMock,
      pause: vi.fn(),
      resume: vi.fn(),
    };

    const engine = new WebSpeechEngine();
    engine.speak('测试首句朗读', { voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0 });

    expect(cancelMock).not.toHaveBeenCalled();
    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it('仅在 speaking 或 pending 为 true 时才调用 speechSynthesis.cancel()', () => {
    const cancelMock = vi.fn();
    const speakMock = vi.fn();
    (window as any).speechSynthesis = {
      speaking: true,
      pending: false,
      paused: false,
      cancel: cancelMock,
      speak: speakMock,
      pause: vi.fn(),
      resume: vi.fn(),
    };

    const engine = new WebSpeechEngine();
    engine.speak('测试打断重播', { voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0 });
    expect(cancelMock).toHaveBeenCalledTimes(1);

    cancelMock.mockClear();
    (window as any).speechSynthesis.speaking = false;
    (window as any).speechSynthesis.pending = true;
    engine.cancel();
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });
});
