import type { TTSOptions, TTSProvider } from './types';

export interface EdgeWorkerOptions {
  workerUrl: string;
  token: string;
  timeoutMs?: number;
}

export class EdgeWorkerTTSProvider implements TTSProvider {
  readonly name = 'edge-worker';

  private workerUrl: string;
  private token: string;
  private timeoutMs: number;

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

  async synthesize(text: string, options: TTSOptions): Promise<string> {
    if (!text || !text.trim()) {
      throw new Error('TTS synthesis failed: text cannot be empty');
    }

    if (options.signal?.aborted) {
      throw new DOMException('The synthesis request was aborted', 'AbortError');
    }

    const queryParams = new URLSearchParams({
      text: text.trim(),
      voice: options.voice || 'zh-CN-XiaoxiaoNeural',
      rate: String(options.rate || 1.2),
      token: this.token,
    });

    const targetUrl = `${this.workerUrl}/tts?${queryParams.toString()}`;

    // 检查 GM_xmlhttpRequest 可用性（油猴核心环境）
    const gmRequest = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null;
    if (!gmRequest) {
      throw new Error('GM_xmlhttpRequest is not available in the current environment');
    }

    return new Promise<string>((resolve, reject) => {
      let settled = false;

      const cleanupSignal = () => {
        if (options.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
      };

      const finishError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanupSignal();
        reject(err);
      };

      const finishSuccess = (blobUrl: string) => {
        if (settled) return;
        settled = true;
        cleanupSignal();
        resolve(blobUrl);
      };

      let requestHandle: { abort?: () => void } | null = null;

      const onAbort = () => {
        try {
          if (requestHandle && typeof requestHandle.abort === 'function') {
            requestHandle.abort();
          }
        } catch {
          // ignore abort error
        }
        finishError(new DOMException('The synthesis request was aborted', 'AbortError'));
      };

      if (options.signal) {
        options.signal.addEventListener('abort', onAbort);
      }

      try {
        requestHandle = gmRequest({
          method: 'GET',
          url: targetUrl,
          responseType: 'blob',
          timeout: this.timeoutMs,
          onload: (response) => {
            if (response.status < 200 || response.status >= 300) {
              finishError(
                new Error(
                  `Edge Worker HTTP ${response.status}: ${response.statusText || 'Request failed'}`
                )
              );
              return;
            }

            const blob = response.response as Blob;
            if (!blob || blob.size === 0) {
              finishError(new Error('Edge Worker returned an empty audio response'));
              return;
            }

            try {
              const blobUrl = URL.createObjectURL(blob);
              finishSuccess(blobUrl);
            } catch (createErr) {
              finishError(new Error(`Failed to create Object URL: ${createErr}`));
            }
          },
          onerror: (err) => {
            finishError(new Error(`Network error requesting Edge Worker: ${JSON.stringify(err)}`));
          },
          ontimeout: () => {
            finishError(new Error(`Edge Worker request timed out after ${this.timeoutMs}ms`));
          },
        });
      } catch (invokeErr) {
        finishError(new Error(`Failed to invoke GM_xmlhttpRequest: ${invokeErr}`));
      }
    });
  }
}
