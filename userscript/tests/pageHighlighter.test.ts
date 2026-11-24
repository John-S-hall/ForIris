import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PageHighlighter } from '../src/ui/pageHighlighter';

describe('pageHighlighter.ts - 原网页正文实时高亮标注器', () => {
  let highlighter: PageHighlighter;

  beforeEach(() => {
    document.body.innerHTML = '';
    highlighter = new PageHighlighter();
  });

  afterEach(() => {
    highlighter.destroy();
  });

  it('单节点高亮并可通过 clear() 无痕恢复原始 TextNode', () => {
    document.body.innerHTML = `<div id="content"><p id="p1">清晨的微风吹过山坡，少年缓缓睁开了双眼。</p></div>`;
    const container = document.getElementById('content')!;
    const p1 = document.getElementById('p1')!;
    highlighter.setContainer(container);

    const matched = highlighter.highlight('少年缓缓睁开了双眼。');
    expect(matched).toBe(true);

    const marks = p1.querySelectorAll('mark.novel-tts-active-mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('少年缓缓睁开了双眼。');
    expect(p1.textContent).toBe('清晨的微风吹过山坡，少年缓缓睁开了双眼。');

    // clear() 后完全移除 <mark> 并合并回单个 TextNode
    highlighter.clear();
    expect(p1.querySelectorAll('mark').length).toBe(0);
    expect(p1.childNodes.length).toBe(1);
    expect(p1.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
    expect(p1.textContent).toBe('清晨的微风吹过山坡，少年缓缓睁开了双眼。');
  });

  it('支持跨 <br> 与多标签碎片节点高亮', () => {
    document.body.innerHTML = `
      <div id="content">
        天穹之上惊雷炸响，<br/>
        大地开始<b>剧烈</b>颤抖！
      </div>
    `;
    const container = document.getElementById('content')!;
    highlighter.setContainer(container);

    const matched = highlighter.highlight('天穹之上惊雷炸响，大地开始剧烈颤抖！');
    expect(matched).toBe(true);

    const marks = container.querySelectorAll('mark.novel-tts-active-mark');
    expect(marks.length).toBe(4);
    const combinedText = Array.from(marks)
      .map((m) => m.textContent)
      .join('');
    expect(combinedText).toBe('天穹之上惊雷炸响，大地开始剧烈颤抖！');

    highlighter.clear();
    expect(container.querySelectorAll('mark').length).toBe(0);
  });

  it('重复短句按阅读顺序递增高亮后续出现的位置', () => {
    document.body.innerHTML = `
      <div id="content">
        <p id="first">他笑了。</p>
        <p>风雪停歇了很久，远方传来了脚步声。</p>
        <p id="second">他笑了。</p>
      </div>
    `;
    const container = document.getElementById('content')!;
    const firstP = document.getElementById('first')!;
    const secondP = document.getElementById('second')!;
    highlighter.setContainer(container);

    expect(highlighter.highlight('他笑了。')).toBe(true);
    expect(firstP.querySelector('mark')?.textContent).toBe('他笑了。');
    expect(secondP.querySelector('mark')).toBeNull();

    expect(highlighter.highlight('他笑了。')).toBe(true);
    expect(firstP.querySelector('mark')).toBeNull();
    expect(secondP.querySelector('mark')?.textContent).toBe('他笑了。');
  });

  it('跳过 script 与脚本自身 Shadow DOM 宿主节点', () => {
    document.body.innerHTML = `
      <div id="content">
        <script>只有脚本里才有的句子。</script>
        <novel-tts-reader-host>只有阅读宿主里才有的句子。</novel-tts-reader-host>
        <p>正文中的真实句子。</p>
      </div>
    `;
    highlighter.setContainer(document.getElementById('content')!);

    expect(highlighter.highlight('只有脚本里才有的句子。')).toBe(false);
    expect(highlighter.highlight('只有阅读宿主里才有的句子。')).toBe(false);
    expect(highlighter.highlight('正文中的真实句子。')).toBe(true);
  });
});
