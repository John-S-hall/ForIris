const HIGHLIGHT_STYLE_ID = 'novel-tts-page-highlight-style';
const HIGHLIGHT_CLASS = 'novel-tts-active-mark';
const USER_SCROLL_PROTECT_MS = 3500;
const SKIP_ANCESTOR_SELECTOR =
  'script, style, noscript, textarea, input, select, option, novel-tts-host, novel-tts-reader-host';

interface CharMapping {
  node: Text;
  offset: number;
}

/** 移除零宽字符与全部空白，用于跨节点/跨空格稳健匹配 */
function normalizeForMatch(raw: string): string {
  return raw.replace(/[\u200B-\u200D\uFEFF\s]+/g, '');
}

function isSkippableChar(ch: string): boolean {
  return /[\u200B-\u200D\uFEFF\s]/.test(ch);
}

/**
 * 原网页正文实时高亮标注器
 * - 在未进入阅读模式时，于原网页 DOM 中高亮当前朗读句并居中滚动跟随
 * - 停止或切换阅读模式时无痕恢复原始 TextNode 结构
 */
export class PageHighlighter {
  private container: Element | null = null;
  private activeMarks: HTMLElement[] = [];
  private lastMatchPos = 0;
  private lastUserScrollAt = 0;

  private onTouchStart: () => void;
  private onWheel: () => void;

  constructor() {
    this.onTouchStart = () => {
      this.lastUserScrollAt = Date.now();
    };
    this.onWheel = () => {
      this.lastUserScrollAt = Date.now();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('touchstart', this.onTouchStart, { passive: true });
      window.addEventListener('wheel', this.onWheel, { passive: true });
    }
    this.ensureStyleInjected();
  }

  private ensureStyleInjected(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;

    const target = document.head || document.documentElement;
    if (!target) return;

    const style = document.createElement('style');
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        background: rgba(56, 189, 248, 0.28) !important;
        color: inherit !important;
        border-radius: 3px !important;
        box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.22) !important;
      }
    `;
    target.appendChild(style);
  }

  setContainer(el: Element | null): void {
    this.clear();
    this.container = el;
    this.lastMatchPos = 0;
  }

  resetPosition(): void {
    this.clear();
    this.lastMatchPos = 0;
  }

  clear(): void {
    if (this.activeMarks.length === 0) return;

    const parents = new Set<Node>();
    for (const mark of this.activeMarks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parents.add(parent);
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }

    this.activeMarks = [];

    parents.forEach((parent) => {
      if (typeof (parent as Element).normalize === 'function') {
        parent.normalize();
      }
    });
  }

  highlight(sentence: string): boolean {
    this.clear();
    if (typeof document === 'undefined') return false;

    const needle = normalizeForMatch(sentence || '');
    if (!needle) return false;

    const root: Element | null = this.container || document.body || document.documentElement;
    if (!root) return false;

    this.ensureStyleInjected();

    // 1. 构建可视字符序列及其在各自 Text 节点中的偏移映射
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const chars: string[] = [];
    const charMap: CharMapping[] = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
      const textNode = currentNode as Text;
      const parentEl = textNode.parentElement;
      if (!parentEl || !parentEl.closest(SKIP_ANCESTOR_SELECTOR)) {
        const val = textNode.nodeValue || '';
        for (let i = 0; i < val.length; i++) {
          const ch = val[i];
          if (!isSkippableChar(ch)) {
            chars.push(ch);
            charMap.push({ node: textNode, offset: i });
          }
        }
      }
      currentNode = walker.nextNode();
    }

    if (chars.length === 0) return false;
    const haystack = chars.join('');

    // 2. 匹配目标句子位置：从上次结束位置之后向后顺次匹配（防重复短句原地踏步）
    const searchStart = Math.max(0, this.lastMatchPos);
    let matchIdx = haystack.indexOf(needle, searchStart);
    let matchLen = needle.length;

    if (matchIdx === -1) {
      matchIdx = haystack.indexOf(needle);
    }

    // 若因原页夹杂广告标签导致整句未连通，降级取前 16 字作锚点定位句首
    if (matchIdx === -1 && needle.length > 16) {
      const anchor = needle.slice(0, 16);
      matchIdx = haystack.indexOf(anchor, searchStart);
      if (matchIdx === -1) {
        matchIdx = haystack.indexOf(anchor);
      }
      if (matchIdx !== -1) {
        matchLen = anchor.length;
      }
    }

    if (matchIdx === -1) {
      return false;
    }

    const endPos = matchIdx + matchLen;
    this.lastMatchPos = endPos;

    // 3. 按 Text 节点聚合包裹范围（倒序切分包裹确保安全）
    const rangesByNode = new Map<Text, { start: number; end: number }>();
    for (let i = matchIdx; i < endPos; i++) {
      const mapping = charMap[i];
      const existing = rangesByNode.get(mapping.node);
      if (!existing) {
        rangesByNode.set(mapping.node, { start: mapping.offset, end: mapping.offset + 1 });
      } else {
        existing.end = Math.max(existing.end, mapping.offset + 1);
      }
    }

    const entries = Array.from(rangesByNode.entries());
    const wrappedMarks: HTMLElement[] = [];

    for (let i = entries.length - 1; i >= 0; i--) {
      const [textNode, range] = entries[i];
      if (!textNode.parentNode) continue;

      let targetNode: Text = textNode;
      if (range.start > 0) {
        targetNode = textNode.splitText(range.start);
      }
      const spanLen = range.end - range.start;
      if (spanLen < targetNode.data.length) {
        targetNode.splitText(spanLen);
      }

      const mark = document.createElement('mark');
      mark.className = HIGHLIGHT_CLASS;
      targetNode.parentNode!.insertBefore(mark, targetNode);
      mark.appendChild(targetNode);
      wrappedMarks.push(mark);
    }

    // 保持文档正序存储，便于滚向首段高亮
    this.activeMarks = wrappedMarks.reverse();

    if (
      this.activeMarks.length > 0 &&
      Date.now() - this.lastUserScrollAt > USER_SCROLL_PROTECT_MS
    ) {
      this.scrollIntoViewSafe(this.activeMarks[0]);
    }

    return this.activeMarks.length > 0;
  }

  private scrollIntoViewSafe(el: HTMLElement): void {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      try {
        el.scrollIntoView();
      } catch {
        // 忽略无滚动实现环境
      }
    }
  }

  destroy(): void {
    this.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('touchstart', this.onTouchStart);
      window.removeEventListener('wheel', this.onWheel);
    }
    if (typeof document !== 'undefined') {
      const styleEl = document.getElementById(HIGHLIGHT_STYLE_ID);
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    }
  }
}
