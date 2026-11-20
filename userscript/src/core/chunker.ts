export interface ChunkerOptions {
  /** 最小期望单句字数，默认 30 */
  minChars?: number;
  /** 最大单句字数上限，默认 120 */
  maxChars?: number;
}

const DEFAULT_MIN_CHARS = 30;
const DEFAULT_MAX_CHARS = 120;

/**
 * 句末主标点正则：
 * 匹配一串非主要断句字符，加上句末标点（。！？；!?）及可能紧跟的闭合引号/括号（”’"'\)）》）
 */
const PRIMARY_DELIMITER_REGEX = /([^\r\n。！？；!?]+(?:[。！？；!?]+[”’"'\)）》]*|$))/g;

/**
 * 次级标点正则（用于超长句的二次拆分）：
 * 匹配一串非次级断句字符，加上次级标点（，,、：:——……）及可能紧跟的闭合引号/括号
 */
const SECONDARY_DELIMITER_REGEX = /([^\r\n，,、：:——……]+(?:[，,、：:——……]+[”’"'\)）》]*|$))/g;

/** 是否仅包含空白或标点符号（无实际文字/字母/数字） */
function isPunctuationOrWhitespaceOnly(str: string): boolean {
  return !/[\p{L}\p{N}]/u.test(str);
}

/**
 * 纯字数硬截断切片
 */
function hardSlice(text: string, chunkSize: number): string[] {
  const slices: string[] = [];
  let index = 0;
  while (index < text.length) {
    slices.push(text.slice(index, index + chunkSize));
    index += chunkSize;
  }
  return slices;
}

/**
 * 将超过 maxChars 的无主标点长句按次级标点或字数硬切分
 */
function splitOverlongSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) {
    return [sentence];
  }

  // 1. 尝试按次级标点切分
  const matches = sentence.match(SECONDARY_DELIMITER_REGEX);
  if (!matches || matches.length <= 1) {
    return hardSlice(sentence, maxChars);
  }

  const results: string[] = [];
  let current = '';

  for (const part of matches) {
    if (!part) continue;

    if (part.length > maxChars) {
      if (current) {
        results.push(current);
        current = '';
      }
      results.push(...hardSlice(part, maxChars));
    } else if (current.length + part.length <= maxChars) {
      current += part;
    } else {
      if (current) results.push(current);
      current = part;
    }
  }

  if (current) {
    results.push(current);
  }

  return results;
}

/**
 * 核心分句函数：
 * 1. 按主要标点 (。！？；\n) 初步切分，保留标点及随后的闭合引号
 * 2. 超过 maxChars (120) 的长句按逗号或字数硬切分
 * 3. 贪心合并小于 minChars (30) 的相邻碎句（控制在 maxChars 内）
 * 4. 过滤纯空白与纯标点片段
 */
export function chunkText(
  input: string | string[],
  options?: ChunkerOptions
): string[] {
  const minChars = options?.minChars ?? DEFAULT_MIN_CHARS;
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;

  // 归一化输入为单一文本字符串
  const rawText = Array.isArray(input) ? input.join('\n') : input;
  if (!rawText || !rawText.trim()) {
    return [];
  }

  // 1. 第一阶段：主标点切分
  const rawSegments = rawText.match(PRIMARY_DELIMITER_REGEX) || [rawText];
  const atomicSentences: string[] = [];

  for (const seg of rawSegments) {
    const trimmed = seg.trim();
    if (!trimmed || isPunctuationOrWhitespaceOnly(trimmed)) {
      continue;
    }

    if (trimmed.length > maxChars) {
      const pieces = splitOverlongSentence(trimmed, maxChars);
      for (const piece of pieces) {
        const pTrimmed = piece.trim();
        if (pTrimmed && !isPunctuationOrWhitespaceOnly(pTrimmed)) {
          atomicSentences.push(pTrimmed);
        }
      }
    } else {
      atomicSentences.push(trimmed);
    }
  }

  if (atomicSentences.length === 0) {
    return [];
  }

  // 2. 第二阶段：合并过短碎句（贪心合并至 minChars ~ maxChars 之间）
  const mergedChunks: string[] = [];
  let buffer = '';

  for (const sentence of atomicSentences) {
    if (!buffer) {
      buffer = sentence;
      continue;
    }

    // 若当前 buffer 字数未达到 minChars，且合并后不超过 maxChars，则合并
    if (buffer.length < minChars && buffer.length + sentence.length <= maxChars) {
      buffer += sentence;
    } else {
      mergedChunks.push(buffer);
      buffer = sentence;
    }
  }

  if (buffer) {
    // 检查末尾残留的 buffer 是否过短且可与前一句合并
    if (
      buffer.length < minChars &&
      mergedChunks.length > 0 &&
      mergedChunks[mergedChunks.length - 1].length + buffer.length <= maxChars
    ) {
      mergedChunks[mergedChunks.length - 1] += buffer;
    } else {
      mergedChunks.push(buffer);
    }
  }

  return mergedChunks.filter((chunk) => !isPunctuationOrWhitespaceOnly(chunk));
}
