import type { TocData, TocItem } from './tts/types';

const INVALID_HREF_PROTOCOL_REGEX = /^(?:javascript|mailto|tel):/i;
const TOC_LINK_EXCLUDE_REGEX =
  /(?:上一|下一|上章|下章|上页|下页|书架|书签|推荐|投票|报错|评论|登录|注册|首页|排行|分类|搜索)/;
const TOC_LINK_TIER1_REGEX =
  /^(?:章节目录|全部章节|返回目录|查看目录|回目录|小说目录|章节列表|目录|目录页|catalog|contents)$/i;
const TOC_LINK_TIER2_REGEX = /(?:目录|章节列表)/;

const TOC_CONTAINER_SELECTORS = [
  '#list dl',
  '#list',
  '#chapterlist',
  '#chapters',
  '.chapter-list',
  '.chapterlist',
  '.listmain dl',
  '.listmain',
  '.catalog',
  '.mulu',
  'ul.chapter',
  'ul.chapters',
  'ul.section-list',
  '.book-chapter-list',
];

const LATEST_DT_REGEX = /(?:最新章节|最近更新|最新更新|最新\d*章)/;
const TOC_FUNC_LINK_REGEX =
  /^(?:首页|上一页|下一页|尾页|末页|返回|目录|书架|投票|打赏|登录|注册|展开|收起|正序|倒序|最新章节|查看全部|加载更多)$/i;
const CHAPTER_TITLE_REGEX =
  /^(?:第[一二三四五六七八九十百千万零两\d]+[章节回卷话集]|序章?|楔子|引子|尾声|番外|chapter\s*\d+|\d+[.、\s])/i;
const NEXT_PAGE_LINK_REGEX = /^(?:下一页|下页|nextpage|next)[→>»›]*$/i;

/**
 * 清洗单行文本中的不可见字符与冗余空白
 */
export function cleanLine(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u3000]/g, ' ')
    .replace(/[ \t\f\r]+/g, ' ')
    .trim();
}

/**
 * 清洗标题，去除诸如 " - 笔趣阁", " _ 顶点小说", " | 小说网" 等网站后缀
 */
export function cleanTitle(raw: string): string {
  const line = cleanLine(raw);
  return (
    line
      .replace(/[-_|(][^-_|(]*?(?:小说|网|阁|看书|中文|免费|书院|首发|章节).*$/i, '')
      .replace(/\s*[-_|]\s*[^- _|]+$/, '')
      .trim() || line
  );
}

/**
 * 将相对/绝对链接解析为去 hash 后的标准 http(s) URL
 */
export function normalizeHttpUrl(rawHref: string, baseUrl: string): string | null {
  const trimmed = rawHref?.trim() || '';
  if (!trimmed || trimmed.startsWith('#') || INVALID_HREF_PROTOCOL_REGEX.test(trimmed)) {
    return null;
  }
  try {
    const u = new URL(trimmed, baseUrl);
    if (!['http:', 'https:'].includes(u.protocol)) {
      return null;
    }
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

export function resolveDocumentBaseUrl(
  doc: Document,
  currentUrl?: string
): { pageUrl: string; currentNorm: string | null; resolveBaseUrl: string } {
  const pageUrl = currentUrl || doc.baseURI || 'http://localhost';
  const currentNorm = normalizeHttpUrl(pageUrl, pageUrl);
  let resolveBaseUrl = pageUrl;

  const baseElHref = doc.querySelector('base[href]')?.getAttribute('href')?.trim();
  if (baseElHref) {
    try {
      resolveBaseUrl = new URL(baseElHref, pageUrl).href;
    } catch {
      // ignore invalid <base>
    }
  }

  return { pageUrl, currentNorm, resolveBaseUrl };
}

/**
 * 从章节页提取小说目录页链接
 */
export function extractTocUrl(doc: Document, currentUrl?: string): string | null {
  const { currentNorm, resolveBaseUrl } = resolveDocumentBaseUrl(doc, currentUrl);
  const links = Array.from(doc.querySelectorAll('a'));

  let bestScore = 0;
  let bestUrl: string | null = null;

  for (const link of links) {
    const rawHref = link.getAttribute('href')?.trim() || '';
    const resolved = normalizeHttpUrl(rawHref, resolveBaseUrl);
    if (!resolved || (currentNorm && resolved === currentNorm)) {
      continue;
    }

    if (link.closest('.comment, #comments, .comments, .reply, .recommend')) {
      continue;
    }

    const compactText = cleanLine(link.textContent || '').replace(/\s+/g, '');
    const compactTitle = cleanLine(link.getAttribute('title') || '').replace(/\s+/g, '');

    if (
      TOC_LINK_EXCLUDE_REGEX.test(compactText) ||
      TOC_LINK_EXCLUDE_REGEX.test(compactTitle)
    ) {
      continue;
    }

    const isKnownTocSelector =
      link.getAttribute('rel')?.toLowerCase() === 'contents' ||
      link.matches('a#catalog, a#toc, a.toc, a.catalog, a#pb_mulu, a#pt_mulu');

    let score = 0;
    if (TOC_LINK_TIER1_REGEX.test(compactText) || isKnownTocSelector) {
      score = 100;
    } else if (TOC_LINK_TIER2_REGEX.test(compactText) && compactText.length <= 10) {
      score = 70;
    } else if (compactTitle.includes('目录') && compactTitle.length <= 16) {
      score = 40;
    }

    if (score >= bestScore && score > 0) {
      bestScore = score;
      bestUrl = resolved;
    }
  }

  return bestUrl;
}

function collectValidLinksInScope(
  scope: Element,
  rootContainer: Element,
  resolveBaseUrl: string,
  tocNorm: string | null
): TocItem[] {
  const items: TocItem[] = [];
  const anchors = scope.tagName === 'A' ? [scope] : Array.from(scope.querySelectorAll('a'));

  for (const anchor of anchors) {
    const noiseParent = anchor.closest(
      'nav, header, footer, .comment, #comments, .comments, .recommend, .hot, .rank, .latest, .last9'
    );
    if (noiseParent && rootContainer.contains(noiseParent) && noiseParent !== rootContainer) {
      continue;
    }

    const rawHref = anchor.getAttribute('href')?.trim() || '';
    const url = normalizeHttpUrl(rawHref, resolveBaseUrl);
    if (!url || (tocNorm && url === tocNorm)) {
      continue;
    }

    const title = cleanLine(anchor.textContent || anchor.getAttribute('title') || '');
    if (!title || title.length > 80 || TOC_FUNC_LINK_REGEX.test(title)) {
      continue;
    }

    items.push({ title, url });
  }

  return items;
}

function deduplicateTocItems(items: TocItem[]): TocItem[] {
  const seen = new Set<string>();
  const deduped: TocItem[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }
  return deduped;
}

/**
 * 从候选容器提取目录项，自动跳过笔趣阁等 <dl> 顶部的“最新章节”重复区
 */
function collectLinksFromContainer(
  container: Element,
  resolveBaseUrl: string,
  tocNorm: string | null
): TocItem[] {
  const soleDl =
    container.tagName === 'DL'
      ? container
      : container.querySelectorAll('dl').length === 1
        ? container.querySelector('dl')
        : null;
  const dlTarget = soleDl && soleDl.querySelectorAll('dt').length >= 2 ? soleDl : null;

  if (dlTarget) {
    const children = Array.from(dlTarget.children);
    const dtFlags = children
      .filter((el) => el.tagName === 'DT')
      .map((dt) => LATEST_DT_REGEX.test(cleanLine(dt.textContent || '')));

    // 存在“最新章节”dt，且其后还存在另一个正文卷 dt 时，跳过最新章节区的所有 dd
    const hasLatestPrefix = dtFlags.some((isLatest, idx) => {
      if (!isLatest) return false;
      return dtFlags.slice(idx + 1).some((laterIsLatest) => !laterIsLatest);
    });

    const collected: TocItem[] = [];
    let inLatestSection = false;
    let dtCursor = 0;

    for (const child of children) {
      if (child.tagName === 'DT') {
        const isLatest = dtFlags[dtCursor] ?? false;
        const hasLaterRealDt = dtFlags.slice(dtCursor + 1).some((laterIsLatest) => !laterIsLatest);
        inLatestSection = hasLatestPrefix && isLatest && hasLaterRealDt;
        dtCursor++;
        continue;
      }

      if (!inLatestSection) {
        collected.push(
          ...collectValidLinksInScope(child, dlTarget, resolveBaseUrl, tocNorm)
        );
      }
    }

    return deduplicateTocItems(collected);
  }

  return deduplicateTocItems(
    collectValidLinksInScope(container, container, resolveBaseUrl, tocNorm)
  );
}

function scoreTocItems(items: TocItem[]): number {
  let score = items.length;
  for (const item of items) {
    if (CHAPTER_TITLE_REGEX.test(item.title)) {
      score += 2;
    }
  }
  return score;
}

function extractBookTitle(doc: Document): string {
  const titleEl = doc.querySelector('#info h1, .book-title, .bookname h1, h1');
  if (titleEl && titleEl.textContent?.trim()) {
    return cleanTitle(titleEl.textContent);
  }
  if (doc.title) {
    return cleanTitle(doc.title);
  }
  return '小说目录';
}

function extractNextTocPageUrl(
  doc: Document,
  resolveBaseUrl: string,
  tocNorm: string | null,
  itemUrls: Set<string>
): string | null {
  const links = Array.from(doc.querySelectorAll('a'));
  for (const link of links) {
    const rawHref = link.getAttribute('href')?.trim() || '';
    const resolved = normalizeHttpUrl(rawHref, resolveBaseUrl);
    if (!resolved || resolved === tocNorm || itemUrls.has(resolved)) {
      continue;
    }

    const compactText = cleanLine(link.textContent || '').replace(/\s+/g, '');
    if (
      NEXT_PAGE_LINK_REGEX.test(compactText) ||
      link.getAttribute('rel')?.toLowerCase() === 'next'
    ) {
      return resolved;
    }
  }

  // 兜底识别分页下拉框 <select>
  const selects = Array.from(doc.querySelectorAll('select'));
  for (const select of selects) {
    const options = Array.from(select.querySelectorAll('option'));
    const selectedIdx = options.findIndex((opt) => opt.selected || opt.hasAttribute('selected'));
    if (selectedIdx >= 0 && selectedIdx + 1 < options.length) {
      const nextVal = options[selectedIdx + 1].getAttribute('value')?.trim() || '';
      if (!/[/.?=]/.test(nextVal)) {
        continue;
      }
      const resolved = normalizeHttpUrl(nextVal, resolveBaseUrl);
      if (resolved && resolved !== tocNorm && !itemUrls.has(resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

/**
 * 从目录页 Document 中提取书名、正文目录列表与分页下一页 URL
 */
export function extractTocFromDocument(doc: Document, tocUrl: string): TocData {
  const { currentNorm, resolveBaseUrl } = resolveDocumentBaseUrl(doc, tocUrl);
  const bookTitle = extractBookTitle(doc);

  let bestItems: TocItem[] = [];
  let bestScore = 0;

  // 1. 优先尝试常见目录容器选择器
  for (const selector of TOC_CONTAINER_SELECTORS) {
    const matched = Array.from(doc.querySelectorAll(selector));
    for (const el of matched) {
      const items = collectLinksFromContainer(el, resolveBaseUrl, currentNorm);
      if (items.length < 3) continue;
      const score = scoreTocItems(items);
      if (score > bestScore) {
        bestScore = score;
        bestItems = items;
      }
    }
  }

  // 2. 启发式密度兜底遍历
  if (bestItems.length < 3) {
    const candidates = Array.from(doc.querySelectorAll('dl, ul, ol, div, section'));
    for (const cand of candidates) {
      const items = collectLinksFromContainer(cand, resolveBaseUrl, currentNorm);
      if (items.length < 3) continue;

      const innerBlocks = Array.from(cand.querySelectorAll('dl, ul, ol, div, section'));
      const hasTighterInner = innerBlocks.some((child) => {
        const childItems = collectLinksFromContainer(child, resolveBaseUrl, currentNorm);
        return childItems.length >= items.length * 0.8;
      });
      if (hasTighterInner) continue;

      const score = scoreTocItems(items);
      if (score > bestScore) {
        bestScore = score;
        bestItems = items;
      }
    }
  }

  const itemUrls = new Set(bestItems.map((i) => i.url));
  const nextPageUrl = extractNextTocPageUrl(doc, resolveBaseUrl, currentNorm, itemUrls);

  return {
    tocUrl: currentNorm || tocUrl,
    bookTitle,
    items: bestItems,
    nextPageUrl,
  };
}
