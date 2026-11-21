export interface BallPosition {
  side: 'left' | 'right';
  offsetTop: number;
}

export interface AppConfig {
  workerUrl: string;
  token: string;
  voice: string;
  rate: number;
  ballPosition?: BallPosition;
}

export const DEFAULT_CONFIG: AppConfig = {
  workerUrl: '',
  token: '',
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: 1.2,
};

const STORAGE_KEY = 'novel_tts_config';

/**
 * 跨站配置持久化存储类
 * 优先采用 GM_getValue / GM_setValue，不支持时降级至 localStorage
 */
export class ConfigStorage {
  private static isGMSupported(): boolean {
    return typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  }

  static load(): AppConfig {
    try {
      if (this.isGMSupported()) {
        const raw = GM_getValue<string | null>(STORAGE_KEY, null);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { ...DEFAULT_CONFIG, ...parsed };
        }
      } else if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { ...DEFAULT_CONFIG, ...parsed };
        }
      }
    } catch {
      // JSON 解析或存储读取失败时使用默认值
    }
    return { ...DEFAULT_CONFIG };
  }

  static save(patch: Partial<AppConfig>): AppConfig {
    const current = this.load();
    const updated: AppConfig = { ...current, ...patch };

    try {
      const serialized = JSON.stringify(updated);
      if (this.isGMSupported()) {
        GM_setValue(STORAGE_KEY, serialized);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, serialized);
      }
    } catch (err) {
      console.warn('[NovelTTS] Failed to persist config:', err);
    }

    return updated;
  }
}
