import { Readability } from '@mozilla/readability';
import type { ChapterContent } from './tts/types';
import {
  cleanLine,
  cleanTitle,
  extractTocUrl,
  extractTocFromDocument,
} from './tocExtractor';

export { cleanLine, cleanTitle, extractTocUrl, extractTocFromDocument };

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

/** 下一章链接干扰词过滤 */
const NEXT_CHAPTER_EXCLUDE_REGEX = /(?:上一|上章|上页|目录|书架|书签|推荐|预告|催更|评论|投票)/;

/** Tier 1 精确下一章文字 */
const NEXT_CHAPTER_TIER1_REGEX = /^(?:下一[章节回话]|下章|后一章|nextchapter)[→>»›]*$/i;

/** Tier 2 下一页文字 */
const NEXT_CHAPTER_TIER2_REGEX = /^(?:下一页|下页|nextpage|next)[→>»›]*$/i;

/** Tier 3 模糊包含 */
const NEXT_CHAPTER_TIER3_REGEX = /(?:下一章|下一页|下页|下一节|下章)/;

/** 上一章链接干扰词过滤 */
const PREV_CHAPTER_EXCLUDE_REGEX = /(?:下一|下章|下页|目录|书架|书签|推荐|预告|催更|评论|投票)/;

/** Tier 1 精确上一章文字 */
const PREV_CHAPTER_TIER1_REGEX =
  /^(?:上一[章节回话]|上章|前一章|prevchapter|previouschapter)[←<«‹]*$/i;

/** Tier 2 上一页文字 */
const PREV_CHAPTER_TIER2_REGEX = /^(?:上一页|上页|prevpage|prev|previous)[←<«‹]*$/i;

/** Tier 3 模糊包含 */
const PREV_CHAPTER_TIER3_REGEX = /(?:上一章|上一页|上页|上一节|上章)/;

interface ChapterNavRule {
  rel: 'next' | 'prev';
  knownSelector: string;
  excludeRegex: RegExp;
  tier1Regex: RegExp;
  tier2Regex: RegExp;
  tier3Regex: RegExp;
}

const NEXT_CHAPTER_RULE: ChapterNavRule = {
  rel: 'next',
  knownSelector: '#pb_next, #next_url, #pt_next, #nextchapter, #linkNext, a.next-chapter',
  excludeRegex: NEXT_CHAPTER_EXCLUDE_REGEX,
  tier1Regex: NEXT_CHAPTER_TIER1_REGEX,
  tier2Regex: NEXT_CHAPTER_TIER2_REGEX,
  tier3Regex: NEXT_CHAPTER_TIER3_REGEX,
};

const PREV_CHAPTER_RULE: ChapterNavRule = {
  rel: 'prev',
  knownSelector: '#pb_prev, #prev_url, #pt_prev, #prevchapter, #linkPrev, a.prev-chapter',
  excludeRegex: PREV_CHAPTER_EXCLUDE_REGEX,
  tier1Regex: PREV_CHAPTER_TIER1_REGEX,
  tier2Regex: PREV_CHAPTER_TIER2_REGEX,
  tier3Regex: PREV_CHAPTER_TIER3_REGEX,
};

/** 非法/非导航链接协议 */
const INVALID_HREF_PROTOCOL_REGEX = /^(?:javascript|mailto|tel):/i;

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
 * 统计节点内非链接文本与链接文本的有效字符数（跳过噪音标签）
 */
function measureTextStats(el: Element): { nonLinkChars: number; linkChars: number } {
  let nonLinkChars = 0;
  let linkChars = 0;

  const walk = (node: Node, inLink: boolean) => {
    if (node.nodeType === 3) {
      const len = (node.nodeValue || '').replace(/\s+/g, '').length;
      if (inLink) {
        linkChars += len;
      } else {
        nonLinkChars += len;
      }
      return;
    }
    if (node.nodeType !== 1) return;

    const elem = node as Element;
    if (NOISE_TAGS.has(elem.tagName)) return;

    const nextInLink = inLink || elem.tagName === 'A';
    for (let i = 0; i < elem.childNodes.length; i++) {
      walk(elem.childNodes[i], nextInLink);
    }
  };

  walk(el, el.tagName === 'A');
  return { nonLinkChars, linkChars };
}

/**
 * 启发式查找正文容器：
 * 1. 优先尝试已知的小说常见容器 ID / class
 * 2. 兜底采用最大文本密度容器算法（过滤导航目录、优先最精准内层正文块）
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
  const candidates = Array.from(doc.querySelectorAll('article, section, div'));
  let bestElement: Element | null = null;
  let maxNonLinkLength = 0;

  for (const cand of candidates) {
    if (NOISE_TAGS.has(cand.tagName)) continue;

    // 排除表单或纯导航容器
    if (cand.querySelector('form, input, button') && !cand.querySelector('p, br')) {
      continue;
    }

    const stats = measureTextStats(cand);
    const totalChars = stats.nonLinkChars + stats.linkChars;
    if (totalChars === 0 || stats.nonLinkChars < MIN_CONTENT_CHAR_THRESHOLD) {
      continue;
    }

    // 跳过链接文字占比超过 45% 的导航/目录/推荐容器
    if (stats.linkChars / totalChars > 0.45) {
      continue;
    }

    // 若存在内层子块承载了 >= 80% 的非链接文本，说明当前是外层包裹壳，跳过外层让内层胜出
    const innerBlocks = Array.from(cand.querySelectorAll('div, article, section'));
    const hasTighterInnerBlock = innerBlocks.some((child) => {
      if (NOISE_TAGS.has(child.tagName)) return false;
      const childStats = measureTextStats(child);
      const childTotal = childStats.nonLinkChars + childStats.linkChars;
      if (childTotal === 0 || childStats.linkChars / childTotal > 0.45) return false;
      return childStats.nonLinkChars >= stats.nonLinkChars * 0.8;
    });

    if (hasTighterInnerBlock) {
      continue;
    }

    if (stats.nonLinkChars > maxNonLinkLength) {
      maxNonLinkLength = stats.nonLinkChars;
      bestElement = cand;
    }
  }

  return maxNonLinkLength >= MIN_CONTENT_CHAR_THRESHOLD ? bestElement : null;
}

/**
 * 查找当前文档最可能承载小说正文的 DOM 容器（供原网页高亮器使用）
 */
export function findContentElement(doc: Document): Element | null {
  const matched = findFallbackContentElement(doc);
  if (matched) return matched;

  const semantic = doc.querySelector('article, main');
  if (semantic) {
    const stats = measureTextStats(semantic);
    if (stats.nonLinkChars >= MIN_CONTENT_CHAR_THRESHOLD) {
      return semantic;
    }
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
 * 解析并校验下一章绝对 URL（过滤非法协议与当前页自环）
 */
function resolveValidNextUrl(
  rawHref: string,
  resolveBaseUrl: string,
  currentParsed: URL | null
): string | null {
  try {
    const absolute = new URL(rawHref, resolveBaseUrl);

    if (!['http:', 'https:'].includes(absolute.protocol)) {
      return null;
    }

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

function extractChapterNavUrl(
  doc: Document,
  currentUrl: string | undefined,
  rule: ChapterNavRule
): string | null {
  const pageUrl = currentUrl || doc.baseURI || 'http://localhost';
  let currentParsed: URL | null = null;
  try {
    currentParsed = new URL(pageUrl);
  } catch {
    // pageUrl 解析失败
  }

  // 若页面存在 <base href="...">，相对路径基于 <base> 解析
  let resolveBaseUrl = pageUrl;
  const baseElHref = doc.querySelector('base[href]')?.getAttribute('href')?.trim();
  if (baseElHref) {
    try {
      resolveBaseUrl = new URL(baseElHref, pageUrl).href;
    } catch {
      // ignore invalid base
    }
  }

  const links = Array.from(doc.querySelectorAll('a'));
  let bestScore = 0;
  let bestUrl: string | null = null;

  for (const link of links) {
    const rawHref = link.getAttribute('href')?.trim() || '';
    if (!rawHref || rawHref === '#' || INVALID_HREF_PROTOCOL_REGEX.test(rawHref)) {
      continue;
    }

    // 排除评论区/回复区/推荐区翻页链接
    if (link.closest('.comment, #comments, .comments, .reply, .recommend')) {
      continue;
    }

    const compactText = cleanLine(link.textContent || '').replace(/\s+/g, '');
    const compactTitle = cleanLine(link.getAttribute('title') || '').replace(/\s+/g, '');

    if (rule.excludeRegex.test(compactText) || rule.excludeRegex.test(compactTitle)) {
      continue;
    }

    const isKnownSelector =
      link.getAttribute('rel')?.toLowerCase() === rule.rel || link.matches(rule.knownSelector);

    let score = 0;
    if (rule.tier1Regex.test(compactText) || isKnownSelector) {
      score = 100;
    } else if (rule.tier2Regex.test(compactText)) {
      score = 70;
    } else if (
      (rule.tier3Regex.test(compactText) && compactText.length <= 16) ||
      (rule.tier3Regex.test(compactTitle) && compactTitle.length <= 16)
    ) {
      score = 40;
    }

    if (score === 0) continue;

    const resolvedUrl = resolveValidNextUrl(rawHref, resolveBaseUrl, currentParsed);
    if (!resolvedUrl) continue;

    // 同级取 DOM 中位置更靠后者（移动端常见底部翻页栏优先）
    if (score >= bestScore) {
      bestScore = score;
      bestUrl = resolvedUrl;
    }
  }

  return bestUrl;
}

/**
 * 提取下一章完整绝对 URL（分级打分 + 评论区隔离 + 空格归一化）
 */
export function extractNextChapterUrl(doc: Document, currentUrl?: string): string | null {
  return extractChapterNavUrl(doc, currentUrl, NEXT_CHAPTER_RULE);
}

/**
 * 提取上一章完整绝对 URL（与下一章提取对称的分级打分机制）
 */
export function extractPrevChapterUrl(doc: Document, currentUrl?: string): string | null {
  return extractChapterNavUrl(doc, currentUrl, PREV_CHAPTER_RULE);
}

/**
 * 正文提取入口函数
 * @param doc DOM Document 对象
 * @param currentUrl 当前页面 URL（用于将相对路径解析为完整绝对 URL 并检测自环）
 */
export function extractChapterContent(doc: Document, currentUrl?: string): ChapterContent {
  const nextChapterUrl = extractNextChapterUrl(doc, currentUrl);
  const prevChapterUrl = extractPrevChapterUrl(doc, currentUrl);
  const tocUrl = extractTocUrl(doc, currentUrl);

  let title = '';
  let paragraphs: string[] = [];

  // 1. 优先尝试 @mozilla/readability
  try {
    const clonedDoc = doc.cloneNode(true) as Document;
    const reader = new Readability(clonedDoc, {
      charThreshold: 20,
    });
    const parsed = reader.parse();

    if (parsed && (parsed.content || parsed.textContent)) {
      if (parsed.content && typeof DOMParser !== 'undefined') {
        const parsedDoc = new DOMParser().parseFromString(parsed.content, 'text/html');
        paragraphs = extractParagraphsFromElement(parsedDoc.body);
      }
      if (paragraphs.length === 0 && parsed.textContent) {
        paragraphs = cleanParagraphs(parsed.textContent);
      }
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
    prevChapterUrl,
    tocUrl,
  };
}

const DEDICATED_NOVEL_SELECTORS =
  '#chaptercontent, #BookText, #txtContent, #novelcontent, #chapter-content, .chapter-content, .read-content';
const CHAPTER_HEADING_REGEX =
  /第[一二三四五六七八九十百千万零两\d]+\s*[章节回话卷节集]|^(?:序[章言幕]?|楔子|引子|尾声|番外|后记|chapter\s*\d+)/i;
const ROOT_INDEX_PATH_REGEX = /^\/(?:index|default)\.(?:html?|php|aspx?|jsp)$/i;

/**
 * 判断当前页面是否为真正的小说章节阅读页（用于“自动进入阅读模式”防误触）
 */
export function isLikelyNovelChapterPage(
  doc: Document,
  chapter: ChapterContent,
  currentUrl?: string
): boolean {
  if (!chapter || chapter.paragraphs.length < 3 || countEffectiveChars(chapter.paragraphs) < 400) {
    return false;
  }

  const rawUrl = currentUrl || doc.baseURI || '';
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (
        parsed.pathname === '/' ||
        parsed.pathname === '' ||
        ROOT_INDEX_PATH_REGEX.test(parsed.pathname)
      ) {
        return false;
      }
    } catch {
      // 忽略无效 URL 解析
    }
  }

  const containerEl = doc.querySelector(DEDICATED_NOVEL_SELECTORS);
  const containerChars = containerEl
    ? (containerEl.textContent || '').replace(/\s+/g, '').length
    : 0;
  const hasDedicatedContainer = containerChars >= 100;
  const hasNext = Boolean(chapter.nextChapterUrl);
  const hasPrev = Boolean(chapter.prevChapterUrl);
  const hasToc = Boolean(chapter.tocUrl);
  const hasChapterTitle = CHAPTER_HEADING_REGEX.test(chapter.title || '');

  const score =
    (hasDedicatedContainer ? 1 : 0) +
    (hasNext ? 1 : 0) +
    (hasPrev ? 1 : 0) +
    (hasToc ? 1 : 0) +
    (hasChapterTitle ? 1 : 0);

  return score >= 2 && (hasPrev || hasNext || hasToc || hasDedicatedContainer);
}
