import type { AppConfig, BallPosition } from '../core/storage';
import type { PlayerState } from '../core/tts/types';
import type { ConnectionTestResult } from '../core/tts/edgeWorker';
import {
  SVG_PAUSE_PATH,
  SVG_PLAY_PATH,
  buildVoiceOptionsHtml,
  executeConnectionTest,
  getNextRate,
} from './sharedControls';

export interface FloatingBarEvents {
  onPlayToggle: () => void;
  onNextSentence: () => void;
  onPrevSentence: () => void;
  onNextChapter: () => void;
  onOpenReader: () => void;
  onRateChange: (rate: number) => void;
  onVoiceChange: (voice: string) => void;
  onSaveConfig: (workerUrl: string, token: string) => void;
  onTestConfig: (workerUrl: string, token: string) => Promise<ConnectionTestResult>;
  onJumpChapterUrl?: (url: string) => void;
  onBallPositionChange?: (pos: BallPosition) => void;
}

export class FloatingBar {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private events: FloatingBarEvents;

  // 状态引用
  private isSettingsOpen = false;
  private isSuppressed = false;
  private playerState: PlayerState = 'idle';
  private currentChapterUrl: string | null = null;
  private currentRate = 1.0;
  private ballPosition: BallPosition | null = null;

  // DOM 元素引用
  private ballEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private playBtn!: HTMLElement;
  private titleEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private rateBtn!: HTMLElement;
  private voiceSelect!: HTMLSelectElement;
  private toastEl!: HTMLElement;
  private settingsDrawer!: HTMLElement;
  private workerInput!: HTMLInputElement;
  private tokenInput!: HTMLInputElement;
  private testBtn!: HTMLButtonElement;
  private testResultEl!: HTMLElement;
  private jumpChapterBtn!: HTMLElement;

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // 需清理的全局监听器引用
  private onWindowTouchMove: ((e: TouchEvent) => void) | null = null;
  private onWindowTouchEnd: (() => void) | null = null;
  private onWindowMouseMove: ((e: MouseEvent) => void) | null = null;
  private onWindowMouseUp: (() => void) | null = null;
  private onWindowResize: (() => void) | null = null;

  constructor(config: AppConfig, events: FloatingBarEvents) {
    this.events = events;
    this.currentRate = config.rate;
    this.ballPosition = config.ballPosition ?? null;

    this.host = document.createElement('novel-tts-host');
    this.host.id = 'novel-tts-floating-root';
    this.applyHostStyles();
    this.shadow = this.host.attachShadow({ mode: 'open' });

    this.render(config);
    this.applyBallPosition();
    this.bindEvents();
    this.bindDragEvents();
  }

  private applyHostStyles(): void {
    this.host.style.setProperty('position', 'fixed', 'important');
    this.host.style.setProperty('inset', '0', 'important');
    this.host.style.setProperty('z-index', '2147483647', 'important');
    this.host.style.setProperty('pointer-events', 'none', 'important');
    this.host.style.setProperty('display', 'block', 'important');
    this.host.style.setProperty('margin', '0', 'important');
    this.host.style.setProperty('padding', '0', 'important');
    this.host.style.setProperty('border', '0', 'important');
    this.host.style.setProperty('background', 'transparent', 'important');
  }

  mount(parent?: HTMLElement): void {
    const target = parent || document.documentElement || document.body;
    if (target && !target.contains(this.host)) {
      target.appendChild(this.host);
    }
  }

  unmount(): void {
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.onWindowTouchMove) {
      window.removeEventListener('touchmove', this.onWindowTouchMove);
      this.onWindowTouchMove = null;
    }
    if (this.onWindowTouchEnd) {
      window.removeEventListener('touchend', this.onWindowTouchEnd);
      this.onWindowTouchEnd = null;
    }
    if (this.onWindowMouseMove) {
      window.removeEventListener('mousemove', this.onWindowMouseMove);
      this.onWindowMouseMove = null;
    }
    if (this.onWindowMouseUp) {
      window.removeEventListener('mouseup', this.onWindowMouseUp);
      this.onWindowMouseUp = null;
    }
    if (this.onWindowResize) {
      window.removeEventListener('resize', this.onWindowResize);
      this.onWindowResize = null;
    }
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
  }

  toggleVisible(): void {
    if (this.host.style.display === 'none') {
      this.host.style.setProperty('display', 'block', 'important');
    } else {
      this.host.style.setProperty('display', 'none', 'important');
    }
  }

  /** 阅读模式开启时抑制悬浮球与底栏面板，仅保留 Toast 提示 */
  setSuppressed(suppressed: boolean): void {
    this.isSuppressed = suppressed;
    if (suppressed) {
      this.panelEl.classList.remove('open');
      this.ballEl.style.display = 'none';
      this.panelEl.style.display = 'none';
    } else {
      this.panelEl.style.display = '';
      this.ballEl.style.display = 'flex';
    }
  }

  // ─── 状态更新接口 ──────────────────────────────────────────────────────

  updatePlayerState(state: PlayerState): void {
    this.playerState = state;
    this.updatePlayButton();
    this.updateBallAnimation();
  }

  updateProgress(index: number, total: number, _sentence?: string): void {
    this.progressEl.textContent = `${index + 1} / ${total}`;
  }

  syncRate(rate: number): void {
    this.currentRate = rate;
    this.rateBtn.textContent = `${rate.toFixed(1)}x`;
  }

  syncVoice(voice: string): void {
    this.voiceSelect.value = voice;
  }

  updateChapter(title: string, currentUrl?: string): void {
    this.titleEl.textContent = title;
    if (currentUrl) {
      this.currentChapterUrl = currentUrl;
      this.jumpChapterBtn.style.display = 'inline-block';
    } else {
      this.jumpChapterBtn.style.display = 'none';
    }
  }

  syncConfigInputs(workerUrl: string, token: string): void {
    this.workerInput.value = workerUrl;
    this.tokenInput.value = token;
  }

  showToast(message: string, duration = 3000): void {
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
    }
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('visible');
      this.toastTimer = null;
    }, duration);
  }

  // ─── DOM 渲染 ─────────────────────────────────────────────────────────

  private render(config: AppConfig): void {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        color: #f1f5f9;
        -webkit-tap-highlight-color: transparent;
      }

      /* 悬浮小球 (折叠态) */
      .ball {
        position: fixed;
        bottom: 160px;
        right: 12px;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: rgba(30, 41, 59, 0.92);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        user-select: none;
        touch-action: none;
        pointer-events: auto;
        transition: box-shadow 0.2s, background 0.2s;
        z-index: 2147483647;
      }
      .ball:active {
        cursor: grabbing;
        transform: scale(0.95);
      }
      .ball-icon {
        width: 22px;
        height: 22px;
        fill: #38bdf8;
        pointer-events: none;
      }
      .ball.playing {
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.65), 0 0 0 1px rgba(56, 189, 248, 0.5);
        animation: pulse 2.4s infinite ease-in-out;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }

      /* 展开态面板 (底部磨砂控制台) */
      .panel {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.45);
        padding: 14px 16px env(safe-area-inset-bottom, 14px);
        box-sizing: border-box;
        pointer-events: auto;
        transform: translateY(105%);
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 2147483647;
      }
      .panel.open {
        transform: translateY(0);
      }

      /* 头部信息区 */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      .title-box {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
        overflow: hidden;
      }
      .title {
        font-weight: 600;
        font-size: 15px;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .jump-btn {
        display: none;
        flex-shrink: 0;
        font-size: 11px;
        padding: 2px 6px;
        background: rgba(56, 189, 248, 0.2);
        color: #38bdf8;
        border-radius: 4px;
        text-decoration: none;
        cursor: pointer;
      }
      .actions-box {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        gap: 8px;
      }
      .reader-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: rgba(56, 189, 248, 0.16);
        border: 1px solid rgba(56, 189, 248, 0.35);
        color: #38bdf8;
        font-size: 11px;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 10px;
        cursor: pointer;
        white-space: nowrap;
      }
      .reader-pill:active {
        background: rgba(56, 189, 248, 0.28);
      }
      .icon-btn {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn:hover, .icon-btn:active {
        color: #f8fafc;
      }
      .progress-badge {
        font-size: 11px;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 7px;
        border-radius: 10px;
        color: #94a3b8;
      }

      /* 控制按钮主行 */
      .controls {
        display: flex;
        align-items: center;
        justify-content: space-around;
        margin-bottom: 12px;
      }
      .ctrl-btn {
        background: rgba(255, 255, 255, 0.08);
        border: none;
        border-radius: 50%;
        color: #f8fafc;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, transform 0.1s;
      }
      .ctrl-btn:active {
        transform: scale(0.9);
      }
      .ctrl-btn.secondary {
        width: 42px;
        height: 42px;
      }
      .ctrl-btn.primary {
        width: 54px;
        height: 54px;
        background: #0284c7;
        box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
      }
      .ctrl-btn.primary:active {
        background: #0369a1;
      }
      .ctrl-btn svg {
        fill: currentColor;
      }

      /* 快捷设置行 */
      .settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .rate-pill {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #e2e8f0;
        font-size: 12px;
        font-weight: 500;
        padding: 5px 12px;
        border-radius: 14px;
        cursor: pointer;
      }
      .voice-select {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #e2e8f0;
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 8px;
        outline: none;
        max-width: 140px;
      }
      .voice-select option {
        background: #1e293b;
        color: #f8fafc;
      }

      /* 抽屉设置面板 */
      .settings-drawer {
        display: none;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      .settings-drawer.open {
        display: block;
      }
      .field {
        margin-bottom: 8px;
      }
      .field label {
        display: block;
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 4px;
      }
      .field input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        padding: 6px 10px;
        color: #f8fafc;
        font-size: 12px;
        outline: none;
      }
      .save-btn {
        background: #0284c7;
        color: #ffffff;
        border: none;
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .save-btn:active {
        background: #0369a1;
      }
      .test-btn {
        background: rgba(255, 255, 255, 0.1);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.3);
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .test-btn:active {
        background: rgba(56, 189, 248, 0.2);
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
        border: 1px solid rgba(34, 197, 94, 0.3);
        color: #86efac;
      }
      .test-result.error {
        display: block;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #fca5a5;
      }

      /* 提示 Toast */
      .toast {
        position: fixed;
        bottom: 230px;
        left: 50%;
        transform: translateX(-50%) translateY(10px);
        background: rgba(15, 23, 42, 0.95);
        color: #f8fafc;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s, transform 0.25s;
        z-index: 2147483647;
        max-width: 80%;
        text-align: center;
      }
      .toast.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;

    const container = document.createElement('div');
    container.innerHTML = `
      <!-- 折叠小球 -->
      <div class="ball" id="tts-ball" title="展开小说听书面板">
        <svg class="ball-icon" viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      </div>

      <!-- 展开主面板 -->
      <div class="panel" id="tts-panel">
        <div class="header">
          <div class="title-box">
            <span class="title" id="tts-title">小说听书</span>
            <span class="jump-btn" id="tts-jump">查看原文</span>
          </div>
          <div class="actions-box">
            <span class="progress-badge" id="tts-progress">0 / 0</span>
            <button class="reader-pill" id="tts-reader-open" title="开启阅读模式">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
              </svg>
              <span>阅读</span>
            </button>
            <button class="icon-btn" id="tts-gear" title="配置 Worker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </button>
            <button class="icon-btn" id="tts-close" title="收起面板">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 主控区 -->
        <div class="controls">
          <button class="ctrl-btn secondary" id="tts-prev" title="上一句">
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button class="ctrl-btn primary" id="tts-play" title="播放/暂停">
            <svg width="26" height="26" viewBox="0 0 24 24" id="tts-play-icon">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button class="ctrl-btn secondary" id="tts-next" title="下一句">
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button class="ctrl-btn secondary" id="tts-next-chapter" title="下一章">
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
          </button>
        </div>

        <!-- 快捷参数区 -->
        <div class="settings-row">
          <button class="rate-pill" id="tts-rate">${config.rate.toFixed(1)}x</button>
          <select class="voice-select" id="tts-voice">
            ${buildVoiceOptionsHtml()}
          </select>
        </div>

        <!-- 设置抽屉 -->
        <div class="settings-drawer" id="tts-drawer">
          <div class="field">
            <label>Edge TTS Worker 地址 (URL)</label>
            <input type="text" id="tts-worker-url" placeholder="https://xxx.workers.dev 或 http://localhost:8787" />
          </div>
          <div class="field">
            <label>Worker 鉴权密钥 (Token，默认 dev-secret)</label>
            <input type="text" id="tts-token" placeholder="dev-secret" />
          </div>
          <div style="display: flex; gap: 8px; margin-top: 6px;">
            <button class="save-btn" id="tts-save-config" style="flex: 1;">保存配置</button>
            <button class="test-btn" id="tts-test-config" style="flex: 1;">测试连接</button>
          </div>
          <div class="test-result" id="tts-test-result"></div>
        </div>
      </div>

      <!-- Toast 消息 -->
      <div class="toast" id="tts-toast"></div>
    `;

    this.shadow.appendChild(style);
    this.shadow.appendChild(container);

    // 获取元素引用
    this.ballEl = this.shadow.querySelector('#tts-ball')!;
    this.panelEl = this.shadow.querySelector('#tts-panel')!;
    this.playBtn = this.shadow.querySelector('#tts-play')!;
    this.titleEl = this.shadow.querySelector('#tts-title')!;
    this.progressEl = this.shadow.querySelector('#tts-progress')!;
    this.rateBtn = this.shadow.querySelector('#tts-rate')!;
    this.voiceSelect = this.shadow.querySelector('#tts-voice')! as HTMLSelectElement;
    this.toastEl = this.shadow.querySelector('#tts-toast')!;
    this.settingsDrawer = this.shadow.querySelector('#tts-drawer')!;
    this.workerInput = this.shadow.querySelector('#tts-worker-url')! as HTMLInputElement;
    this.tokenInput = this.shadow.querySelector('#tts-token')! as HTMLInputElement;
    this.testBtn = this.shadow.querySelector('#tts-test-config')! as HTMLButtonElement;
    this.testResultEl = this.shadow.querySelector('#tts-test-result')!;
    this.jumpChapterBtn = this.shadow.querySelector('#tts-jump')!;

    // 通过 DOM 属性安全赋值，防止 XSS/属性注入，并使默认 Token 清晰可见
    this.workerInput.value = config.workerUrl;
    this.tokenInput.value = config.token;
    this.voiceSelect.value = config.voice;
  }

  private clampOffsetTop(offsetTop: number): number {
    const maxTop = Math.max(60, window.innerHeight - 80);
    return Math.max(60, Math.min(maxTop, offsetTop));
  }

  private applyBallPosition(): void {
    if (!this.ballPosition) {
      return;
    }
    const { side, offsetTop } = this.ballPosition;
    const clampedTop = this.clampOffsetTop(offsetTop);
    this.ballEl.style.top = `${clampedTop}px`;
    this.ballEl.style.bottom = 'auto';
    if (side === 'left') {
      this.ballEl.style.left = '12px';
      this.ballEl.style.right = 'auto';
    } else {
      this.ballEl.style.right = '12px';
      this.ballEl.style.left = 'auto';
    }
  }

  // ─── 拖拽与吸附逻辑 ─────────────────────────────────────────────────────

  private bindDragEvents(): void {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let isDragging = false;
    let hasMoved = false;

    const onStart = (clientX: number, clientY: number) => {
      isDragging = true;
      hasMoved = false;
      startX = clientX;
      startY = clientY;

      const rect = this.ballEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      this.ballEl.style.transition = 'none';
    };

    const onMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const dx = clientX - startX;
      const dy = clientY - startY;

      if (!hasMoved && Math.hypot(dx, dy) > 8) {
        hasMoved = true;
      }

      if (hasMoved) {
        let currentLeft = initialLeft + dx;
        let currentTop = initialTop + dy;

        // 视口边界约束
        const maxX = Math.max(0, window.innerWidth - 46);
        const maxY = Math.max(40, window.innerHeight - 46);
        currentLeft = Math.max(0, Math.min(maxX, currentLeft));
        currentTop = Math.max(40, Math.min(maxY - 40, currentTop));

        this.ballEl.style.left = `${currentLeft}px`;
        this.ballEl.style.top = `${currentTop}px`;
        this.ballEl.style.right = 'auto';
        this.ballEl.style.bottom = 'auto';
      }
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      this.ballEl.style.transition =
        'left 0.25s cubic-bezier(0.16, 1, 0.3, 1), right 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s';

      if (hasMoved) {
        const rect = this.ballEl.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const ballCenterX = rect.left + rect.width / 2;

        // 自动吸附到最近边缘 (左或右)
        let side: 'left' | 'right' = 'right';
        if (ballCenterX < screenWidth / 2) {
          side = 'left';
          this.ballEl.style.left = '12px';
          this.ballEl.style.right = 'auto';
        } else {
          side = 'right';
          this.ballEl.style.right = '12px';
          this.ballEl.style.left = 'auto';
        }

        // 限制垂直高度安全区间
        const offsetTop = this.clampOffsetTop(rect.top);
        this.ballEl.style.top = `${offsetTop}px`;
        this.ballEl.style.bottom = 'auto';

        this.ballPosition = { side, offsetTop };
        this.events.onBallPositionChange?.(this.ballPosition);
      }
    };

    // 移动端 Touch
    this.ballEl.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          onStart(e.touches[0].clientX, e.touches[0].clientY);
        }
      },
      { passive: true }
    );

    this.onWindowTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    this.onWindowTouchEnd = () => {
      onEnd();
    };
    window.addEventListener('touchmove', this.onWindowTouchMove, { passive: true });
    window.addEventListener('touchend', this.onWindowTouchEnd);

    // 鼠标 Mouse
    this.ballEl.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        onStart(e.clientX, e.clientY);
      }
    });

    this.onWindowMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        onMove(e.clientX, e.clientY);
      }
    };
    this.onWindowMouseUp = () => {
      onEnd();
    };
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onWindowMouseUp);

    // 横竖屏或窗口尺寸变化时重新约束悬浮球位置
    this.onWindowResize = () => {
      this.applyBallPosition();
    };
    window.addEventListener('resize', this.onWindowResize);

    // 点击小球（如果不是拖拽，则展开）
    this.ballEl.addEventListener('click', (e) => {
      if (hasMoved) {
        e.stopPropagation();
        hasMoved = false;
        return;
      }
      this.expandPanel();
    });
  }

  // ─── 事件绑定 ─────────────────────────────────────────────────────────

  private bindEvents(): void {
    this.shadow.querySelector('#tts-close')!.addEventListener('click', () => {
      this.collapsePanel();
    });

    // 开启阅读模式
    this.shadow.querySelector('#tts-reader-open')!.addEventListener('click', () => {
      this.collapsePanel();
      this.events.onOpenReader();
    });

    // 播放/暂停
    this.playBtn.addEventListener('click', () => {
      this.events.onPlayToggle();
    });

    // 切句与切章
    this.shadow.querySelector('#tts-prev')!.addEventListener('click', () => {
      this.events.onPrevSentence();
    });
    this.shadow.querySelector('#tts-next')!.addEventListener('click', () => {
      this.events.onNextSentence();
    });
    this.shadow.querySelector('#tts-next-chapter')!.addEventListener('click', () => {
      this.events.onNextChapter();
    });

    // 循环切换语速：1.0x -> 1.2x -> 1.5x -> 2.0x -> 1.0x
    this.rateBtn.addEventListener('click', () => {
      this.currentRate = getNextRate(this.currentRate);
      this.rateBtn.textContent = `${this.currentRate.toFixed(1)}x`;
      this.events.onRateChange(this.currentRate);
      this.showToast(`语速已切换为 ${this.currentRate.toFixed(1)}x`);
    });

    // 切换音色
    this.voiceSelect.addEventListener('change', () => {
      this.events.onVoiceChange(this.voiceSelect.value);
      this.showToast('音色已更新');
    });

    // 展开设置抽屉
    this.shadow.querySelector('#tts-gear')!.addEventListener('click', () => {
      this.isSettingsOpen = !this.isSettingsOpen;
      this.settingsDrawer.classList.toggle('open', this.isSettingsOpen);
    });

    // 保存 Worker 设置（提示统一交由 main.ts onSaveConfig 回调处理，避免重复 Toast）
    this.shadow.querySelector('#tts-save-config')!.addEventListener('click', () => {
      const url = this.workerInput.value.trim();
      const token = this.tokenInput.value.trim();
      this.events.onSaveConfig(url, token);
      this.isSettingsOpen = false;
      this.settingsDrawer.classList.remove('open');
    });

    // 测试 Worker 连接
    this.testBtn.addEventListener('click', () => {
      void executeConnectionTest({
        urlInput: this.workerInput,
        tokenInput: this.tokenInput,
        testBtn: this.testBtn,
        resultEl: this.testResultEl,
        onTest: (url, token) => this.events.onTestConfig(url, token),
        onEmptyUrl: () => this.showToast('请先输入 Worker 地址'),
      });
    });

    // 跳转当前章节
    this.jumpChapterBtn.addEventListener('click', () => {
      if (this.currentChapterUrl) {
        if (this.events.onJumpChapterUrl) {
          this.events.onJumpChapterUrl(this.currentChapterUrl);
        } else {
          window.location.href = this.currentChapterUrl;
        }
      }
    });
  }

  private expandPanel(): void {
    if (this.isSuppressed) return;
    this.panelEl.classList.add('open');
    this.ballEl.style.display = 'none';
  }

  private collapsePanel(): void {
    this.panelEl.classList.remove('open');
    this.ballEl.style.display = this.isSuppressed ? 'none' : 'flex';
  }

  private updatePlayButton(): void {
    const icon = this.shadow.querySelector('#tts-play-icon')!;
    if (this.playerState === 'playing') {
      icon.innerHTML = SVG_PAUSE_PATH;
      this.playBtn.title = '暂停';
    } else if (this.playerState === 'loading') {
      icon.innerHTML = SVG_PLAY_PATH;
      this.playBtn.title = '加载中…';
    } else {
      icon.innerHTML = SVG_PLAY_PATH;
      this.playBtn.title = '播放';
    }
  }

  private updateBallAnimation(): void {
    if (this.playerState === 'playing') {
      this.ballEl.classList.add('playing');
    } else {
      this.ballEl.classList.remove('playing');
    }
  }
}
