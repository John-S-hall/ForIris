import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EdgeWorkerTTSProvider } from '../src/core/tts/edgeWorker';

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
    vi.restoreAllMocks();
  });

  it('主通道：优先走 window.fetch (arrayBuffer -> Blob)', async () => {
    // 构造大于 256 字节的有效 mock 音频
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
      rate: 1.2,
    });

    expect(url).toBe('blob:http://localhost/mock-blob-123');
    expect(window.fetch).toHaveBeenCalled();
    expect(provider.getLastUsedSource()).toBe('fetch');
  });

  it('业务错误：fetch 遇到 401 密钥错误快速失败，不回退 GM_xhr', async () => {
    window.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as any);

    const mockGM = vi.fn();
    (globalThis as any).GM_xmlhttpRequest = mockGM;

    const provider = new EdgeWorkerTTSProvider({
      workerUrl: 'http://localhost:8787',
      token: 'wrong-token',
    });

    await expect(
      provider.synthesize('测试', { voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0 })
    ).rejects.toThrow('HTTP 401 密钥错误');

    expect(mockGM).not.toHaveBeenCalled();
  });

  it('兜底通道：fetch 遭遇网络/CSP/CORS 阻断时，自动回退到 GM_xmlhttpRequest', async () => {
    // 模拟 fetch 被 CSP 或 CORS 阻断
    window.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (CSP blocked)'));

    const dummyBytes = new Uint8Array(400);
    const mockGM = vi.fn().mockImplementation((config) => {
      expect(config.responseType).toBe('arraybuffer'); // 必须是 arraybuffer
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

  it('GM 兜底通道：8500ms JS 超时保险丝触发', async () => {
    vi.useFakeTimers();
    window.fetch = vi.fn().mockRejectedValue(new TypeError('Network Error'));

    const abortMock = vi.fn();
    (globalThis as any).GM_xmlhttpRequest = vi.fn().mockImplementation(() => {
      // 模拟 Stay 等扩展挂起、不响应 ontimeout
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
    vi.useRealTimers();
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
      rate: 1.2,
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
