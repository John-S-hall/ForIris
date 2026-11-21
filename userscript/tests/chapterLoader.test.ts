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
    vi.restoreAllMocks();
  });

  describe('编码探测 (detectCharset)', () => {
    it('从 Content-Type 响应头识别 UTF-8 与 GBK', () => {
      expect(detectCharset('text/html; charset=gbk', new ArrayBuffer(0))).toBe('gb18030');
      expect(detectCharset({ 'content-type': 'text/html; charset=GB2312' }, new ArrayBuffer(0))).toBe(
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

      // 模拟同源请求
      const currentOrigin = window.location.origin;
      const targetUrl = `${currentOrigin}/book/101/chapter_2.html`;

      window.fetch = vi.fn().mockImplementation((url, init) => {
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

    it('同源 fetch 失败或跨域时：自动回退至 GM_xmlhttpRequest', async () => {
      const encoder = new TextEncoder();
      const buffer = encoder.encode(chapterHtml).buffer;

      // 模拟 fetch 抛错
      window.fetch = vi.fn().mockRejectedValue(new TypeError('Fetch failed'));

      const mockGM = vi.fn().mockImplementation((config) => {
        expect(config.responseType).toBe('arraybuffer');
        setTimeout(() => {
          config.onload({
            status: 200,
            response: buffer,
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
