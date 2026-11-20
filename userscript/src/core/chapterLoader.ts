import { extractChapterContent } from './extractor';
import type { ChapterContent } from './tts/types';

/**
 * 探测 HTML ArrayBuffer 的字符编码（支持 UTF-8 / GBK / GB2312 / GB18030）
 */
export function detectCharset(headers: Record<string, string> | string, buffer: ArrayBuffer): string {
  // 1. 尝试从响应头中解析
  let headerCharset = '';
  if (typeof headers === 'string') {
    const match = headers.match(/charset=([a-zA-Z0-9_-]+)/i);
    if (match) headerCharset = match[1].toLowerCase();
  } else if (headers && typeof headers === 'object') {
    const contentType =
      headers['content-type'] ||
      headers['Content-Type'] ||
      headers['content-type'.toLowerCase()] ||
      '';
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
   * 静默拉取指定章节的 HTML 并解析正文
   * @param targetUrl 下一章完整 URL
   */
  async loadChapter(targetUrl: string): Promise<ChapterContent | null> {
    const normalized = this.normalizeUrl(targetUrl);
    if (!normalized) {
      console.warn('[NovelTTS] Invalid chapter URL:', targetUrl);
      return null;
    }

    // 防死循环判断
    if (this.visitedUrls.has(normalized)) {
      console.warn('[NovelTTS] Prevented loop: already visited URL:', normalized);
      return null;
    }

    const gmRequest = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null;
    if (!gmRequest) {
      throw new Error('GM_xmlhttpRequest is not available for chapter loading');
    }

    const html = await new Promise<string>((resolve, reject) => {
      gmRequest({
        method: 'GET',
        url: targetUrl,
        responseType: 'arraybuffer',
        timeout: 10000,
        onload: (resp) => {
          if (resp.status < 200 || resp.status >= 300) {
            reject(new Error(`Failed to fetch chapter, HTTP ${resp.status}`));
            return;
          }

          const buffer = resp.response as ArrayBuffer;
          if (!buffer || buffer.byteLength === 0) {
            reject(new Error('Received empty response for chapter'));
            return;
          }

          const charset = detectCharset(resp.responseHeaders || '', buffer);
          try {
            const decoder = new TextDecoder(charset);
            const decoded = decoder.decode(buffer);
            resolve(decoded);
          } catch (decodeErr) {
            // 解码失败尝试 utf-8 兜底
            const fallbackDecoder = new TextDecoder('utf-8');
            resolve(fallbackDecoder.decode(buffer));
          }
        },
        onerror: (err) => reject(new Error(`Network error loading chapter: ${JSON.stringify(err)}`)),
        ontimeout: () => reject(new Error('Timed out loading next chapter')),
      });
    });

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 提取正文与新的下一章链接
    const content = extractChapterContent(doc, targetUrl);

    // 标记当前章节为已访问
    this.visitedUrls.add(normalized);

    return content;
  }
}
