import { describe, it, expect } from 'vitest';
import { chunkText, chunkParagraphs } from '../src/core/chunker';

describe('chunker.ts - 标点切分与句子合并引擎', () => {
  it('应当正常按常见标点（。！？；）切分句子', () => {
    const text = '天色渐暗，风雨欲来。远处隐约传来了雷鸣之声！难道这就是天劫将至的征兆吗？没有人知道答案；大家只能默默等待。';
    const chunks = chunkText(text, { minChars: 15, maxChars: 50 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(50);
    });
    expect(chunks.join('')).toBe(text);
  });

  it('短句合并：连续碎片对话应当自动合并至 minChars 以上且保留引号完整', () => {
    const paragraphs = [
      '“谁？”',
      '“是我。”',
      '“你来做什么？”',
      '“给你送药。”',
      '屋内的少年闻言松了一口气，伸手轻轻拉开了房门。',
    ];
    // 单个碎片短句都在 3~8 字左右，minChars 设置为 30 时应被合并为完整长句
    const chunks = chunkText(paragraphs, { minChars: 30, maxChars: 120 });

    expect(chunks.length).toBeLessThan(paragraphs.length);
    // 第一句应当包含前面的连续对话，且闭合引号不丢失
    expect(chunks[0]).toContain('“谁？”');
    expect(chunks[0]).toContain('“是我。”');
    expect(chunks[0].length).toBeGreaterThanOrEqual(20);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(120);
    });
  });

  it('超长无标点段落强切：超过 120 字的无标点文本应被强制切分成多段', () => {
    // 构造一段 260 字的连续无标点中文
    const longNoPunctuation = '长'.repeat(260);
    const chunks = chunkText(longNoPunctuation, { minChars: 30, maxChars: 120 });

    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(120);
    expect(chunks[1].length).toBe(120);
    expect(chunks[2].length).toBe(20);
    expect(chunks.join('')).toBe(longNoPunctuation);
  });

  it('包含次级标点（逗号）的超长句应优先在次级标点处优雅切分', () => {
    // 构造一段超过 120 字、包含逗号的长句（总长约 150 字）
    const partA = '这是一段关于古代修真界极其神秘的未知遗迹探索的详细记录内容，记录了某年某月探险队伍在天断山脉深处经历的极其离奇且惊心动魄的遭遇';
    const partB = '随后他们在地下密室的石壁上发现了神秘的古老符文，符文散发着淡淡的金光，似乎与传说中的太古大帝终极传承有着不可分割的深邃联系';
    const partC = '所有人顿时屏住呼吸不敢发出丝毫声响。';
    const fullSentence = `${partA}，${partB}，${partC}`;

    expect(fullSentence.length).toBeGreaterThan(120);

    const chunks = chunkText(fullSentence, { minChars: 30, maxChars: 120 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(120);
    });
    expect(chunks.join('')).toBe(fullSentence);
  });

  it('边界测试：空输入、纯空白、纯标点符号', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\t  ')).toEqual([]);
    expect(chunkText([])).toEqual([]);
    expect(chunkText('！！！？？？。。。。')).toEqual([]);
    expect(chunkText(['   ', '，，，', '。'])).toEqual([]);
  });

  it('chunkParagraphs：输出文本与 chunkText 严格一致，并精准保留跨段合并与长段切分的段落索引', () => {
    const paragraphs = [
      '“谁？”',
      '“是我。”',
      '屋内的少年闻言松了一口气，伸手轻轻拉开了木门。',
      '这是一段超过一百二十字的极长单段落描写内容。他站在山巅之上迎风远眺，只见群山连绵起伏宛如沧海波涛般望不到尽头，漫天晚霞染红了半边苍穹。风吹衣袂猎猎作响，远方天际隐隐约约浮现出一道金色虹光直冲云霄！',
    ];
    const structured = chunkParagraphs(paragraphs, { minChars: 30, maxChars: 120 });
    const plain = chunkText(paragraphs, { minChars: 30, maxChars: 120 });

    expect(structured.map((c) => c.text)).toEqual(plain);
    expect(structured[0].index).toBe(0);
    // 第 0 句跨段合并了 0, 1, 2 三段
    expect(structured[0].segments.map((s) => s.paragraphIndex)).toEqual([0, 1, 2]);
    // 第 4 段自身被切分为多个句片段，每个都指向 paragraphIndex === 3
    const lastSegParagraphs = structured[structured.length - 1].segments.map(
      (s) => s.paragraphIndex
    );
    expect(lastSegParagraphs.every((idx) => idx === 3)).toBe(true);
  });
});
