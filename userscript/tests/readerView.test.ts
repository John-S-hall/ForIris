import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_CONFIG, type AppConfig } from '../src/core/storage';
import { chunkParagraphs } from '../src/core/chunker';
import { ReaderView } from '../src/ui/readerView';
import { FloatingBar } from '../src/ui/floatingBar';

describe('readerView.ts & floatingBar.ts - 阅读模式与精简悬浮球', () => {
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

  it('open/close 正确接管 Shadow DOM 展示并锁定/恢复页面 overflow', () => {
    const events = {
      onClose: vi.fn(),
      onPlayToggle: vi.fn(),
      onStop: vi.fn(),
      onPrevSentence: vi.fn(),
      onNextSentence: vi.fn(),
      onSeekSentence: vi.fn(),
      onPrevChapter: vi.fn(),
      onNextChapter: vi.fn(),
      onRateChange: vi.fn(),
      onVoiceChange: vi.fn(),
      onSaveConfig: vi.fn(),
      onTestConfig: vi.fn().mockResolvedValue({ success: true, source: 'fetch', duration: 10, bytes: 100 }),
      onJumpChapterUrl: vi.fn(),
      onSettingsChange: vi.fn(),
    };

    readerView = new ReaderView(makeConfig(), events);
    const host = document.createElement('div');
    document.body.appendChild(host);
    readerView.mount(host);

    const rootHost = document.getElementById('novel-tts-reader-root')!;
    expect(rootHost.style.display).toBe('none');

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

  it('renderChapter 安全渲染句级 span，且 setActiveChunk 支持跨段合并句同步高亮', () => {
    readerView = new ReaderView(makeConfig(), {
      onClose: vi.fn(),
      onPlayToggle: vi.fn(),
      onStop: vi.fn(),
      onPrevSentence: vi.fn(),
      onNextSentence: vi.fn(),
      onSeekSentence: vi.fn(),
      onPrevChapter: vi.fn(),
      onNextChapter: vi.fn(),
      onRateChange: vi.fn(),
      onVoiceChange: vi.fn(),
      onSaveConfig: vi.fn(),
      onTestConfig: vi.fn().mockResolvedValue({ success: true, source: 'fetch', duration: 10, bytes: 100 }),
      onJumpChapterUrl: vi.fn(),
      onSettingsChange: vi.fn(),
    });
    readerView.mount(document.body);

    const paragraphs = [
      '“谁？”',
      '“是我。”<script>window.__xss=true</script>',
      '清晨的薄雾在古林间悄然消散，远处传来一阵沉稳有力的脚步声与鸟鸣声。',
    ];
    const chunks = chunkParagraphs(paragraphs, { minChars: 30, maxChars: 120 });
    expect(chunks.length).toBe(2);

    readerView.renderChapter({
      title: '第5章 雾林',
      paragraphs,
      nextChapterUrl: 'https://example.com/ch6',
      prevChapterUrl: null,
    }, chunks);

    const shadow = document.getElementById('novel-tts-reader-root')!.shadowRoot!;
    expect((window as any).__xss).toBeUndefined();
    expect(shadow.querySelectorAll('.reader-p').length).toBe(3);

    // 边界按钮状态：无上一章禁用，有下一章可用
    expect((shadow.querySelector('#rv-footer-prev') as HTMLButtonElement).disabled).toBe(true);
    expect((shadow.querySelector('#rv-footer-next') as HTMLButtonElement).disabled).toBe(false);

    // 第 0 句跨越了段 0 和段 1，setActiveChunk(0) 应同时高亮两个 span
    readerView.setActiveChunk(0);
    const active0 = shadow.querySelectorAll('.reader-sentence.active');
    expect(active0.length).toBe(2);
    expect(active0[0].getAttribute('data-chunk-index')).toBe('0');

    // 切换到第 1 句
    readerView.setActiveChunk(1);
    const active1 = shadow.querySelectorAll('.reader-sentence.active');
    expect(active1.length).toBe(1);
    expect(active1[0].getAttribute('data-chunk-index')).toBe('1');

    // 停止清除高亮
    readerView.setActiveChunk(-1);
    expect(shadow.querySelectorAll('.reader-sentence.active').length).toBe(0);
  });

  it('双击正文句子同步触发 onSeekSentence，单击延时展开菜单与再次单击关闭', () => {
    vi.useFakeTimers();
    const onSeekSentence = vi.fn();

    readerView = new ReaderView(makeConfig(), {
      onClose: vi.fn(),
      onPlayToggle: vi.fn(),
      onStop: vi.fn(),
      onPrevSentence: vi.fn(),
      onNextSentence: vi.fn(),
      onSeekSentence,
      onPrevChapter: vi.fn(),
      onNextChapter: vi.fn(),
      onRateChange: vi.fn(),
      onVoiceChange: vi.fn(),
      onSaveConfig: vi.fn(),
      onTestConfig: vi.fn().mockResolvedValue({ success: true, source: 'fetch', duration: 10, bytes: 100 }),
      onJumpChapterUrl: vi.fn(),
      onSettingsChange: vi.fn(),
    });
    readerView.mount(document.body);
    readerView.open();

    const paragraphs = [
      '第一句正文长度足够三十个字以避免与下一句话合并成同一个长句子区块。',
      '第二句正文长度同样足够三十个字用于验证双击指定句子的同步定位起播功能。',
    ];
    readerView.renderChapter(
      { title: '测试', paragraphs, nextChapterUrl: null, prevChapterUrl: null },
      chunkParagraphs(paragraphs)
    );

    const shadow = document.getElementById('novel-tts-reader-root')!.shadowRoot!;
    const secondSentence = shadow.querySelector('.reader-sentence[data-chunk-index="1"]') as HTMLElement;
    const topBar = shadow.querySelector('#rv-top-bar')!;

    // 连续两次点击同一句 -> 立即触发 onSeekSentence(1)，且菜单保持关闭
    secondSentence.click();
    secondSentence.click();
    expect(onSeekSentence).toHaveBeenCalledTimes(1);
    expect(onSeekSentence).toHaveBeenCalledWith(1);

    vi.advanceTimersByTime(300);
    expect(topBar.classList.contains('open')).toBe(false);

    // 单击同一句并等待 > 240ms -> 展开仿夸克菜单
    secondSentence.click();
    vi.advanceTimersByTime(260);
    expect(topBar.classList.contains('open')).toBe(true);

    // 菜单打开后单击正文立刻关闭菜单
    secondSentence.click();
    expect(topBar.classList.contains('open')).toBe(false);
  });

  it('主题、字号、行距与自动进入开关交互正确更新 CSS 变量并触发回调', () => {
    const onSettingsChange = vi.fn();
    readerView = new ReaderView(makeConfig(), {
      onClose: vi.fn(),
      onPlayToggle: vi.fn(),
      onStop: vi.fn(),
      onPrevSentence: vi.fn(),
      onNextSentence: vi.fn(),
      onSeekSentence: vi.fn(),
      onPrevChapter: vi.fn(),
      onNextChapter: vi.fn(),
      onRateChange: vi.fn(),
      onVoiceChange: vi.fn(),
      onSaveConfig: vi.fn(),
      onTestConfig: vi.fn().mockResolvedValue({ success: true, source: 'fetch', duration: 10, bytes: 100 }),
      onJumpChapterUrl: vi.fn(),
      onSettingsChange,
    });
    readerView.mount(document.body);
    readerView.open();

    const shadow = document.getElementById('novel-tts-reader-root')!.shadowRoot!;
    const rootEl = shadow.querySelector('.reader-root') as HTMLElement;

    (shadow.querySelector('[data-theme-opt="dark"]') as HTMLElement).click();
    expect(rootEl.getAttribute('data-theme')).toBe('dark');
    expect(onSettingsChange).toHaveBeenCalledWith({ theme: 'dark' });

    (shadow.querySelector('#rv-font-inc') as HTMLElement).click();
    expect(rootEl.style.getPropertyValue('--reader-font-size')).toBe('20px');
    expect(onSettingsChange).toHaveBeenCalledWith({ fontSize: 20 });

    (shadow.querySelector('[data-line-height="2.1"]') as HTMLElement).click();
    expect(rootEl.style.getPropertyValue('--reader-line-height')).toBe('2.1');
    expect(onSettingsChange).toHaveBeenCalledWith({ lineHeight: 2.1 });

    // 迷你条：播放态且菜单收起时显示，停止后隐藏
    const miniBar = shadow.querySelector('#rv-mini-bar')!;
    readerView.updatePlayerState('playing');
    expect(miniBar.classList.contains('visible')).toBe(true);
    readerView.updatePlayerState('idle');
    expect(miniBar.classList.contains('visible')).toBe(false);
  });

  it('FloatingBar 已移除句文字预览框，包含阅读模式入口并支持 setSuppressed', () => {
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
      onTestConfig: vi.fn().mockResolvedValue({ success: true, source: 'fetch', duration: 10, bytes: 100 }),
    });
    floatingBar.mount(document.body);

    const shadow = document.getElementById('novel-tts-floating-root')!.shadowRoot!;
    expect(shadow.querySelector('#tts-sentence')).toBeNull();
    expect(shadow.querySelector('.sentence-preview')).toBeNull();

    const readerBtn = shadow.querySelector('#tts-reader-open') as HTMLButtonElement;
    expect(readerBtn).not.toBeNull();
    readerBtn.click();
    expect(onOpenReader).toHaveBeenCalledTimes(1);

    const ball = shadow.querySelector('#tts-ball') as HTMLElement;
    floatingBar.setSuppressed(true);
    expect(ball.style.display).toBe('none');
    floatingBar.setSuppressed(false);
    expect(ball.style.display).toBe('flex');
  });
});
