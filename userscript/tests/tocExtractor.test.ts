import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractTocUrl, extractTocFromDocument } from '../src/core/tocExtractor';

describe('tocExtractor.ts - 小说目录链接探测与目录列表提取', () => {
  it('extractTocUrl：识别常见目录链接，过滤上一/下一章与评论区链接并优先底部栏', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <div class="top-nav">
            <a href="/book/1/index_top.html">目录</a>
            <a href="/book/1/prev.html">上一章</a>
          </div>
          <div id="comments">
            <a href="/comment/toc.html">目录</a>
          </div>
          <div class="bottom-nav">
            <a href="javascript:void(0);">目录</a>
            <a href="/book/1/list.html">章节目录</a>
            <a href="/book/1/2.html">下一章</a>
          </div>
        </body>
      </html>
    `;
    const url = 'https://novel.example.com/book/1/1.html';
    const dom = new JSDOM(html, { url });
    expect(extractTocUrl(dom.window.document, url)).toBe(
      'https://novel.example.com/book/1/list.html'
    );
  });

  it('extractTocFromDocument：自动跳过笔趣阁 <dl> 顶部“最新章节”重复区，并清洗功能链接', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>诡秘之主最新章节列表 - 笔趣阁</title></head>
        <body>
          <div id="info"><h1>诡秘之主</h1></div>
          <div id="list">
            <dl>
              <dt>《诡秘之主》最新章节</dt>
              <dd><a href="/book/1/999.html">第999章 愚者</a></dd>
              <dd><a href="/book/1/998.html">第998章 序列</a></dd>
              <dt>《诡秘之主》正文卷</dt>
              <dd><a href="/book/1/1.html">第一章 绯红</a></dd>
              <dd><a href="/book/1/2.html">第二章 占卜家</a></dd>
              <dd><a href="/book/1/3.html">第三章 小丑</a></dd>
              <dd><a href="/book/1/3.html">第三章 小丑（重复）</a></dd>
              <dd><a href="#">返回顶部</a></dd>
            </dl>
          </div>
        </body>
      </html>
    `;
    const tocUrl = 'https://biquge.example.com/book/1/';
    const dom = new JSDOM(html, { url: tocUrl });
    const data = extractTocFromDocument(dom.window.document, tocUrl);

    expect(data.bookTitle).toBe('诡秘之主');
    expect(data.items.map((i) => i.title)).toEqual([
      '第一章 绯红',
      '第二章 占卜家',
      '第三章 小丑',
    ]);
    expect(data.items.map((i) => i.url)).toEqual([
      'https://biquge.example.com/book/1/1.html',
      'https://biquge.example.com/book/1/2.html',
      'https://biquge.example.com/book/1/3.html',
    ]);
    expect(data.nextPageUrl).toBeNull();
  });

  it('extractTocFromDocument：识别分页目录下一页链接与 <select> 下拉分页', () => {
    const linkPageHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>凡人修仙传</title></head>
        <body>
          <ul class="chapter-list">
            <li><a href="/book/2/1.html">第1章 山边小村</a></li>
            <li><a href="/book/2/2.html">第2章 青牛镇</a></li>
            <li><a href="/book/2/3.html">第3章 七玄门</a></li>
          </ul>
          <div class="pager">
            <a href="/book/2/index_2.html">下一页</a>
          </div>
        </body>
      </html>
    `;
    const tocUrl1 = 'https://m.novel.example.com/book/2/index_1.html';
    const data1 = extractTocFromDocument(
      new JSDOM(linkPageHtml, { url: tocUrl1 }).window.document,
      tocUrl1
    );
    expect(data1.items.length).toBe(3);
    expect(data1.nextPageUrl).toBe('https://m.novel.example.com/book/2/index_2.html');

    const selectPageHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <ul class="chapters">
            <li><a href="/book/3/1.html">第1章 初临</a></li>
            <li><a href="/book/3/2.html">第2章 修炼</a></li>
            <li><a href="/book/3/3.html">第3章 试炼</a></li>
          </ul>
          <select>
            <option value="/book/3/p1.html" selected>第1页</option>
            <option value="/book/3/p2.html">第2页</option>
          </select>
        </body>
      </html>
    `;
    const tocUrl2 = 'https://m.novel.example.com/book/3/p1.html';
    const data2 = extractTocFromDocument(
      new JSDOM(selectPageHtml, { url: tocUrl2 }).window.document,
      tocUrl2
    );
    expect(data2.nextPageUrl).toBe('https://m.novel.example.com/book/3/p2.html');
  });
});
