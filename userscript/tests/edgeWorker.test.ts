import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EdgeWorkerTTSProvider, WorkerHttpError } from '../src/core/tts/edgeWorker';

describe('edgeWorker.ts - 双通道 Edge TTS Provider', () => {
  const originalFetch = window.fetch;
  const originalGM = (globalThis as any).GM_xmlhttpRequest;
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-123');
    delete (globalThis as any).GM_xmlhttpRequest;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    (globalThis as any).GM_xmlhttpRequest = originalGM;
    URL.createObjectURL = originalCreateObjectURL;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('主通道：优先走 window.fetch (arrayBuffer -> Blob)', async () => {
    const dummyBytes = new Uint8Array(300);
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => dummyBytes.buffer,
    } as any);

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'dev-secret',
    });

    const url = await provider.synthesize('测试朗读', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
    });

    expect(url).toBe('blob:http://localhost/mock-blob-123');
    expect(window.fetch).toHaveBeenCalled();
    expect(provider.getLastUsedSource()).toBe('fetch');
  });

  it('空 token 自动兜底为 dev-secret，防止发出空 token 触发 401', async () => {
    const dummyBytes = new Uint8Array(300);
    window.fetch = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain('token=dev-secret');
      return Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: async () => dummyBytes.buffer,
      });
    });

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'https://novel-tts-worker.foriris.workers.dev/',
      token: '   ',
    });

    await provider.synthesize('测试', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
    });
  });

  it('业务错误：fetch 遇到 401/403/500 均抛出 WorkerHttpError，不回退 GM_xhr', async () => {
    const mockGM = vi.fn();
    (globalThis as any).GM_xmlhttpRequest = mockGM;

    for (const status of [401, 403, 500, 502]) {
      window.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        statusText: 'Error',
      } as any);

      const provider = new EdgeWorkerTTSProvider({
        workerUrl: 'http://localhost:8787',
        token: 'wrong-token',
      });

      await expect(
        provider.synthesize('测试', { voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0 })
      ).rejects.toBeInstanceOf(WorkerHttpError);
    }

    expect(mockGM).not.toHaveBeenCalled();
  });

  it('主通道 fetch 8000ms 超时控制生效', async () => {
    vi.useFakeTimers();
    window.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'dev-secret',
    });

    const synthPromise = provider.synthesize('测试超时', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
    });

    const assertion = expect(synthPromise).rejects.toThrow('Edge Worker 请求超时 (8000ms)');
    await vi.advanceTimersByTimeAsync(8100);
    await assertion;
  });

  it('兜底通道：fetch 遭遇网络/CSP/CORS 阻断时，自动回退到 GM_xmlhttpRequest', async () => {
    window.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (CSP blocked)'));

    const dummyBytes = new Uint8Array(400);
    const mockGM = vi.fn().mockImplementation((config) => {
      expect(config.responseType).toBe('arraybuffer');
      setTimeout(() => {
        config.onload({
          status: 200,
          response: dummyBytes.buffer,
        });
      }, 5);
      return { abort: vi.fn() };
    });

    (globalThis as any).GM_xmlhttpRequest = mockGM;

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'dev-secret',
    });

    const url = await provider.synthesize('测试回退', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
    });

    expect(url).toBe('blob:http://localhost/mock-blob-123');
    expect(mockGM).toHaveBeenCalled();
    expect(provider.getLastUsedSource()).toBe('GM_xhr');
  });

  it('兜底通道 GM_xhr 被外部 AbortSignal 取消时保留 AbortError 类型', async () => {
    window.fetch = vi.fn().mockRejectedValue(new TypeError('CSP blocked'));

    const abortMock = vi.fn();
    const gmSpy = vi.fn().mockImplementation(() => {
      return { abort: abortMock };
    });
    (globalThis as any).GM_xmlhttpRequest = gmSpy;

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'dev-secret',
    });

    const controller = new AbortController();
    const synthPromise = provider.synthesize('测试取消', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(gmSpy).toHaveBeenCalled());
    controller.abort();

    try {
      await synthPromise;
      expect.fail('Expected AbortError');
    } catch (err: any) {
      expect(err.name).toBe('AbortError');
    }
    expect(abortMock).toHaveBeenCalled();
  });

  it('GM 兜底通道：8500ms JS 超时保险丝触发', async () => {
    vi.useFakeTimers();
    window.fetch = vi.fn().mockRejectedValue(new TypeError('Network Error'));

    const abortMock = vi.fn();
    (globalThis as any).GM_xmlhttpRequest = vi.fn().mockImplementation(() => {
      return { abort: abortMock };
    });

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'dev-secret',
    });

    const synthPromise = provider.synthesize('测试超时', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
    });

    const errPromise = expect(synthPromise).rejects.toThrow('8500ms JS 保险丝触发');
    await vi.advanceTimersByTimeAsync(8600);
    await errPromise;
    expect(abortMock).toHaveBeenCalled();
  });

  it('智能容错：即使传入带 /tts 结尾的 workerUrl 也能正确归一化', async () => {
    const dummyBytes = new Uint8Array(300);
    window.fetch = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain('http://localhost:8787/tts?');
      expect(url).not.toContain('/tts/tts');
      return Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: async () => dummyBytes.buffer,
      });
    });

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787/tts/',
      token: 'dev-secret',
    });

    await provider.synthesize('测试容错', {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
    });
  });

  it('诊断接口：testConnection 实时返回诊断信息', async () => {
    const dummyBytes = new Uint8Array(300);
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => dummyBytes.buffer,
    } as any);

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'dev-secret',
    });

    const res = await provider.testConnection();
    expect(res.success).toBe(true);
    expect(res.source).toBe('fetch');
    expect(res.bytes).toBe(300);
  });
});
