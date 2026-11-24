export type ReaderTheme = 'light' | 'sepia' | 'green' | 'dark';

export interface ReaderSettings {
  theme: ReaderTheme;
  fontSize: number; // 14 ~ 28，默认 18
  lineHeight: number; // 1.4 ~ 2.4，默认 1.85
  autoEnter: boolean; // 默认 false
  infiniteScroll: boolean; // 下滑自动拼接下一章，默认 true
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'sepia',
  fontSize: 18,
  lineHeight: 1.85,
  autoEnter: false,
  infiniteScroll: true,
};

const VALID_THEMES = new Set<ReaderTheme>(['light', 'sepia', 'green', 'dark']);

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
  reader: ReaderSettings;
}

export const DEFAULT_CONFIG: AppConfig = {
  workerUrl: '',
  token: 'dev-secret',
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: 1.0,
  reader: { ...DEFAULT_READER_SETTINGS },
};

const STORAGE_KEY = 'novel_tts_config';

function normalizeReaderSettings(raw?: Partial<ReaderSettings> | null): ReaderSettings {
  const src = raw && typeof raw === 'object' ? raw : {};
  const theme: ReaderTheme =
    src.theme && VALID_THEMES.has(src.theme as ReaderTheme)
      ? (src.theme as ReaderTheme)
      : DEFAULT_READER_SETTINGS.theme;

  const fontSize =
    typeof src.fontSize === 'number' && Number.isFinite(src.fontSize)
      ? Math.max(14, Math.min(28, Math.round(src.fontSize)))
      : DEFAULT_READER_SETTINGS.fontSize;

  const lineHeight =
    typeof src.lineHeight === 'number' && Number.isFinite(src.lineHeight)
      ? Math.max(1.4, Math.min(2.4, Number(src.lineHeight.toFixed(2))))
      : DEFAULT_READER_SETTINGS.lineHeight;

  const autoEnter =
    typeof src.autoEnter === 'boolean' ? src.autoEnter : DEFAULT_READER_SETTINGS.autoEnter;
  const infiniteScroll =
    typeof src.infiniteScroll === 'boolean'
      ? src.infiniteScroll
      : DEFAULT_READER_SETTINGS.infiniteScroll;

  return { theme, fontSize, lineHeight, autoEnter, infiniteScroll };
}

/**
 * 跨站配置持久化存储类
 * 优先采用 GM_getValue / GM_setValue，不支持时降级至 localStorage
 */
export class ConfigStorage {
  private static isGMSupported(): boolean {
    return typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  }

  private static normalizeConfig(parsed: Partial<AppConfig>): AppConfig {
    const merged: AppConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      reader: normalizeReaderSettings(parsed.reader),
    };
    if (typeof merged.token !== 'string' || merged.token.trim().length === 0) {
      merged.token = DEFAULT_CONFIG.token;
    }
    if (typeof merged.rate !== 'number' || !Number.isFinite(merged.rate) || merged.rate <= 0) {
      merged.rate = DEFAULT_CONFIG.rate;
    }
    if (typeof merged.voice !== 'string' || merged.voice.trim().length === 0) {
      merged.voice = DEFAULT_CONFIG.voice;
    }
    if (typeof merged.workerUrl !== 'string') {
      merged.workerUrl = DEFAULT_CONFIG.workerUrl;
    }
    return merged;
  }

  static load(): AppConfig {
    try {
      if (this.isGMSupported()) {
        const raw = GM_getValue<string | null>(STORAGE_KEY, null);
        if (raw) {
          const parsed = JSON.parse(raw);
          return this.normalizeConfig(parsed);
        }
      } else if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return this.normalizeConfig(parsed);
        }
      }
    } catch {
      // JSON 解析或存储读取失败时使用默认值
    }
    return {
      ...DEFAULT_CONFIG,
      reader: { ...DEFAULT_READER_SETTINGS },
    };
  }

  static save(patch: Partial<AppConfig>): AppConfig {
    const current = this.load();
    const updated = this.normalizeConfig({
      ...current,
      ...patch,
      reader: patch.reader ? { ...current.reader, ...patch.reader } : current.reader,
    });

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

  static saveReaderSettings(patch: Partial<ReaderSettings>): AppConfig {
    const current = this.load();
    return this.save({
      reader: {
        ...current.reader,
        ...patch,
      },
    });
  }
}
