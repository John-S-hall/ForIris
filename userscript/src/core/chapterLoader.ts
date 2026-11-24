import { extractChapterContent } from './extractor';
import { extractTocFromDocument } from './tocExtractor';
import type { ChapterContent, TocData } from './tts/types';

export interface ChapterFetchOptions {
  allowVisited?: boolean;
  retries?: number;
  retryDelayMs?: number;
  onRetry?: (attempt: number, maxRetries: number, reason: string) => void;
}

export function describeHttpStatus(status: number): string {
  if (status === 403) return 'HTTP 403（站点反爬拦截）';
  if (status === 404) return 'HTTP 404（章节不存在）';
  if (status === 429) return 'HTTP 429（请求过快限流）';
  if (status >= 500) return `HTTP ${status}（源站服务异常）`;
  return `HTTP ${status}`;
}

/**
 * 判断抓取异常是否属于瞬态错误（仅对超时/网络异常/429/5xx 自动重试，绝不重复刷 403/404）
 */
export function isRetryableChapterError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  if (
    /HTTP\s*(?:401|403|404|410)\b/i.test(msg) ||
    msg.includes('非法的目录地址') ||
    msg.includes('GM_xmlhttpRequest 在当前环境中不可用')
  ) {
    return false;
  }
  return /超时|网络错误|Failed to fetch|NetworkError|HTTP\s*429\b|HTTP\s*5\d\d\b|空响应|空内容/i.test(
    msg
  );
}

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
        throw new Error(`同源 fetch 失败, ${describeHttpStatus(res.status)}`);
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
              finishError(new Error(`GM 通道抓取失败, ${describeHttpStatus(resp.status)}`));
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
   * 当当前页为 https 且目标链接与当前页同域名但写成了 http 时，自动升级协议以保留同源 fetch 与 Cookie
   */
  private upgradeSameHostProtocol(targetUrl: string): string {
    try {
      if (typeof window === 'undefined' || !window.location) return targetUrl;
      if (window.location.protocol !== 'https:') return targetUrl;
      const parsed = new URL(targetUrl);
      if (parsed.protocol === 'http:' && parsed.hostname === window.location.hostname) {
        parsed.protocol = 'https:';
        return parsed.href;
      }
    } catch {
      // ignore invalid URL
    }
    return targetUrl;
  }

  private async fetchHtmlSingleAttempt(targetUrl: string): Promise<string> {
    let nativeFetchError: Error | null = null;
    const sameOrigin = this.isSameOrigin(targetUrl);

    // 1. 若同源，优先使用原生 fetch（保留完整 Cookie 和防爬验证）
    if (sameOrigin && typeof window.fetch === 'function') {
      try {
        return await this.fetchChapterViaNativeFetch(targetUrl);
      } catch (fetchErr: any) {
        nativeFetchError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
        console.warn('[NovelTTS] 同源 fetch 失败，回退至 GM_xmlhttpRequest:', fetchErr);
      }
    }

    // 2. 非同源或同源 fetch 失败后，使用 GM_xmlhttpRequest
    if (nativeFetchError && typeof GM_xmlhttpRequest !== 'function') {
      throw nativeFetchError;
    }

    try {
      return await this.fetchChapterViaGM(targetUrl);
    } catch (gmErr: any) {
      const gmMsg = gmErr instanceof Error ? gmErr.message : String(gmErr);
      if (nativeFetchError) {
        const fetchMsg = nativeFetchError.message;
        if (/HTTP\s*403\b/i.test(fetchMsg) && /HTTP\s*403\b/i.test(gmMsg)) {
          throw new Error('同源 fetch 与 GM 通道均返回 HTTP 403（站点防火墙拦截后台抓取）');
        }
        throw new Error(`同源 fetch 失败 (${fetchMsg})；GM 兜底失败 (${gmMsg})`);
      }
      throw new Error(`非同源链接，${gmMsg}`);
    }
  }

  private async fetchHtml(
    targetUrl: string,
    options?: Omit<ChapterFetchOptions, 'allowVisited'>
  ): Promise<string> {
    const maxRetries = Math.max(0, options?.retries ?? 0);
    const baseDelay = options?.retryDelayMs ?? 800;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchHtmlSingleAttempt(targetUrl);
      } catch (err) {
        if (attempt >= maxRetries || !isRetryableChapterError(err)) {
          throw err;
        }
        const reason = err instanceof Error ? err.message : String(err);
        const nextAttempt = attempt + 1;
        options?.onRetry?.(nextAttempt, maxRetries, reason);
        await new Promise((resolve) => setTimeout(resolve, baseDelay * nextAttempt));
      }
    }

    throw new Error('章节抓取失败');
  }

  /**
   * 静默拉取指定章节的 HTML 并解析正文
   * @param targetUrl 下一章完整 URL
   * @param options 加载选项（allowVisited 为 true 时允许重读已访问章节，支持瞬态失败自动退避重试）
   */
  async loadChapter(
    targetUrl: string,
    options?: ChapterFetchOptions
  ): Promise<ChapterContent | null> {
    const normalized = this.normalizeUrl(targetUrl);
    if (!normalized) {
      console.warn('[NovelTTS] Invalid chapter URL:', targetUrl);
      return null;
    }

    const effectiveUrl = this.upgradeSameHostProtocol(targetUrl);
    const effectiveNormalized = this.normalizeUrl(effectiveUrl) || normalized;

    // 防死循环判断（自动连播始终拦截，手动翻页可传 allowVisited 放行）
    if (
      !options?.allowVisited &&
      (this.visitedUrls.has(normalized) || this.visitedUrls.has(effectiveNormalized))
    ) {
      console.warn('[NovelTTS] Prevented loop: already visited URL:', effectiveNormalized);
      return null;
    }

    const html = await this.fetchHtml(effectiveUrl, options);

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 提取正文与新的下一章链接
    const content = extractChapterContent(doc, effectiveUrl);

    // 仅在提取到有效正文时才记录已访问，避免防爬挑战空页污染 visitedUrls
    if (content.paragraphs.length > 0) {
      this.visitedUrls.add(normalized);
      this.visitedUrls.add(effectiveNormalized);
    }

    return content;
  }

  /**
   * 静默拉取小说目录页并解析章节列表（不写入 visitedUrls，避免污染正文防环）
   */
  async loadToc(
    tocUrl: string,
    options?: Omit<ChapterFetchOptions, 'allowVisited'>
  ): Promise<TocData> {
    const normalized = this.normalizeUrl(tocUrl);
    if (!normalized) {
      throw new Error(`非法的目录地址: ${tocUrl}`);
    }

    const effectiveUrl = this.upgradeSameHostProtocol(tocUrl);
    const html = await this.fetchHtml(effectiveUrl, options);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return extractTocFromDocument(doc, effectiveUrl);
  }
}
