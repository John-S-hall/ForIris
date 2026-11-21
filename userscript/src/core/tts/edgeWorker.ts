import type { TTSOptions, TTSProvider } from './types';

export interface EdgeWorkerOptions {
  workerUrl: string;
  token: string;
  timeoutMs?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  source?: 'fetch' | 'GM_xhr';
  duration: number;
  bytes?: number;
  error?: string;
}

export class EdgeWorkerTTSProvider implements TTSProvider {
  readonly name = 'edge-worker';

  private workerUrl: string;
  private token: string;
  private timeoutMs: number;
  private lastUsedSource: 'fetch' | 'GM_xhr' | null = null;

  constructor(options: EdgeWorkerOptions) {
    this.workerUrl = this.sanitizeUrl(options.workerUrl);
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  private sanitizeUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').replace(/\/tts\/?$/i, '');
  }

  updateConfig(workerUrl?: string, token?: string): void {
    if (workerUrl !== undefined) {
      this.workerUrl = this.sanitizeUrl(workerUrl);
    }
    if (token !== undefined) {
      this.token = token;
    }
  }

  getLastUsedSource(): 'fetch' | 'GM_xhr' | null {
    return this.lastUsedSource;
  }

  private buildUrl(text: string, options: TTSOptions, customUrl?: string, customToken?: string): string {
    const baseUrl = customUrl ? this.sanitizeUrl(customUrl) : this.workerUrl;
    const token = customToken !== undefined ? customToken : this.token;

    const queryParams = new URLSearchParams({
      text: text.trim(),
      voice: options.voice || 'zh-CN-XiaoxiaoNeural',
      rate: String(options.rate || 1.2),
      token,
    });

    return `${baseUrl}/tts?${queryParams.toString()}`;
  }

  /**
   * 将各种格式的响应转换为合法有效的 ArrayBuffer（校验 > 256 字节）
   */
  private async normalizeAudioBuffer(rawResponse: unknown): Promise<ArrayBuffer> {
    let buffer: ArrayBuffer | null = null;

    if (rawResponse instanceof ArrayBuffer) {
      buffer = rawResponse;
    } else if (ArrayBuffer.isView(rawResponse)) {
      const copy = new Uint8Array(rawResponse.byteLength);
      copy.set(
        new Uint8Array(
          rawResponse.buffer as ArrayBuffer,
          rawResponse.byteOffset,
          rawResponse.byteLength
        )
      );
      buffer = copy.buffer;
    } else if (typeof Blob !== 'undefined' && rawResponse instanceof Blob) {
      buffer = await rawResponse.arrayBuffer();
    }

    if (!buffer || buffer.byteLength <= 256) {
      throw new Error(`音频数据无效或为空 (${buffer ? buffer.byteLength : 0} 字节)`);
    }

    return buffer;
  }

  /**
   * 主通道：通过 window.fetch 获取音频
   */
  private async synthesizeViaFetch(targetUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    // 纯 GET 简单请求，不附加任何自定义 header，避免触发 CORS OPTIONS 预检
    const res = await window.fetch(targetUrl, {
      method: 'GET',
      mode: 'cors',
      signal,
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('HTTP 401 密钥错误: 请检查 Worker Token 配置');
      }
      if (res.status === 502) {
        throw new Error('HTTP 502 上游异常: Edge TTS 微软服务端合成失败');
      }
      throw new Error(`Edge Worker HTTP ${res.status}: ${res.statusText || '请求失败'}`);
    }

    const buf = await res.arrayBuffer();
    return this.normalizeAudioBuffer(buf);
  }

  /**
   * 兜底通道：通过 GM_xmlhttpRequest 获取音频（带 8500ms JS 超时保险丝）
   */
  private async synthesizeViaGM(targetUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    const gmRequest = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null;
    if (!gmRequest) {
      throw new Error('GM_xmlhttpRequest 在当前环境中不可用');
    }

    return new Promise<ArrayBuffer>((resolve, reject) => {
      let settled = false;

      const finishError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const finishSuccess = (buf: ArrayBuffer) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(buf);
      };

      let requestHandle: { abort?: () => void } | null = null;
      let hardTimeoutTimer: any = null;

      const cleanup = () => {
        if (hardTimeoutTimer) {
          clearTimeout(hardTimeoutTimer);
          hardTimeoutTimer = null;
        }
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        try {
          if (requestHandle && typeof requestHandle.abort === 'function') {
            requestHandle.abort();
          }
        } catch {
          // ignore
        }
        finishError(new DOMException('The synthesis request was aborted', 'AbortError'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      // 8500ms JS 硬超时保险丝（防止 Stay 等扩展忽略 ontimeout 导致挂死）
      hardTimeoutTimer = setTimeout(() => {
        try {
          if (requestHandle && typeof requestHandle.abort === 'function') {
            requestHandle.abort();
          }
        } catch {
          // ignore
        }
        finishError(new Error('请求超时 (8500ms JS 保险丝触发)'));
      }, 8500);

      try {
        requestHandle = gmRequest({
          method: 'GET',
          url: targetUrl,
          responseType: 'arraybuffer', // 强制 arraybuffer，禁止 blob
          timeout: this.timeoutMs,
          onload: async (response) => {
            if (response.status < 200 || response.status >= 300) {
              if (response.status === 401) {
                finishError(new Error('HTTP 401 密钥错误: 请检查 Worker Token 配置'));
                return;
              }
              if (response.status === 502) {
                finishError(new Error('HTTP 502 上游异常: Edge TTS 微软服务端合成失败'));
                return;
              }
              finishError(
                new Error(
                  `Edge Worker HTTP ${response.status}: ${response.statusText || '请求失败'}`
                )
              );
              return;
            }

            try {
              const buffer = await this.normalizeAudioBuffer(response.response);
              finishSuccess(buffer);
            } catch (err: any) {
              finishError(err instanceof Error ? err : new Error(String(err)));
            }
          },
          onerror: (err) => {
            finishError(new Error(`网络错误 (GM_xhr): ${JSON.stringify(err)}`));
          },
          ontimeout: () => {
            finishError(new Error(`Edge Worker 请求超时 (${this.timeoutMs}ms)`));
          },
        });
      } catch (invokeErr: any) {
        finishError(new Error(`GM_xmlhttpRequest 调用失败: ${invokeErr?.message || invokeErr}`));
      }
    });
  }

  async synthesize(text: string, options: TTSOptions): Promise<string> {
    if (!text || !text.trim()) {
      throw new Error('TTS 合成失败: 文本不能为空');
    }

    if (options.signal?.aborted) {
      throw new DOMException('The synthesis request was aborted', 'AbortError');
    }

    const targetUrl = this.buildUrl(text, options);
    let audioBuffer: ArrayBuffer | null = null;
    let sourceUsed: 'fetch' | 'GM_xhr' = 'fetch';

    // 1. 优先尝试主通道：原生 window.fetch
    try {
      audioBuffer = await this.synthesizeViaFetch(targetUrl, options.signal);
      sourceUsed = 'fetch';
    } catch (fetchErr: any) {
      if (fetchErr.name === 'AbortError') {
        throw fetchErr;
      }

      // 如果是明确的 HTTP 业务错误（如 401 密钥错误、502 上游错误），不属于 CSP/网络阻断，直接报错
      if (fetchErr.message && fetchErr.message.startsWith('HTTP ')) {
        throw fetchErr;
      }

      // 如果有 GM_xmlhttpRequest，回退至兜底通道（防止小说站严格 CSP 拦截 fetch）
      if (typeof GM_xmlhttpRequest === 'function') {
        try {
          audioBuffer = await this.synthesizeViaGM(targetUrl, options.signal);
          sourceUsed = 'GM_xhr';
        } catch (gmErr: any) {
          throw new Error(`双通道请求均失败 (fetch: ${fetchErr.message}; GM: ${gmErr.message})`);
        }
      } else {
        throw fetchErr;
      }
    }

    this.lastUsedSource = sourceUsed;
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    return URL.createObjectURL(blob);
  }

  /**
   * 供 UI 设置抽屉使用的「测试连接」诊断方法
   */
  async testConnection(customUrl?: string, customToken?: string): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    const testText = '测试';
    const testOptions: TTSOptions = {
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 1.0,
    };

    const targetUrl = this.buildUrl(testText, testOptions, customUrl, customToken);

    try {
      let buffer: ArrayBuffer;
      let source: 'fetch' | 'GM_xhr' = 'fetch';

      try {
        buffer = await this.synthesizeViaFetch(targetUrl);
        source = 'fetch';
      } catch (fetchErr: any) {
        if (fetchErr.message && fetchErr.message.startsWith('HTTP ')) {
          throw fetchErr;
        }
        if (typeof GM_xmlhttpRequest === 'function') {
          buffer = await this.synthesizeViaGM(targetUrl);
          source = 'GM_xhr';
        } else {
          throw fetchErr;
        }
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        source,
        duration,
        bytes: buffer.byteLength,
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        error: err?.message || String(err),
      };
    }
  }
}
