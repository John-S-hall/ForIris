import { defineConfig } from 'vitest/config';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'NovelTTS-Userscript',
        namespace: 'https://github.com/John-S-hall/ForIris',
        version: '0.3.0',
        author: 'John-S-hall',
        description: '移动端网页小说听书油猴脚本',
        match: ['*://*/*'],
        grant: [
          'GM_xmlhttpRequest',
          'GM_getValue',
          'GM_setValue',
          'GM_registerMenuCommand',
        ],
        connect: ['*'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
