import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigStorage, DEFAULT_CONFIG } from '../src/core/storage';

describe('storage.ts - 跨站配置持久化与降级存储', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (globalThis as any).GM_getValue;
    delete (globalThis as any).GM_setValue;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('无任何历史存储时返回默认配置（默认语速 1.0x，默认 token dev-secret）', () => {
    const config = ConfigStorage.load();
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.rate).toBe(1.0);
    expect(config.token).toBe('dev-secret');
  });

  it('优先使用 GM_getValue 与 GM_setValue', () => {
    const mockStore: Record<string, string> = {};
    (globalThis as any).GM_getValue = vi.fn().mockImplementation((key: string, def: any) => {
      return mockStore[key] || def;
    });
    (globalThis as any).GM_setValue = vi.fn().mockImplementation((key: string, val: string) => {
      mockStore[key] = val;
    });

    ConfigStorage.save({ workerUrl: 'https://tts.example.com', rate: 1.5 });

    expect((globalThis as any).GM_setValue).toHaveBeenCalled();
    const loaded = ConfigStorage.load();
    expect(loaded.workerUrl).toBe('https://tts.example.com');
    expect(loaded.rate).toBe(1.5);
    expect(loaded.token).toBe('dev-secret');
    expect(loaded.voice).toBe(DEFAULT_CONFIG.voice);
  });

  it('当 GM 存储不可用时，平滑降级至 localStorage', () => {
    ConfigStorage.save({ token: 'my-custom-token', voice: 'zh-CN-YunxiNeural' });

    const localData = localStorage.getItem('novel_tts_config');
    expect(localData).not.toBeNull();

    const loaded = ConfigStorage.load();
    expect(loaded.token).toBe('my-custom-token');
    expect(loaded.voice).toBe('zh-CN-YunxiNeural');
    expect(loaded.rate).toBe(1.0);
  });

  it('兼容旧版空 token 配置：自动回填默认 dev-secret', () => {
    localStorage.setItem(
      'novel_tts_config',
      JSON.stringify({
        workerUrl: 'https://novel-tts-worker.foriris.workers.dev',
        token: '',
        voice: 'zh-CN-YunxiNeural',
      })
    );

    const loaded = ConfigStorage.load();
    expect(loaded.token).toBe('dev-secret');
    expect(loaded.rate).toBe(1.0);
    expect(loaded.workerUrl).toBe('https://novel-tts-worker.foriris.workers.dev');
  });

  it('支持持久化悬浮球位置 (ballPosition)', () => {
    ConfigStorage.save({
      ballPosition: { side: 'left', offsetTop: 240 },
    });

    const loaded = ConfigStorage.load();
    expect(loaded.ballPosition).toEqual({ side: 'left', offsetTop: 240 });
  });
});
