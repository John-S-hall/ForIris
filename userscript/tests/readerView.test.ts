import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_CONFIG, type AppConfig } from '../src/core/storage';
import { chunkParagraphs } from '../src/core/chunker';
import { ReaderView, type LoadedReaderChapter, type ReaderViewEvents } from '../src/ui/readerView';
import { FloatingBar } from '../src/ui/floatingBar';

function makeEvents(overrides: Partial<ReaderViewEvents> = {}): ReaderViewEvents {
  return {
    onClose: vi.fn(),
    onPlayToggle: vi.fn(),
    onStop: vi.fn(),
    onPrevSentence: vi.fn(),
    onNextSentence: vi.fn(),
    onSeekSentence: vi.fn(),
    onPrevChapter: vi.fn(),
    onNextChapter: vi.fn(),
    onRequestAppendNext: vi.fn(),
    onOpenToc: vi.fn(),
    onRefreshToc: vi.fn(),
    onLoadMoreToc: vi.fn(),
    onSelectTocChapter: vi.fn(),
    onOpenExternalToc: vi.fn(),
    onRateChange: vi.fn(),
    onVoiceChange: vi.fn(),
    onSaveConfig: vi.fn(),
    onTestConfig: vi
      .fn()
      .mockResolvedValue({ success: true, source: 'fetch', duration: 10, bytes: 100 }),
    onJumpChapterUrl: vi.fn(),
    onSettingsChange: vi.fn(),
    ...overrides,
  };
}

function makeLoadedChapter(
  id: string,
  title: string,
  paragraphs: string[],
  nextChapterUrl: string | null = null,
  prevChapterUrl: string | null = null
): LoadedReaderChapter {
  return {
    id,
    url: id,
    chapter: {
      title,
      paragraphs,
      nextChapterUrl,
      prevChapterUrl,
    },
    chunks: chunkParagraphs(paragraphs, { minChars: 30, maxChars: 120 }),
  };
}

describe('readerView.ts & floatingBar.ts - 阅读模式(目录+无限滚动)与精简悬浮球', () => {
  let readerView: ReaderView | null = null;
  let floatingBar: FloatingBar | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'visible';
  });

  afterEach(() => {
    readerView?.unmount();
    readerView = null;
    floatingBar?.unmount();
    floatingBar = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const makeConfig = (): AppConfig => ({
    ...DEFAULT_CONFIG,
    workerUrl: 'https://tts.example.com',
    reader: { ...DEFAULT_CONFIG.reader },
  });

  it('open/close 正确接管 Shadow DOM 展示并锁定/恢复页面 overflow，且采用布局 2 四键底栏', () => {
    readerView = new ReaderView(makeConfig(), makeEvents());
    const host = document.createElement('div');
    document.body.appendChild(host);
    readerView.mount(host);

    const rootHost = document.getElementById('novel-tts-reader-root')!;
    const shadow = rootHost.shadowRoot!;
    expect(rootHost.style.display).toBe('none');

    // 验证布局 2 4 键底栏存在
    expect(shadow.querySelectorAll('.dock-actions .dock-btn').length).toBe(4);
    expect(shadow.querySelector('#rv-dock-toc')).not.toBeNull();
    expect(shadow.querySelector('#rv-dock-tts')).not.toBeNull();
    expect(shadow.querySelector('#rv-dock-appearance')).not.toBeNull();
    expect(shadow.querySelector('#rv-dock-next-ch')).not.toBeNull();
    expect(shadow.querySelector('#rv-top-prev')).not.toBeNull();

    readerView.open();
    expect(readerView.isOpen()).toBe(true);
    expect(rootHost.style.display).toBe('block');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');

    readerView.close();
    expect(readerView.isOpen()).toBe(false);
    expect(rootHost.style.display).toBe('none');
    expect(document.documentElement.style.overflow).toBe('auto');
    expect(document.body.style.overflow).toBe('visible');
  });

  it('replaceChapter & appendChapter 支持多章拼接、防重与按章独立句高亮，超 5 章自动淘汰旧章并保护正在播放章', () => {
    readerView = new ReaderView(makeConfig(), makeEvents());
    readerView.mount(document.body);
    readerView.open();

    const ch1 = makeLoadedChapter(
      'https://example.com/1.html',
      '第1章 初临',
      ['“谁？”', '“是我。”<script>window.__xss=true</script>', '清晨薄雾消散在幽静森林之中。'],
      'https://example.com/2.html',
      null
    );
    const ch2 = makeLoadedChapter(
      'https://example.com/2.html',
      '第2章 破晓',
      ['第二章开头第一句足够三十个字用于验证跨章独立句级高亮不会串到第一章上面。'],
      'https://example.com/3.html',
      'https://example.com/1.html'
    );

    readerView.replaceChapter(ch1);
    readerView.appendChapter(ch2);

    const shadow = document.getElementById('novel-tts-reader-root')!.shadowRoot!;
    expect((window as any).__xss).toBeUndefined();
    expect(shadow.querySelectorAll('.reader-chapter').length).toBe(2);
    expect((shadow.querySelector('#rv-top-prev') as HTMLButtonElement).disabled).toBe(true);

    // 高亮 ch1 第 0 句，ch2 第 0 句不应高亮
    readerView.setActiveChunk(ch1.id, 0);
    const actives1 = shadow.querySelectorAll('.reader-sentence.active');
    expect(actives1.length).toBeGreaterThan(0);
    actives1.forEach((el) => expect(el.getAttribute('data-chapter-id')).toBe(ch1.id));

    // 高亮 ch2 第 0 句，ch1 高亮清空
    readerView.setActiveChunk(ch2.id, 0);
    const actives2 = shadow.querySelectorAll('.reader-sentence.active');
    expect(actives2.length).toBe(1);
    expect(actives2[0].getAttribute('data-chapter-id')).toBe(ch2.id);

    // 正在播放 ch2 时再连续追加 ch3..ch6（总计 6 章 > 5）：应淘汰最早非播放/非阅读章，保留 ch2
    // 先高亮并停留在 ch1 设为播放中来测试保护策略
    readerView.setActiveChunk(ch1.id, 0);
    const ch3 = makeLoadedChapter('https://example.com/3.html', '第3章', ['第三章正文测试句子长度达到三十字以上用于测试。'], 'https://example.com/4.html');
    const ch4 = makeLoadedChapter('https://example.com/4.html', '第4章', ['第四章正文测试句子长度达到三十字以上用于测试。'], 'https://example.com/5.html');
    const ch5 = makeLoadedChapter('https://example.com/5.html', '第5章', ['第五章正文测试句子长度达到三十字以上用于测试。'], 'https://example.com/6.html');
    const ch6 = makeLoadedChapter('https://example.com/6.html', '第6章', ['第六章正文测试句子长度达到三十字以上用于测试。'], null);

    readerView.appendChapter(ch3);
    readerView.appendChapter(ch4);
    readerView.appendChapter(ch5);
    const evicted = readerView.appendChapter(ch6);

    // ch1 同时在播放且为 visible，故跳过 ch1 转而淘汰 ch2
    expect(evicted).toEqual([ch2.id]);
    expect(shadow.querySelectorAll('.reader-chapter').length).toBe(5);
    expect(shadow.querySelector(`.reader-chapter[data-chapter-id="${ch1.id}"]`)).not.toBeNull();
  });

  it('双击已拼接第二章的正文句子同步触发 onSeekSentence(ch2.id, idx)', () => {
    vi.useFakeTimers();
    const onSeekSentence = vi.fn();

    readerView = new ReaderView(makeConfig(), makeEvents({ onSeekSentence }));
    readerView.mount(document.body);
    readerView.open();

    const ch1 = makeLoadedChapter('https://example.com/1.html', '第1章', [
      '第一章内容超过三十个字确保正常分句显示在阅读器界面里。',
    ]);
    const ch2 = makeLoadedChapter('https://example.com/2.html', '第2章', [
      '第二章第一句话也必须超过三十个字数才能单独分句不会合并在一起。',
      '第二章第二句话同样足够超过三十个字数用来准确验证双击传回句号。',
    ]);
    readerView.replaceChapter(ch1);
    readerView.appendChapter(ch2);

    const shadow = document.getElementById('novel-tts-reader-root')!.shadowRoot!;
    const targetSpan = shadow.querySelector(
      `.reader-chapter[data-chapter-id="${ch2.id}"] .reader-sentence[data-chunk-index="1"]`
    ) as HTMLElement;
    const topBar = shadow.querySelector('#rv-top-bar')!;

    targetSpan.click();
    targetSpan.click();
    expect(onSeekSentence).toHaveBeenCalledTimes(1);
    expect(onSeekSentence).toHaveBeenCalledWith(ch2.id, 1);

    vi.advanceTimersByTime(300);
    expect(topBar.classList.contains('open')).toBe(false);

    // 单击展开菜单后再点击正文立刻收起
    targetSpan.click();
    vi.advanceTimersByTime(260);
    expect(topBar.classList.contains('open')).toBe(true);
    targetSpan.click();
    expect(topBar.classList.contains('open')).toBe(false);
  });

  it('目录抽屉：打开按需加载、搜索过滤、正倒序切换、分页加载与失败显示历史记录', () => {
    const onOpenToc = vi.fn();
    const onSelectTocChapter = vi.fn();
    const onLoadMoreToc = vi.fn();

    readerView = new ReaderView(
      makeConfig(),
      makeEvents({ onOpenToc, onSelectTocChapter, onLoadMoreToc })
    );
    readerView.mount(document.body);
    readerView.open();

    const ch2 = makeLoadedChapter('https://example.com/2.html', '第2章', [
      '第二章测试正文内容超过三十个字。',
    ]);
    readerView.replaceChapter(ch2);

    const shadow = document.getElementById('novel-tts-reader-root')!.shadowRoot!;
    (shadow.querySelector('#rv-dock-toc') as HTMLElement).click();

    expect(onOpenToc).toHaveBeenCalledTimes(1);
    expect(shadow.querySelector('#rv-toc-drawer')!.classList.contains('open')).toBe(true);

    readerView.setTocState(
      {
        status: 'ready',
        tocUrl: 'https://example.com/list.html',
        bookTitle: '测试书名',
        items: [
          { title: '第1章 起航', url: 'https://example.com/1.html' },
          { title: '第2章 遇险', url: 'https://example.com/2.html' },
          { title: '第3章 脱困', url: 'https://example.com/3.html' },
        ],
        nextPageUrl: 'https://example.com/list_2.html',
      },
      'https://example.com/2.html'
    );

    const tocItems = shadow.querySelectorAll('#rv-toc-list .toc-item');
    expect(tocItems.length).toBe(3);
    expect(tocItems[1].classList.contains('active')).toBe(true);

    // 切换倒序
    (shadow.querySelector('#rv-toc-sort') as HTMLElement).click();
    expect(shadow.querySelectorAll('#rv-toc-list .toc-item')[0].textContent).toBe('第3章 脱困');

    // 搜索过滤
    const searchInput = shadow.querySelector('#rv-toc-search') as HTMLInputElement;
    searchInput.value = '遇险';
    searchInput.dispatchEvent(new Event('input'));
    expect(shadow.querySelectorAll('#rv-toc-list .toc-item').length).toBe(1);

    // 点击加载下一页
    (shadow.querySelector('#rv-toc-load-more') as HTMLButtonElement).click();
    expect(onLoadMoreToc).toHaveBeenCalledWith('https://example.com/list_2.html');

    // 点击目录跳章并关闭抽屉
    (shadow.querySelector('#rv-toc-list .toc-item') as HTMLElement).click();
    expect(onSelectTocChapter).toHaveBeenCalledWith('https://example.com/2.html', '第2章 遇险');
    expect(shadow.querySelector('#rv-toc-drawer')!.classList.contains('open')).toBe(false);

    // 目录加载失败降级显示已读历史
    readerView.setTocState({
      status: 'error',
      tocUrl: 'https://example.com/list.html',
      errorMessage: 'HTTP 403',
      items: [],
      historyItems: [{ title: '第1章 起航', url: 'https://example.com/1.html' }],
    });
    expect(shadow.querySelector('#rv-toc-list')!.textContent).toContain('本次已读章节记录');
    expect(shadow.querySelectorAll('#rv-toc-list .toc-item').length).toBe(1);
  });

  it('主题、字号、行距、无限滚动开关与悬浮球抑制正常工作', () => {
    const onSettingsChange = vi.fn();
    readerView = new ReaderView(makeConfig(), makeEvents({ onSettingsChange }));
    readerView.mount(document.body);
    readerView.open();

    const shadow = document.getElementById('novel-tts-reader-root')!.shadowRoot!;
    const rootEl = shadow.querySelector('.reader-root') as HTMLElement;

    (shadow.querySelector('[data-theme-opt="dark"]') as HTMLElement).click();
    expect(rootEl.getAttribute('data-theme')).toBe('dark');
    expect(onSettingsChange).toHaveBeenCalledWith({ theme: 'dark' });

    const infCheckbox = shadow.querySelector('#rv-infinite-scroll') as HTMLInputElement;
    expect(infCheckbox.checked).toBe(true);
    infCheckbox.checked = false;
    infCheckbox.dispatchEvent(new Event('change'));
    expect(onSettingsChange).toHaveBeenCalledWith({ infiniteScroll: false });

    const onOpenReader = vi.fn();
    floatingBar = new FloatingBar(makeConfig(), {
      onPlayToggle: vi.fn(),
      onNextSentence: vi.fn(),
      onPrevSentence: vi.fn(),
      onNextChapter: vi.fn(),
      onOpenReader,
      onRateChange: vi.fn(),
      onVoiceChange: vi.fn(),
      onSaveConfig: vi.fn(),
      onTestConfig: vi
        .fn()
        .mockResolvedValue({ success: true, source: 'fetch', duration: 10, bytes: 100 }),
    });
    floatingBar.mount(document.body);

    const barShadow = document.getElementById('novel-tts-floating-root')!.shadowRoot!;
    expect(barShadow.querySelector('#tts-sentence')).toBeNull();
    (barShadow.querySelector('#tts-reader-open') as HTMLButtonElement).click();
    expect(onOpenReader).toHaveBeenCalledTimes(1);
  });

  it('挂载于 documentElement 时彻底隔离底层页面与广告横幅（z-index 2147483646），并支持章尾重试加载与自定义重试提示', () => {
    const onRetryAppendNext = vi.fn();
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const origScrollYDesc = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', { value: 320, configurable: true });

    try {
      readerView = new ReaderView(makeConfig(), makeEvents({ onRetryAppendNext }));
      readerView.mount(document.documentElement);

      const ch1 = makeLoadedChapter(
        'https://example.com/1.html',
        '第1章',
        ['第一章正文长度超过三十个字用来验证阅读模式页面隔离和章尾重试功能。'],
        'https://example.com/2.html'
      );
      readerView.replaceChapter(ch1);

      const rootHost = document.getElementById('novel-tts-reader-root')!;
      expect(rootHost.style.getPropertyValue('z-index')).toBe('2147483646');

      readerView.open();
      expect(document.documentElement.classList.contains('novel-tts-reader-active')).toBe(true);
      const isoStyle = document.getElementById('novel-tts-reader-host-isolation');
      expect(isoStyle).not.toBeNull();
      expect(isoStyle!.textContent).toContain('html.novel-tts-reader-active');

      const shadow = rootHost.shadowRoot!;
      readerView.setAppendStatus('loading', '加载异常 (请求超时)，正在第 1/2 次自动重试…');
      expect(shadow.querySelector('#rv-tail-status')!.textContent).toContain('第 1/2 次自动重试');

      readerView.setAppendStatus('error', '同源 fetch 与 GM 通道均返回 HTTP 403');
      const retryBtn = shadow.querySelector('#rv-footer-retry') as HTMLButtonElement;
      expect(retryBtn.style.display).toBe('block');
      retryBtn.click();
      expect(onRetryAppendNext).toHaveBeenCalledTimes(1);

      readerView.close();
      expect(document.documentElement.classList.contains('novel-tts-reader-active')).toBe(false);
      expect(scrollToSpy).toHaveBeenCalledWith(0, 320);
    } finally {
      if (origScrollYDesc) {
        Object.defineProperty(window, 'scrollY', origScrollYDesc);
      } else {
        delete (window as any).scrollY;
      }
    }
  });
});
