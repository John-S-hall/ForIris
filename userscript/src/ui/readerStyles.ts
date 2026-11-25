export const READER_STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Segoe UI", Roboto, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }

  .reader-root {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--text);
    --reader-font-size: 18px;
    --reader-line-height: 1.85;
  }

  input, select, textarea {
    -webkit-user-select: text;
    user-select: text;
  }

  /* 4 套夸克风格主题 */
  .reader-root[data-theme="light"] {
    --bg: #f8fafc;
    --surface: #ffffff;
    --dock-bg: rgba(255, 255, 255, 0.96);
    --text: #1e293b;
    --muted: #64748b;
    --border: rgba(15, 23, 42, 0.1);
    --hl-bg: rgba(14, 165, 233, 0.2);
    --hl-text: #0f172a;
    --accent: #0284c7;
    --btn-bg: rgba(15, 23, 42, 0.06);
  }
  .reader-root[data-theme="sepia"] {
    --bg: #f4ecd8;
    --surface: #efe4c8;
    --dock-bg: rgba(246, 238, 218, 0.96);
    --text: #3d3122;
    --muted: #7c6950;
    --border: rgba(61, 49, 34, 0.12);
    --hl-bg: rgba(217, 119, 6, 0.22);
    --hl-text: #291f14;
    --accent: #b45309;
    --btn-bg: rgba(61, 49, 34, 0.08);
  }
  .reader-root[data-theme="green"] {
    --bg: #cce8cf;
    --surface: #d8efd9;
    --dock-bg: rgba(212, 238, 215, 0.96);
    --text: #1e3322;
    --muted: #4b6950;
    --border: rgba(30, 51, 34, 0.12);
    --hl-bg: rgba(16, 185, 129, 0.26);
    --hl-text: #0f2414;
    --accent: #059669;
    --btn-bg: rgba(30, 51, 34, 0.08);
  }
  .reader-root[data-theme="dark"] {
    --bg: #12151c;
    --surface: #1a1f29;
    --dock-bg: rgba(20, 25, 36, 0.96);
    --text: #cbd5e1;
    --muted: #64748b;
    --border: rgba(255, 255, 255, 0.1);
    --hl-bg: rgba(56, 189, 248, 0.22);
    --hl-text: #f8fafc;
    --accent: #38bdf8;
    --btn-bg: rgba(255, 255, 255, 0.08);
  }

  /* 顶部常驻极简微状态栏 */
  .status-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: calc(30px + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) 18px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
    color: var(--muted);
    background: var(--bg);
    z-index: 2;
    pointer-events: none;
    box-sizing: border-box;
  }
  .status-title {
    min-width: 0;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status-progress {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  /* 竖向滚动正文区 */
  .reader-scroll {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  .reader-article {
    max-width: 720px;
    margin: 0 auto;
    padding: calc(44px + env(safe-area-inset-top, 0px)) 20px calc(110px + env(safe-area-inset-bottom, 0px));
    box-sizing: border-box;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }

  .top-prev-wrap {
    margin-bottom: 18px;
    text-align: center;
  }
  .top-prev-btn {
    padding: 6px 16px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--btn-bg);
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
  }
  .top-prev-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .reader-chapter + .reader-chapter {
    margin-top: 42px;
    padding-top: 32px;
    border-top: 1px dashed var(--border);
  }
  .reader-chapter-title {
    font-size: calc(var(--reader-font-size) + 4px);
    line-height: 1.4;
    font-weight: 700;
    margin: 0 0 22px;
    color: var(--hl-text);
  }
  .reader-p {
    margin: 0 0 0.85em;
    font-size: var(--reader-font-size);
    line-height: var(--reader-line-height);
    text-indent: 2em;
    word-break: break-word;
  }
  .reader-sentence {
    border-radius: 3px;
    transition: background-color 0.2s, color 0.2s;
  }
  .reader-sentence.active {
    background: var(--hl-bg);
    color: var(--hl-text);
    box-shadow: 0 0 0 2px var(--hl-bg);
  }

  /* 章节底部状态条与翻页按钮 */
  .reader-tail-bar {
    margin-top: 28px;
    padding-top: 18px;
    border-top: 1px solid var(--border);
    text-align: center;
  }
  .tail-status-text {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 12px;
  }
  .reader-footer-nav {
    display: flex;
    gap: 12px;
  }
  .footer-nav-btn {
    flex: 1;
    height: 44px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--btn-bg);
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .footer-nav-btn.primary {
    border-color: var(--accent);
    color: var(--accent);
  }
  .footer-nav-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  /* 回到朗读处浮动胶囊 */
  .relocate-btn {
    position: fixed;
    right: 16px;
    bottom: calc(74px + env(safe-area-inset-bottom, 0px));
    padding: 7px 12px;
    border-radius: 18px;
    border: 1px solid var(--accent);
    background: var(--dock-bg);
    color: var(--accent);
    font-size: 12px;
    font-weight: 500;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px);
    transition: opacity 0.2s, transform 0.2s;
    z-index: 4;
  }
  .relocate-btn.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  /* 迷你底部听书栏 */
  .mini-tts-bar {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    height: 48px;
    padding: 0 12px;
    border-radius: 24px;
    background: var(--dock-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    z-index: 4;
    box-sizing: border-box;
  }
  .mini-tts-bar.visible {
    display: flex;
  }
  .mini-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mini-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    background: var(--btn-bg);
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .mini-btn.primary {
    background: var(--accent);
    color: #ffffff;
  }
  .mini-btn svg {
    fill: currentColor;
  }
  .mini-progress {
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  /* 仿夸克滑出顶栏 */
  .top-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px;
    background: var(--dock-bg);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    transform: translateY(-105%);
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 6;
    box-sizing: border-box;
  }
  .top-bar.open {
    transform: translateY(0);
  }
  .top-title {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar-text-btn {
    border: none;
    background: none;
    color: var(--text);
    font-size: 13px;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .bar-text-btn.accent {
    color: var(--accent);
    background: var(--btn-bg);
    font-size: 12px;
  }

  /* 仿夸克滑出底栏 */
  .bottom-dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
    background: var(--dock-bg);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-top: 1px solid var(--border);
    box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.18);
    transform: translateY(105%);
    transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 6;
    box-sizing: border-box;
  }
  .bottom-dock.open {
    transform: translateY(0);
  }

  .subpanel {
    display: none;
    padding-bottom: 12px;
    margin-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  .subpanel.open {
    display: block;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }
  .setting-row:last-child {
    margin-bottom: 0;
  }
  .setting-label {
    font-size: 12px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .btn-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .pill-btn {
    border: 1px solid var(--border);
    background: var(--btn-bg);
    color: var(--text);
    font-size: 12px;
    padding: 5px 11px;
    border-radius: 14px;
    cursor: pointer;
  }
  .pill-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .font-val {
    font-size: 13px;
    min-width: 40px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .theme-swatch {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--btn-bg);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
  }
  .theme-swatch.active {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .swatch-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(128, 128, 128, 0.35);
  }
  .switch-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
  }

  /* 听书与 Worker 配置子面板 */
  .tts-info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .tts-controls-row {
    display: flex;
    align-items: center;
    justify-content: space-around;
    margin-bottom: 10px;
  }
  .tts-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: var(--btn-bg);
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .tts-btn.primary {
    width: 50px;
    height: 50px;
    background: var(--accent);
    color: #ffffff;
  }
  .tts-btn svg {
    fill: currentColor;
  }
  .tts-params-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .voice-select {
    background: var(--btn-bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 12px;
    padding: 5px 8px;
    border-radius: 8px;
    outline: none;
    max-width: 135px;
  }
  .voice-select option {
    background: var(--surface);
    color: var(--text);
  }
  .field {
    margin-bottom: 8px;
  }
  .field label {
    display: block;
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .field input {
    width: 100%;
    box-sizing: border-box;
    background: var(--btn-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--text);
    font-size: 12px;
    outline: none;
  }
  .worker-btn-row {
    display: flex;
    gap: 8px;
  }
  .save-btn {
    flex: 1;
    background: var(--accent);
    color: #ffffff;
    border: none;
    padding: 7px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .test-btn {
    flex: 1;
    background: var(--btn-bg);
    color: var(--accent);
    border: 1px solid var(--accent);
    padding: 7px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .test-result {
    display: none;
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  .test-result.success {
    display: block;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.35);
    color: #16a34a;
  }
  .test-result.error {
    display: block;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #dc2626;
  }

  /* 布局 2：仿夸克 4 键主操作栏 */
  .dock-actions {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .dock-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 7px 4px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
  }
  .dock-btn.active,
  .dock-btn.is-playing {
    color: var(--accent);
    font-weight: 600;
  }
  .dock-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  /* 左侧目录抽屉 */
  .toc-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.22s;
    z-index: 8;
  }
  .toc-backdrop.open {
    opacity: 1;
    pointer-events: auto;
  }
  .toc-drawer {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(82vw, 340px);
    background: var(--dock-bg);
    color: var(--text);
    border-right: 1px solid var(--border);
    box-shadow: 6px 0 28px rgba(0, 0, 0, 0.28);
    display: flex;
    flex-direction: column;
    transform: translateX(-105%);
    transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 9;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    box-sizing: border-box;
  }
  .toc-drawer.open {
    transform: translateX(0);
  }
  .toc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 14px 8px;
    border-bottom: 1px solid var(--border);
  }
  .toc-book-title {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }
  .toc-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
  }
  .toc-search {
    flex: 1;
    min-width: 0;
    background: var(--btn-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 10px;
    color: var(--text);
    font-size: 12px;
    outline: none;
  }
  .toc-list {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 4px 0;
  }
  .toc-item {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    color: var(--text);
    font-size: 13px;
    line-height: 1.45;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    box-sizing: border-box;
  }
  .toc-item:active {
    background: var(--btn-bg);
  }
  .toc-item.active {
    color: var(--accent);
    font-weight: 600;
    background: var(--hl-bg);
  }
  .toc-empty {
    padding: 18px 16px;
    font-size: 12px;
    color: var(--muted);
    text-align: center;
    line-height: 1.6;
  }
  .toc-section-label {
    padding: 8px 16px 4px;
    font-size: 11px;
    color: var(--muted);
    background: var(--btn-bg);
  }
  .toc-load-more {
    display: block;
    width: calc(100% - 32px);
    margin: 10px 16px;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: var(--btn-bg);
    color: var(--accent);
    font-size: 12px;
    cursor: pointer;
  }
  .toc-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 14px;
    border-top: 1px solid var(--border);
  }
`;
