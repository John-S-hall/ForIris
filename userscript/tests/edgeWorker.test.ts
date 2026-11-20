import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EdgeWorkerTTSProvider } from '../src/core/tts/edgeWorker';

describe('edgeWorker.ts - Edge TTS Provider', () => {
  const originalGM = (globalThis as any).GM_xmlhttpRequest;
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-123');
  });

  afterEach(() => {
    (globalThis as any).GM_xmlhttpRequest = originalGM;
    URL.createObjectURL = originalCreateObjectURL;
    vi.restoreAllMocks();
  });

  it('成功请求并生成 Blob URL', async () => {
    const mockBlob = new Blob(['mock audio data'], { type: 'audio/mpeg' });
    const mockGM = vi.fn().mockImplementation((config) => {
      expect(config.method).toBe('GET');
      expect(config.responseType).toBe('blob');
      expect(config.url).toContain('http://localhost:8787/tts');
      expect(config.url).toContain('text=%E6%B5%8B%E8%AF%95%E6%9C%97%E8%AF%BB');
      expect(config.url).toContain('token=dev-secret');

      // 模拟成功响应
      setTimeout(() => {
        config.onload({
          status: 200,
          statusText: 'OK',
          response: mockBlob,
        });
      }, 10);
      return { abort: vi.fn() };
    });

    (globalThis as any).GM_xmlhttpRequest = mockGM;

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'dev-secret',
    });

    const url = await provider.synthesize('测试朗读', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.2,
    });

    expect(url).toBe('blob:http://localhost/mock-blob-123');
    expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
  });

  it('智能容错：即使传入带 /tts 结尾的 workerUrl 也能正确归一化', async () => {
    const mockBlob = new Blob(['mock audio data'], { type: 'audio/mpeg' });
    const mockGM = vi.fn().mockImplementation((config) => {
      // 验证拼接出来的 URL 不会包含 /tts/tts
      expect(config.url).toContain('http://localhost:8787/tts?');
      expect(config.url).not.toContain('/tts/tts');
      setTimeout(() => {
        config.onload({
          status: 200,
          statusText: 'OK',
          response: mockBlob,
        });
      }, 5);
      return { abort: vi.fn() };
    });

    (globalThis as any).GM_xmlhttpRequest = mockGM;

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787/tts/',
      token: 'dev-secret',
    });

    await provider.synthesize('测试容错', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.2,
    });
  });

  it('非 200 状态码时快速失败', async () => {
    const mockGM = vi.fn().mockImplementation((config) => {
      setTimeout(() => {
        config.onload({
          status: 401,
          statusText: 'Unauthorized',
          response: null,
        });
      }, 5);
      return { abort: vi.fn() };
    });

    (globalThis as any).GM_xmlhttpRequest = mockGM;

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'bad-token',
    });

    await expect(
      provider.synthesize('测试文本', { voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0 })
    ).rejects.toThrow('Edge Worker HTTP 401');
  });

  it('返回空 Blob 时快速失败', async () => {
    const mockGM = vi.fn().mockImplementation((config) => {
      setTimeout(() => {
        config.onload({
          status: 200,
          statusText: 'OK',
          response: new Blob([]), // 空 blob
        });
      }, 5);
      return { abort: vi.fn() };
    });

    (globalThis as any).GM_xmlhttpRequest = mockGM;

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'dev-secret',
    });

    await expect(
      provider.synthesize('测试文本', { voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0 })
    ).rejects.toThrow('Edge Worker returned an empty audio response');
  });

  it('支持 AbortSignal 取消在途请求', async () => {
    const abortMock = vi.fn();
    const mockGM = vi.fn().mockImplementation(() => {
      return { abort: abortMock };
    });

    (globalThis as any).GM_xmlhttpRequest = mockGM;

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'dev-secret',
    });

    const controller = new AbortController();

    const promise = provider.synthesize('测试取消', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
      signal: controller.signal,
    });

    // 立即中断
    controller.abort();

    await expect(promise).rejects.toThrow('The synthesis request was aborted');
    expect(abortMock).toHaveBeenCalled();
  });
});
