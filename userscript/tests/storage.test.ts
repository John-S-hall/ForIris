import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConfigStorage,
  DEFAULT_CONFIG,
  DEFAULT_READER_SETTINGS,
} from '../src/core/storage';

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

  it('支持阅读模式配置 (reader)：saveReaderSettings 部分合并、边界钳制及旧版无 reader 兼容', () => {
    // 旧版无 reader 字段自动补全默认值
    localStorage.setItem(
      'novel_tts_config',
      JSON.stringify({
        workerUrl: 'https://worker.example.com',
        token: 'secret',
      })
    );
    const compat = ConfigStorage.load();
    expect(compat.reader).toEqual(DEFAULT_READER_SETTINGS);

    // 部分更新阅读模式偏好不影响其他字段
    ConfigStorage.saveReaderSettings({ theme: 'dark', fontSize: 22 });
    const updated = ConfigStorage.load();
    expect(updated.reader).toEqual({
      theme: 'dark',
      fontSize: 22,
      lineHeight: DEFAULT_READER_SETTINGS.lineHeight,
      autoEnter: false,
    });
    expect(updated.workerUrl).toBe('https://worker.example.com');

    // 越界数值与非法主题安全钳制
    ConfigStorage.saveReaderSettings({
      theme: 'invalid-theme' as any,
      fontSize: 99,
      lineHeight: 0.5,
      autoEnter: true,
    });
    const clamped = ConfigStorage.load();
    expect(clamped.reader).toEqual({
      theme: DEFAULT_READER_SETTINGS.theme,
      fontSize: 28,
      lineHeight: 1.4,
      autoEnter: true,
    });
  });
});
