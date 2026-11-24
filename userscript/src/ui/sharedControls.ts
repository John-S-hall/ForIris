import type { ConnectionTestResult } from '../core/tts/edgeWorker';

export interface VoiceOption {
  value: string;
  label: string;
}

export const VOICE_OPTIONS: ReadonlyArray<VoiceOption> = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女声·标准)' },
  { value: 'zh-CN-YunxiNeural', label: '云希 (男声·生动)' },
  { value: 'zh-CN-YunjianNeural', label: '云健 (男声·沉稳)' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊 (女声·灵动)' },
];

export const RATE_OPTIONS: ReadonlyArray<number> = [1.0, 1.2, 1.5, 2.0];

export const SVG_PLAY_PATH = '<path d="M8 5v14l11-7z"/>';
export const SVG_PAUSE_PATH = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';

export function buildVoiceOptionsHtml(): string {
  return VOICE_OPTIONS.map((v) => `<option value="${v.value}">${v.label}</option>`).join('');
}

export function getNextRate(currentRate: number): number {
  const idx = RATE_OPTIONS.findIndex((r) => Math.abs(r - currentRate) < 0.05);
  return RATE_OPTIONS[(idx + 1) % RATE_OPTIONS.length];
}

export interface TestConnectionBindOptions {
  urlInput: HTMLInputElement;
  tokenInput: HTMLInputElement;
  testBtn: HTMLButtonElement;
  resultEl: HTMLElement;
  onTest: (url: string, token: string) => Promise<ConnectionTestResult>;
  onEmptyUrl: () => void;
}

/** 通用 Worker 测试连接按钮执行器 */
export async function executeConnectionTest(opts: TestConnectionBindOptions): Promise<void> {
  const url = opts.urlInput.value.trim();
  const token = opts.tokenInput.value.trim();

  if (!url) {
    opts.onEmptyUrl();
    return;
  }

  opts.testBtn.disabled = true;
  opts.testBtn.textContent = '测试中…';
  opts.resultEl.className = 'test-result';
  opts.resultEl.style.display = 'none';

  try {
    const res = await opts.onTest(url, token);
    if (res.success) {
      opts.resultEl.className = 'test-result success';
      opts.resultEl.textContent = `✅ 连接成功 (${res.source === 'fetch' ? '原生 fetch' : 'GM_xhr'}, 耗时 ${res.duration}ms, 大小 ${res.bytes}B)`;
    } else {
      opts.resultEl.className = 'test-result error';
      opts.resultEl.textContent = `❌ 连接失败: ${res.error || '未知错误'}`;
    }
  } catch (err: any) {
    opts.resultEl.className = 'test-result error';
    opts.resultEl.textContent = `❌ 测试异常: ${err?.message || err}`;
  } finally {
    opts.resultEl.style.display = 'block';
    opts.testBtn.disabled = false;
    opts.testBtn.textContent = '测试连接';
  }
}
