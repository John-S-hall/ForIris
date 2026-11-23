import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChapterLoader, detectCharset } from '../src/core/chapterLoader';

describe('chapterLoader.ts - 静默下一章加载与编码探测', () => {
  const originalFetch = window.fetch;
  const originalGM = (globalThis as any).GM_xmlhttpRequest;

  beforeEach(() => {
    delete (globalThis as any).GM_xmlhttpRequest;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    (globalThis as any).GM_xmlhttpRequest = originalGM;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('编码探测 (detectCharset)', () => {
    it('从 Content-Type 响应头识别 UTF-8 与 GBK', () => {
      expect(detectCharset('text/html; charset=gbk', new ArrayBuffer(0))).toBe('gb18030');
      expect(detectCharset({ 'content-type': 'text/html; charset=GB2312' }, new ArrayBuffer(0))).toBe(
        'gb18030'
      );
      expect(detectCharset('Content-Type: text/html; charset=gbk\r\nServer: nginx', new ArrayBuffer(0))).toBe(
        'gb18030'
      );
      expect(detectCharset('text/html; charset=utf-8', new ArrayBuffer(0))).toBe('utf-8');
    });

    it('响应头缺失时从 HTML 内容前段探测 <meta charset>', () => {
      const gbkHtml = '<html><head><meta charset="gb2312"></head><body>测试</body></html>';
      const buf = new Uint8Array(gbkHtml.split('').map((c) => c.charCodeAt(0))).buffer;
      expect(detectCharset('', buf)).toBe('gb18030');
    });

    it('均无声明时默认采用 utf-8', () => {
      const plainHtml = '<html><body>无编码声明</body></html>';
      const buf = new Uint8Array(plainHtml.split('').map((c) => c.charCodeAt(0))).buffer;
      expect(detectCharset('', buf)).toBe('utf-8');
    });
  });

  describe('章节加载与防死循环 (ChapterLoader)', () => {
    const chapterHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>第二章 突飞猛进 - 极道天魔</title></head>
        <body>
          <h1>第二章 突飞猛进</h1>
          <div id="content">
            晨曦初露，林间鸟鸣阵阵，空气中带着泥土独特的清新芳香。<br/>
            少年的剑法在日复一日的苦练中愈发凌厉，每一剑挥出都带着沉闷的风雷之声。<br/>
            “终于突破第三层了。”他收剑而立，眼中难掩欣喜之色。<br/>
            远处的树冠上，一只通体漆黑的灵隼正默默地注视着这一切。
          </div>
          <a href="/book/101/chapter_3.html">下一章</a>
        </body>
      </html>
    `;

    it('同源 URL：优先走原生 window.fetch (携带凭证)', async () => {
      const encoder = new TextEncoder();
      const buffer = encoder.encode(chapterHtml).buffer;

      const currentOrigin = window.location.origin;
      const targetUrl = `${currentOrigin}/book/101/chapter_2.html`;

      window.fetch = vi.fn().mockImplementation((_url, init) => {
        expect(init.credentials).toBe('include');
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
          arrayBuffer: async () => buffer,
        });
      });

      const loader = new ChapterLoader(`${currentOrigin}/book/101/chapter_1.html`);
      const result = await loader.loadChapter(targetUrl);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('第二章 突飞猛进');
      expect(result?.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(window.fetch).toHaveBeenCalled();
    });

    it('同源 fetch 超时 10000ms 时回退/抛出明确错误', async () => {
      vi.useFakeTimers();
      const currentOrigin = window.location.origin;
      const targetUrl = `${currentOrigin}/book/101/chapter_timeout.html`;

      window.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const loader = new ChapterLoader(`${currentOrigin}/book/101/chapter_1.html`);
      const promise = loader.loadChapter(targetUrl);

      const assertion = expect(promise).rejects.toThrow('同源 fetch 抓取下一章超时 (10000ms)');
      await vi.advanceTimersByTimeAsync(10100);
      await assertion;
    });

    it('无 GM_xhr 且同源 fetch 返回 HTTP 403 时保留原始 HTTP 403 错误', async () => {
      const currentOrigin = window.location.origin;
      const targetUrl = `${currentOrigin}/book/101/chapter_403.html`;

      window.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      } as any);

      const loader = new ChapterLoader(`${currentOrigin}/book/101/chapter_1.html`);
      await expect(loader.loadChapter(targetUrl)).rejects.toThrow('同源 fetch 失败, HTTP 403');
    });

    it('真实 GBK 字节流解码：正确解析 GBK 编码中文网页', async () => {
      // 构造含 GBK 字节的 HTML："你好世界" 在 GBK 中为 C4 E3 BA C3 CA C0 BD E7，重复多次以满足正文提取最小长度
      const prefix = new TextEncoder().encode(
        '<html><head><meta charset="gbk"><title>GBK</title></head><body><div id="content">'
      );
      const gbkUnit = [0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7]; // "你好世界"
      const bodyBytes: number[] = [];
      for (let i = 0; i < 10; i++) {
        bodyBytes.push(...gbkUnit);
      }
      const suffix = new TextEncoder().encode('</div></body></html>');

      const combined = new Uint8Array(prefix.length + bodyBytes.length + suffix.length);
      combined.set(prefix, 0);
      combined.set(bodyBytes, prefix.length);
      combined.set(suffix, prefix.length + bodyBytes.length);

      const currentOrigin = window.location.origin;
      window.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () => combined.buffer,
      } as any);

      const loader = new ChapterLoader(`${currentOrigin}/gbk_1.html`);
      const result = await loader.loadChapter(`${currentOrigin}/gbk_2.html`);

      expect(result).not.toBeNull();
      expect(result?.paragraphs[0]).toContain('你好世界');
    });

    it('同源 fetch 失败或跨域时：自动回退至 GM_xmlhttpRequest（兼容 Uint8Array 与 Blob）', async () => {
      const encoder = new TextEncoder();
      const uint8 = encoder.encode(chapterHtml);

      window.fetch = vi.fn().mockRejectedValue(new TypeError('Fetch failed'));

      const mockGM = vi.fn().mockImplementation((config) => {
        expect(config.responseType).toBe('arraybuffer');
        setTimeout(() => {
          config.onload({
            status: 200,
            response: uint8, // 返回 TypedArray 视图测试兼容性
            responseHeaders: 'Content-Type: text/html; charset=utf-8',
          });
        }, 5);
        return { abort: vi.fn() };
      });
      (globalThis as any).GM_xmlhttpRequest = mockGM;

      const loader = new ChapterLoader('https://novel.example.com/book/101/chapter_1.html');
      const result = await loader.loadChapter('https://novel.example.com/book/101/chapter_2.html');

      expect(result).not.toBeNull();
      expect(mockGM).toHaveBeenCalled();
      expect(result?.paragraphs.length).toBeGreaterThanOrEqual(3);
    });

    it('提取正文为空时不污染 visitedUrls，允许后续重试', async () => {
      const emptyHtml = '<html><body><div>请完成人机验证</div></body></html>';
      const buffer = new TextEncoder().encode(emptyHtml).buffer;
      const currentOrigin = window.location.origin;
      const targetUrl = `${currentOrigin}/book/101/challenge.html`;

      window.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        arrayBuffer: async () => buffer,
      } as any);

      const loader = new ChapterLoader(`${currentOrigin}/book/101/chapter_1.html`);
      const result = await loader.loadChapter(targetUrl);

      expect(result?.paragraphs.length).toBe(0);
      expect(loader.hasVisited(targetUrl)).toBe(false);
    });

    it('死循环防御：已访问过的章节链接再次请求直接返回 null', async () => {
      const loader = new ChapterLoader('https://novel.example.com/book/101/chapter_1.html');
      const result = await loader.loadChapter('https://novel.example.com/book/101/chapter_1.html');
      expect(result).toBeNull();
    });

    it('非法 URL 请求直接返回 null', async () => {
      const loader = new ChapterLoader();
      const result = await loader.loadChapter('javascript:void(0)');
      expect(result).toBeNull();
    });
  });
});
