import { Readability } from '@mozilla/readability';
import type { ChapterContent } from './tts/types';

/** 常见小说站正文容器的启发式选择器（按优先级排序） */
const NOVEL_CONTENT_SELECTORS = [
  '#chaptercontent',
  '#content',
  '#htmlContent',
  '#BookText',
  '#txtContent',
  '.content',
  '.read-content',
  '.entry-content',
  '#novelcontent',
  '#chapter-content',
  '.chapter-content',
];

/** 下一章链接正则匹配 */
const NEXT_CHAPTER_REGEX = /^(?:下一[章页]|下页|下一话)$|下一章|下一页|下页/;

/** 噪音节点标签名（大写） */
const NOISE_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'NAV',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'IFRAME',
  'FORM',
  'SVG',
]);

/** 兜底正文识别的最小字数阈值，低于此值不视为有效正文 */
const MIN_CONTENT_CHAR_THRESHOLD = 30;

/**
 * 清洗单行文本中的不可见字符与冗余空白
 */
export function cleanLine(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // 零宽字符
    .replace(/[\u00A0\u3000]/g, ' ')      // 不换行空格与全角空格转半角空格
    .replace(/[ \t\f\r]+/g, ' ')          // 合并连续水平空白
    .trim();
}

/**
 * 清洗标题，去除诸如 " - 笔趣阁", " _ 顶点小说", " | 小说网" 等网站后缀
 */
export function cleanTitle(raw: string): string {
  const line = cleanLine(raw);
  return line
    .replace(/[-_|(][^-_|(]*?(?:小说|网|阁|看书|中文|免费|书院|首发|章节).*$/i, '')
    .replace(/\s*[-_|]\s*[^- _|]+$/, '')
    .trim() || line;
}

/**
 * 将整段文本清洗并切分为非空段落数组
 */
export function cleanParagraphs(rawText: string): string[] {
  return rawText
    .split(/\r?\n+/)
    .map(cleanLine)
    .filter((line) => line.length > 0);
}

/**
 * 计算段落数组中实际有效字数（去除空白字符）
 */
function countEffectiveChars(paragraphs: string[]): number {
  return paragraphs.reduce((sum, p) => sum + p.replace(/\s+/g, '').length, 0);
}

/**
 * 从 HTML 元素中安全提取段落文本（保留 br 换行并剔除噪音节点）
 */
function extractParagraphsFromElement(element: Element): string[] {
  const clone = element.cloneNode(true) as Element;

  // 移除所有噪音标签
  const noiseElements = clone.querySelectorAll(
    'script, style, noscript, nav, header, footer, aside, iframe, form'
  );
  noiseElements.forEach((el) => el.remove());

  // 将 <br> 和 <p> 显式转换为换行符
  const brs = clone.querySelectorAll('br');
  brs.forEach((br) => {
    br.replaceWith(clone.ownerDocument.createTextNode('\n'));
  });

  const ps = clone.querySelectorAll('p');
  ps.forEach((p) => {
    p.prepend(clone.ownerDocument.createTextNode('\n'));
    p.append(clone.ownerDocument.createTextNode('\n'));
  });

  const text = clone.textContent || '';
  return cleanParagraphs(text);
}

/**
 * 启发式查找正文容器：
 * 1. 优先尝试已知的小说常见容器 ID / class
 * 2. 兜底采用最大文本密度容器算法
 */
function findFallbackContentElement(doc: Document): Element | null {
  // 1. 优先选择器检测
  for (const selector of NOVEL_CONTENT_SELECTORS) {
    const el = doc.querySelector(selector);
    if (el) {
      const text = el.textContent?.trim() || '';
      if (text.length >= MIN_CONTENT_CHAR_THRESHOLD) {
        return el;
      }
    }
  }

  // 2. 最大文本密度候选查找 (遍历 div, article, section)
  const candidates = doc.querySelectorAll('article, section, div');
  let bestElement: Element | null = null;
  let maxTextLength = 0;

  candidates.forEach((cand) => {
    if (NOISE_TAGS.has(cand.tagName)) return;

    // 排除表单或纯导航容器
    if (cand.querySelector('form, input, button') && !cand.querySelector('p, br')) {
      return;
    }

    const directTextLength = cand.textContent?.replace(/\s+/g, '').length || 0;
    if (directTextLength > maxTextLength) {
      const innerBlocks = cand.querySelectorAll('article, section');
      if (innerBlocks.length === 0) {
        maxTextLength = directTextLength;
        bestElement = cand;
      }
    }
  });

  // 只有当最大文本密度容器字数达到阈值时才返回
  if (maxTextLength >= MIN_CONTENT_CHAR_THRESHOLD) {
    return bestElement;
  }

  return null;
}

/**
 * 启发式提取标题
 */
function extractFallbackTitle(doc: Document): string {
  // 1. 优先从 h1 获取
  const h1 = doc.querySelector('h1');
  if (h1 && h1.textContent?.trim()) {
    return cleanTitle(h1.textContent);
  }

  // 2. 常见标题 class / id
  const titleEl = doc.querySelector('.title, .chapter-title, #title, #chaptername');
  if (titleEl && titleEl.textContent?.trim()) {
    return cleanTitle(titleEl.textContent);
  }

  // 3. 从 document.title 中获取并清洗
  if (doc.title) {
    return cleanTitle(doc.title);
  }

  return '';
}

/**
 * 提取下一章完整绝对 URL
 */
export function extractNextChapterUrl(doc: Document, currentUrl?: string): string | null {
  const baseUrl = currentUrl || doc.baseURI || 'http://localhost';
  let currentParsed: URL | null = null;
  try {
    currentParsed = new URL(baseUrl);
  } catch {
    // baseUrl 解析失败
  }

  const links = Array.from(doc.querySelectorAll('a'));
  let matchedHref: string | null = null;

  // 倒序遍历（通常移动端或PC端的小说翻页栏位于正文底部）
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i];
    const text = cleanLine(link.textContent || '');
    const title = cleanLine(link.getAttribute('title') || '');

    // 匹配下一章/下一页/下页，排除“上一章/上一页”
    if (
      (NEXT_CHAPTER_REGEX.test(text) || NEXT_CHAPTER_REGEX.test(title)) &&
      !text.includes('上一') &&
      !title.includes('上一')
    ) {
      const rawHref = link.getAttribute('href');
      if (rawHref && rawHref.trim() && !rawHref.startsWith('javascript:') && rawHref !== '#') {
        matchedHref = rawHref.trim();
        break;
      }
    }
  }

  if (!matchedHref) {
    return null;
  }

  try {
    const absolute = new URL(matchedHref, baseUrl);

    // 防死循环边界判断：仅允许 http/https 协议
    if (!['http:', 'https:'].includes(absolute.protocol)) {
      return null;
    }

    // 若解析出的 URL 指向当前页本身（忽略 hash 后完全一致），视为无效链接
    if (currentParsed) {
      const currentNoHash = `${currentParsed.origin}${currentParsed.pathname}${currentParsed.search}`;
      const targetNoHash = `${absolute.origin}${absolute.pathname}${absolute.search}`;
      if (currentNoHash === targetNoHash) {
        return null;
      }
    }

    return absolute.href;
  } catch {
    return null;
  }
}

/**
 * 正文提取入口函数
 * @param doc DOM Document 对象
 * @param currentUrl 当前页面 URL（用于将相对路径解析为完整绝对 URL 并检测自环）
 */
export function extractChapterContent(doc: Document, currentUrl?: string): ChapterContent {
  const nextChapterUrl = extractNextChapterUrl(doc, currentUrl);

  let title = '';
  let paragraphs: string[] = [];

  // 1. 优先尝试 @mozilla/readability
  try {
    const clonedDoc = doc.cloneNode(true) as Document;
    const reader = new Readability(clonedDoc, {
      charThreshold: 20,
    });
    const parsed = reader.parse();

    if (parsed && parsed.textContent) {
      paragraphs = cleanParagraphs(parsed.textContent);
      title = cleanTitle(parsed.title || '');
    }
  } catch {
    paragraphs = [];
  }

  const effectiveChars = countEffectiveChars(paragraphs);

  // 2. 兜底逻辑：字数 < 100 字或解析为空时，触发启发式 DOM 提取
  if (paragraphs.length === 0 || effectiveChars < 100) {
    const fallbackEl = findFallbackContentElement(doc);
    if (fallbackEl) {
      const fallbackParagraphs = extractParagraphsFromElement(fallbackEl);
      if (fallbackParagraphs.length > 0) {
        paragraphs = fallbackParagraphs;
      }
    } else if (effectiveChars < MIN_CONTENT_CHAR_THRESHOLD) {
      // 启发式未命中，且 Readability 提取字数极少（如登录标题/导航杂质），清空以触发未识别正文判定
      paragraphs = [];
    }

    // 兜底提取标题（或者 Readability 的标题带有站点杂质）
    const fallbackTitle = extractFallbackTitle(doc);
    if (!title || title.length > 50 || title.includes('-') || title.includes('_')) {
      title = fallbackTitle || title;
    }
  }

  // 最终确保标题已清洗
  title = cleanTitle(title || extractFallbackTitle(doc));

  // 优化：如果首段与标题完全相同，剔除首段重复标题
  if (paragraphs.length > 0 && title && paragraphs[0] === title) {
    paragraphs.shift();
  }

  // 最终防御性校验：若正文总字数仍低于最小有效正文阈值，置为空段落数组
  if (countEffectiveChars(paragraphs) < MIN_CONTENT_CHAR_THRESHOLD) {
    paragraphs = [];
  }

  return {
    title,
    paragraphs,
    nextChapterUrl,
  };
}
