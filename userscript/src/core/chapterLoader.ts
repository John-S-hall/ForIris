import { extractChapterContent } from './extractor';
import type { ChapterContent } from './tts/types';

/**
 * 探测 HTML ArrayBuffer 的字符编码（支持 UTF-8 / GBK / GB2312 / GB18030）
 */
export function detectCharset(headers: Record<string, string> | string, buffer: ArrayBuffer): string {
  // 1. 尝试从响应头中解析
  let headerCharset = '';
  if (typeof headers === 'string') {
    const ctMatch = headers.match(/content-type:[^\r\n]*charset=([a-zA-Z0-9_-]+)/i);
    if (ctMatch) {
      headerCharset = ctMatch[1].toLowerCase();
    } else {
      const match = headers.match(/charset=([a-zA-Z0-9_-]+)/i);
      if (match) headerCharset = match[1].toLowerCase();
    }
  } else if (headers && typeof headers === 'object') {
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    const match = contentType.match(/charset=([a-zA-Z0-9_-]+)/i);
    if (match) headerCharset = match[1].toLowerCase();
  }

  if (headerCharset) {
    return normalizeEncoding(headerCharset);
  }

  // 2. 从 buffer 前 2048 字节中探测 <meta charset="...">
  try {
    const peekLen = Math.min(buffer.byteLength, 2048);
    const peekBytes = new Uint8Array(buffer, 0, peekLen);
    // 用 latin1 快速解码前 2KB 探测 ASCII 标签
    let asciiHeader = '';
    for (let i = 0; i < peekLen; i++) {
      asciiHeader += String.fromCharCode(peekBytes[i]);
    }

    const metaMatch =
      asciiHeader.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i) ||
      asciiHeader.match(/<meta[^>]+content=["'][^"']*?charset=([a-zA-Z0-9_-]+)/i);

    if (metaMatch) {
      return normalizeEncoding(metaMatch[1].toLowerCase());
    }
  } catch {
    // 探测失败
  }

  return 'utf-8';
}

function normalizeEncoding(enc: string): string {
  if (['gbk', 'gb2312', 'gb18030'].includes(enc)) {
    return 'gb18030';
  }
  if (['utf-8', 'utf8'].includes(enc)) {
    return 'utf-8';
  }
  return enc;
}

async function normalizeArrayBuffer(rawResponse: unknown): Promise<ArrayBuffer> {
  let buffer: ArrayBuffer | null = null;

  if (rawResponse instanceof ArrayBuffer) {
    buffer = rawResponse;
  } else if (ArrayBuffer.isView(rawResponse)) {
    const copy = new Uint8Array(rawResponse.byteLength);
    copy.set(
      new Uint8Array(
        rawResponse.buffer as ArrayBuffer,
        rawResponse.byteOffset,
        rawResponse.byteLength
      )
    );
    buffer = copy.buffer;
  } else if (typeof Blob !== 'undefined' && rawResponse instanceof Blob) {
    buffer = await rawResponse.arrayBuffer();
  }

  if (!buffer || buffer.byteLength === 0) {
    throw new Error('抓取下一章返回空内容');
  }

  return buffer;
}

export class ChapterLoader {
  private visitedUrls = new Set<string>();

  constructor(initialUrl?: string) {
    if (initialUrl) {
      this.markVisited(initialUrl);
    }
  }

  markVisited(url: string): void {
    const norm = this.normalizeUrl(url);
    if (norm) {
      this.visitedUrls.add(norm);
    }
  }

  hasVisited(url: string): boolean {
    const norm = this.normalizeUrl(url);
    if (!norm) return false;
    return this.visitedUrls.has(norm);
  }

  resetVisited(currentUrl?: string): void {
    this.visitedUrls.clear();
    if (currentUrl) {
      this.markVisited(currentUrl);
    }
  }

  getVisitedUrls(): Set<string> {
    return new Set(this.visitedUrls);
  }

  private normalizeUrl(rawUrl: string): string | null {
    try {
      const u = new URL(rawUrl);
      if (!['http:', 'https:'].includes(u.protocol)) {
        return null;
      }
      return `${u.origin}${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  }

  /**
   * 判断目标章节是否与当前网页同源
   */
  private isSameOrigin(targetUrl: string): boolean {
    try {
      if (typeof window === 'undefined' || !window.location) return false;
      const target = new URL(targetUrl);
      return target.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  /**
   * 同源通道：通过原生 window.fetch 获取 HTML（保留 Cookie 与防爬凭证，含 10000ms 超时）
   */
  private async fetchChapterViaNativeFetch(targetUrl: string): Promise<string> {
    const timeoutController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, 10000);

    try {
      const fetchInit: RequestInit = {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: timeoutController.signal,
      };
      if (typeof window !== 'undefined' && window.location?.href) {
        fetchInit.referrer = window.location.href;
      }

      const res = await window.fetch(targetUrl, fetchInit);

      if (!res.ok) {
        throw new Error(`同源 fetch 失败, HTTP ${res.status}`);
      }

      const buffer = await res.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('同源 fetch 返回空响应');
      }

      const contentType = res.headers?.get('content-type') || '';
      const charset = detectCharset(contentType, buffer);
      try {
        const decoder = new TextDecoder(charset);
        return decoder.decode(buffer);
      } catch {
        const fallbackDecoder = new TextDecoder('utf-8');
        return fallbackDecoder.decode(buffer);
      }
    } catch (err) {
      if (timedOut) {
        throw new Error('同源 fetch 抓取下一章超时 (10000ms)');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 兜底通道：通过 GM_xmlhttpRequest 获取 HTML（带 10000ms JS 超时保险丝）
   */
  private async fetchChapterViaGM(targetUrl: string): Promise<string> {
    const gmRequest = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null;
    if (!gmRequest) {
      throw new Error('GM_xmlhttpRequest 在当前环境中不可用');
    }

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let requestHandle: { abort?: () => void } | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      const finishError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const finishSuccess = (html: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(html);
      };

      // 10000ms JS 硬超时保险丝
      timer = setTimeout(() => {
        try {
          if (requestHandle && typeof requestHandle.abort === 'function') {
            requestHandle.abort();
          }
        } catch {
          // ignore
        }
        finishError(new Error('请求超时 (10000ms JS 保险丝触发)'));
      }, 10000);

      try {
        const headers: Record<string, string> = {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        };
        if (typeof window !== 'undefined' && window.location?.href) {
          headers['Referer'] = window.location.href;
        }

        requestHandle = gmRequest({
          method: 'GET',
          url: targetUrl,
          responseType: 'arraybuffer',
          anonymous: false, // 附带 Cookie
          headers,
          timeout: 10000,
          onload: async (resp) => {
            if (resp.status < 200 || resp.status >= 300) {
              finishError(new Error(`抓取下一章失败, HTTP ${resp.status}`));
              return;
            }

            try {
              const buffer = await normalizeArrayBuffer(resp.response);
              const charset = detectCharset(resp.responseHeaders || '', buffer);
              try {
                const decoder = new TextDecoder(charset);
                finishSuccess(decoder.decode(buffer));
              } catch {
                const fallbackDecoder = new TextDecoder('utf-8');
                finishSuccess(fallbackDecoder.decode(buffer));
              }
            } catch (err: any) {
              finishError(err instanceof Error ? err : new Error(String(err)));
            }
          },
          onerror: (err) => finishError(new Error(`网络错误 (GM_xhr): ${JSON.stringify(err)}`)),
          ontimeout: () => finishError(new Error('抓取下一章网络超时 (10000ms)')),
        });
      } catch (invokeErr: any) {
        finishError(new Error(`GM_xmlhttpRequest 触发失败: ${invokeErr?.message || invokeErr}`));
      }
    });
  }

  /**
   * 静默拉取指定章节的 HTML 并解析正文
   * @param targetUrl 下一章完整 URL
   * @param options 加载选项（allowVisited 为 true 时允许重读已访问章节，如手动上一章）
   */
  async loadChapter(
    targetUrl: string,
    options?: { allowVisited?: boolean }
  ): Promise<ChapterContent | null> {
    const normalized = this.normalizeUrl(targetUrl);
    if (!normalized) {
      console.warn('[NovelTTS] Invalid chapter URL:', targetUrl);
      return null;
    }

    // 防死循环判断（自动连播始终拦截，手动翻页可传 allowVisited 放行）
    if (!options?.allowVisited && this.visitedUrls.has(normalized)) {
      console.warn('[NovelTTS] Prevented loop: already visited URL:', normalized);
      return null;
    }

    let html: string | null = null;
    let nativeFetchError: Error | null = null;

    // 1. 若同源，优先使用原生 fetch（保留完整 Cookie 和防爬验证）
    if (this.isSameOrigin(targetUrl) && typeof window.fetch === 'function') {
      try {
        html = await this.fetchChapterViaNativeFetch(targetUrl);
      } catch (fetchErr: any) {
        nativeFetchError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
        console.warn('[NovelTTS] 同源 fetch 失败，回退至 GM_xmlhttpRequest:', fetchErr);
      }
    }

    // 2. 跨域或同源 fetch 失败后，使用 GM_xmlhttpRequest
    if (!html) {
      if (nativeFetchError && typeof GM_xmlhttpRequest !== 'function') {
        throw nativeFetchError;
      }
      html = await this.fetchChapterViaGM(targetUrl);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 提取正文与新的下一章链接
    const content = extractChapterContent(doc, targetUrl);

    // 仅在提取到有效正文时才记录已访问，避免防爬挑战空页污染 visitedUrls
    if (content.paragraphs.length > 0) {
      this.visitedUrls.add(normalized);
    }

    return content;
  }
}
