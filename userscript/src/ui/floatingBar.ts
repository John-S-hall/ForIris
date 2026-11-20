import type { AppConfig } from '../core/storage';
import type { PlayerState } from '../core/tts/types';

export interface FloatingBarEvents {
  onPlayToggle: () => void;
  onNextSentence: () => void;
  onPrevSentence: () => void;
  onNextChapter: () => void;
  onRateChange: (rate: number) => void;
  onVoiceChange: (voice: string) => void;
  onSaveConfig: (workerUrl: string, token: string) => void;
  onJumpChapterUrl?: (url: string) => void;
}

export class FloatingBar {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private events: FloatingBarEvents;

  // 状态引用
  private isExpanded = false;
  private isSettingsOpen = false;
  private playerState: PlayerState = 'idle';
  private currentProgress = { index: 0, total: 0, text: '' };
  private currentChapterTitle = '小说听书';
  private currentChapterUrl: string | null = null;
  private currentRate = 1.2;
  private currentVoice = 'zh-CN-XiaoxiaoNeural';

  // DOM 元素引用
  private ballEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private playBtn!: HTMLElement;
  private titleEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private textEl!: HTMLElement;
  private rateBtn!: HTMLElement;
  private voiceSelect!: HTMLSelectElement;
  private toastEl!: HTMLElement;
  private settingsDrawer!: HTMLElement;
  private workerInput!: HTMLInputElement;
  private tokenInput!: HTMLInputElement;
  private jumpChapterBtn!: HTMLElement;

  private toastTimer: any = null;

  constructor(config: AppConfig, events: FloatingBarEvents) {
    this.events = events;
    this.currentRate = config.rate;
    this.currentVoice = config.voice;

    this.host = document.createElement('div');
    this.host.id = 'novel-tts-floating-root';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    this.render(config);
    this.bindEvents();
  }

  mount(parent: HTMLElement = document.body): void {
    if (!parent.contains(this.host)) {
      parent.appendChild(this.host);
    }
  }

  unmount(): void {
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
  }

  toggleVisible(): void {
    if (this.host.style.display === 'none') {
      this.host.style.display = 'block';
    } else {
      this.host.style.display = 'none';
    }
  }

  // ─── 状态更新接口 ──────────────────────────────────────────────────────

  updatePlayerState(state: PlayerState): void {
    this.playerState = state;
    this.updatePlayButton();
    this.updateBallAnimation();
  }

  updateProgress(index: number, total: number, sentence: string): void {
    this.currentProgress = { index, total, text: sentence };
    this.progressEl.textContent = `${index + 1} / ${total}`;
    this.textEl.textContent = sentence || '正在准备朗读…';
  }

  updateChapter(title: string, nextUrl: string | null, currentUrl?: string): void {
    this.currentChapterTitle = title;
    this.titleEl.textContent = title;
    if (currentUrl) {
      this.currentChapterUrl = currentUrl;
      this.jumpChapterBtn.style.display = 'inline-block';
    } else {
      this.jumpChapterBtn.style.display = 'none';
    }
  }

  showToast(message: string, duration = 3000): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('visible');
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
        z-index: 2147483647;
      }

      /* 悬浮小球 (折叠态) */
      .ball {
        position: fixed;
        bottom: 70px;
        right: 18px;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: rgba(30, 41, 59, 0.88);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        user-select: none;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
        z-index: 100;
      }
      .ball:active {
        transform: scale(0.92);
      }
      .ball-icon {
        width: 22px;
        height: 22px;
        fill: #38bdf8;
      }
      .ball.playing {
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.6), 0 0 0 1px rgba(56, 189, 248, 0.4);
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
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.4);
        padding: 14px 16px env(safe-area-inset-bottom, 14px);
        box-sizing: border-box;
        transform: translateY(105%);
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 101;
      }
      .panel.open {
        transform: translateY(0);
      }

      /* 头部信息区 */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      .title-box {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
      }
      .title {
        font-weight: 600;
        font-size: 15px;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 220px;
      }
      .jump-btn {
        display: none;
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
        gap: 10px;
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

      /* 当前朗读句预览 */
      .sentence-preview {
        font-size: 13px;
        color: #cbd5e1;
        min-height: 36px;
        max-height: 36px;
        margin-bottom: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        background: rgba(255, 255, 255, 0.04);
        padding: 6px 10px;
        border-radius: 6px;
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
        width: 100%;
        background: #0284c7;
        color: #ffffff;
        border: none;
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        margin-top: 4px;
      }
      .save-btn:active {
        background: #0369a1;
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
        z-index: 102;
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

        <div class="sentence-preview" id="tts-sentence">点击播放开始听书…</div>

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
            <option value="zh-CN-XiaoxiaoNeural">晓晓 (女声·标准)</option>
            <option value="zh-CN-YunxiNeural">云希 (男声·生动)</option>
            <option value="zh-CN-YunjianNeural">云健 (男声·沉稳)</option>
            <option value="zh-CN-XiaoyiNeural">晓伊 (女声·灵动)</option>
          </select>
        </div>

        <!-- 设置抽屉 -->
        <div class="settings-drawer" id="tts-drawer">
          <div class="field">
            <label>Edge TTS Worker 地址 (URL)</label>
            <input type="text" id="tts-worker-url" placeholder="http://localhost:8787 或 CF Worker 域名" value="${config.workerUrl}"/>
          </div>
          <div class="field">
            <label>Worker 鉴权密钥 (Token)</label>
            <input type="text" id="tts-token" placeholder="dev-secret" value="${config.token}"/>
          </div>
          <button class="save-btn" id="tts-save-config">保存配置</button>
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
    this.textEl = this.shadow.querySelector('#tts-sentence')!;
    this.rateBtn = this.shadow.querySelector('#tts-rate')!;
    this.voiceSelect = this.shadow.querySelector('#tts-voice')! as HTMLSelectElement;
    this.toastEl = this.shadow.querySelector('#tts-toast')!;
    this.settingsDrawer = this.shadow.querySelector('#tts-drawer')!;
    this.workerInput = this.shadow.querySelector('#tts-worker-url')! as HTMLInputElement;
    this.tokenInput = this.shadow.querySelector('#tts-token')! as HTMLInputElement;
    this.jumpChapterBtn = this.shadow.querySelector('#tts-jump')!;

    this.voiceSelect.value = config.voice;
  }

  // ─── 事件绑定 ─────────────────────────────────────────────────────────

  private bindEvents(): void {
    // 展开/收起浮层
    this.ballEl.addEventListener('click', () => {
      this.expandPanel();
    });

    this.shadow.querySelector('#tts-close')!.addEventListener('click', () => {
      this.collapsePanel();
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
    const rates = [1.0, 1.2, 1.5, 2.0];
    this.rateBtn.addEventListener('click', () => {
      const idx = rates.findIndex((r) => Math.abs(r - this.currentRate) < 0.05);
      const nextIdx = (idx + 1) % rates.length;
      this.currentRate = rates[nextIdx];
      this.rateBtn.textContent = `${this.currentRate.toFixed(1)}x`;
      this.events.onRateChange(this.currentRate);
      this.showToast(`语速已切换为 ${this.currentRate.toFixed(1)}x`);
    });

    // 切换音色
    this.voiceSelect.addEventListener('change', () => {
      this.currentVoice = this.voiceSelect.value;
      this.events.onVoiceChange(this.currentVoice);
      this.showToast('音色已更新');
    });

    // 展开设置抽屉
    this.shadow.querySelector('#tts-gear')!.addEventListener('click', () => {
      this.isSettingsOpen = !this.isSettingsOpen;
      this.settingsDrawer.classList.toggle('open', this.isSettingsOpen);
    });

    // 保存 Worker 设置
    this.shadow.querySelector('#tts-save-config')!.addEventListener('click', () => {
      const url = this.workerInput.value.trim();
      const token = this.tokenInput.value.trim();
      this.events.onSaveConfig(url, token);
      this.isSettingsOpen = false;
      this.settingsDrawer.classList.remove('open');
      this.showToast('配置已保存');
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
    this.isExpanded = true;
    this.panelEl.classList.add('open');
    this.ballEl.style.display = 'none';
  }

  private collapsePanel(): void {
    this.isExpanded = false;
    this.panelEl.classList.remove('open');
    this.ballEl.style.display = 'flex';
  }

  private updatePlayButton(): void {
    const icon = this.shadow.querySelector('#tts-play-icon')!;
    if (this.playerState === 'playing') {
      // 显示暂停图标
      icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      this.playBtn.title = '暂停';
    } else if (this.playerState === 'loading') {
      // 保持播放图标但稍暗
      icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      this.playBtn.title = '加载中…';
    } else {
      // 显示播放图标
      icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
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
