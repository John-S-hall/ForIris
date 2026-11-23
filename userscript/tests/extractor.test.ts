import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractChapterContent, extractNextChapterUrl, cleanLine } from '../src/core/extractor';

describe('extractor.ts - 正文与下一章链接提取引擎', () => {
  it('应当清洗字符串中的不可见字符与冗余空白', () => {
    const raw = '\u200B\uFEFF  第一章\u3000\u00A0 觉醒之日 \t ';
    expect(cleanLine(raw)).toBe('第一章 觉醒之日');
  });

  it('样本 1：标准文章结构页面（Readability 正常提取正文与标题）', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>第一章 初始之地 - 极道天魔</title>
        </head>
        <body>
          <article>
            <h1>第一章 初始之地</h1>
            <p>清晨的微风吹拂过山岗，带来了丝丝凉意。路胜缓缓睁开双眼，只觉得脑海中一阵剧烈的刺痛传来。</p>
            <p>这里究竟是哪里？他依稀记得自己刚刚还在通宵赶项目，怎么一眨眼就来到了这处荒郊野岭。</p>
            <p>周围全是茂密高耸的古树，阳光透过层层叠叠的枝叶缝隙洒落下来，在长满青苔的泥地上斑驳摇曳。</p>
            <p>他挣扎着从地上爬起来，拍了拍身上的泥土，胸口挂着的那枚黑色玉佩此时正隐隐散发着温热的气息。</p>
          </article>
          <div class="page-nav">
            <a href="/book/101/chapter_2.html">下一章</a>
          </div>
        </body>
      </html>
    `;
    const dom = new JSDOM(html, { url: 'https://novel.example.com/book/101/chapter_1.html' });
    const content = extractChapterContent(dom.window.document, 'https://novel.example.com/book/101/chapter_1.html');

    expect(content.title).toBe('第一章 初始之地');
    expect(content.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(content.paragraphs.some((p) => p.includes('清晨的微风'))).toBe(true);
    expect(content.nextChapterUrl).toBe('https://novel.example.com/book/101/chapter_2.html');
  });

  it('样本 2：典型笔趣阁类网页（Readability 字数不足，触发 #chaptercontent 兜底提取）', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>第233章 天地异变 - 笔趣阁</title>
        </head>
        <body>
          <div class="header">小说网顶部导航</div>
          <div class="read-box">
            <h1>第233章 天地异变</h1>
            <div id="chaptercontent">
              天穹之上，滚滚惊雷如狂蟒般肆虐撕裂苍穹。<br/><br/>
              整片大地开始剧烈颤抖，一道道深不见底的裂缝以肉眼可见的速度蔓延开来。<br/>
              “这究竟是怎么回事？！”无数修士面露惊恐地望向虚空。<br/>
              传闻万年前被封印的远古凶兽，似乎正在苏醒。<br/>
              狂暴的灵气狂潮席卷四方，将沿途的参天巨木连根拔起，化作齑粉。<br/>
              林凡紧握手中的残剑，眼眸中闪烁着凌厉的精光，沉声道：“终于要来了吗。”
            </div>
          </div>
          <div class="bottom-nav">
            <a href="chapter_232.html">上一章</a>
            <a href="/index.html">目录</a>
            <a href="chapter_234.html">下一页</a>
          </div>
        </body>
      </html>
    `;
    const dom = new JSDOM(html, { url: 'https://m.biquge.example/read/123/chapter_233.html' });
    const content = extractChapterContent(dom.window.document, 'https://m.biquge.example/read/123/chapter_233.html');

    expect(content.title).toBe('第233章 天地异变');
    expect(content.paragraphs.length).toBeGreaterThanOrEqual(4);
    expect(content.paragraphs[0]).toContain('天穹之上');
    expect(content.nextChapterUrl).toBe('https://m.biquge.example/read/123/chapter_234.html');
  });

  it('样本 3：异常页面（无正文/纯登录页面）', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>用户登录</title>
        </head>
        <body>
          <div class="login-panel">
            <h2>请先登录</h2>
            <form>
              <input type="text" name="username" placeholder="用户名" />
              <input type="password" name="password" placeholder="密码" />
              <button type="submit">登录</button>
            </form>
          </div>
        </body>
      </html>
    `;
    const dom = new JSDOM(html, { url: 'https://novel.example.com/login' });
    const content = extractChapterContent(dom.window.document, 'https://novel.example.com/login');

    expect(content.paragraphs.length).toBe(0);
    expect(content.nextChapterUrl).toBeNull();
  });

  it('文本密度兜底：无 article/section 时选中内层纯正文 div 而非外层包含导航的大 wrapper', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>第十章 密林</title></head>
        <body>
          <div class="page-wrapper">
            <div class="top-links">
              <a href="/1">玄幻</a><a href="/2">都市</a><a href="/3">历史</a><a href="/4">排行</a>
              <a href="/5">完本</a><a href="/6">书架</a><a href="/7">推荐</a><a href="/8">首页</a>
            </div>
            <div class="novel-body-inner">
              风声在幽暗的林间穿梭，树影摇曳不定，仿佛暗夜中潜伏着无数双窥探的眼睛。<br/>
              李昂停下脚步，屏住呼吸仔细聆听四周传来的细微动静，不敢有丝毫大意。
            </div>
          </div>
        </body>
      </html>
    `;
    const dom = new JSDOM(html, { url: 'https://example.com/10.html' });
    const content = extractChapterContent(dom.window.document, 'https://example.com/10.html');

    expect(content.paragraphs.some((p) => p.includes('风声在幽暗的林间穿梭'))).toBe(true);
    expect(content.paragraphs.some((p) => p.includes('玄幻'))).toBe(false);
  });

  it('下一章链接识别：支持带空格的 "下 一 章"，且页底评论区 "下一页" 不覆盖正文 "下一章"', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <div id="content">正文内容测试正文内容测试正文内容测试正文内容测试正文内容测试</div>
          <div class="chapter-nav">
            <a href="/book/2.html">下 一 章</a>
          </div>
          <div id="comments">
            <a href="/book/1?commentPage=2">下一页</a>
          </div>
          <div class="footer-links">
            <a href="/other?page=2">下一页</a>
          </div>
        </body>
      </html>
    `;
    const dom = new JSDOM(html, { url: 'https://example.com/book/1.html' });
    const nextUrl = extractNextChapterUrl(dom.window.document, 'https://example.com/book/1.html');

    expect(nextUrl).toBe('https://example.com/book/2.html');
  });

  it('下一章链接防御：忽略指向当前 URL 的自环链接', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <div id="content">正文内容测试正文内容测试正文内容测试正文内容测试正文内容测试</div>
          <a href="/chapter_1.html">下一章</a>
        </body>
      </html>
    `;
    const dom = new JSDOM(html, { url: 'https://example.com/chapter_1.html' });
    const nextUrl = extractNextChapterUrl(dom.window.document, 'https://example.com/chapter_1.html');

    expect(nextUrl).toBeNull();
  });

  it('下一章链接防御：过滤 javascript 伪协议和锚点链接并继续匹配后续合法链接', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <div id="content">正文内容测试正文内容测试正文内容测试正文内容测试正文内容测试</div>
          <a href="javascript:void(0);">下一章</a>
          <a href="#">下页</a>
          <a href="/chapter_2.html">下一章</a>
        </body>
      </html>
    `;
    const dom = new JSDOM(html, { url: 'https://example.com/chapter_1.html' });
    const nextUrl = extractNextChapterUrl(dom.window.document, 'https://example.com/chapter_1.html');

    expect(nextUrl).toBe('https://example.com/chapter_2.html');
  });
});
