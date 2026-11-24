export interface ChunkerOptions {
  /** 最小期望单句字数，默认 30 */
  minChars?: number;
  /** 最大单句字数上限，默认 120 */
  maxChars?: number;
}

export interface ChunkSegment {
  paragraphIndex: number;
  text: string;
}

export interface StructuredChunk {
  index: number;
  text: string;
  segments: ChunkSegment[];
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
 * 将文本切分为不超过 maxChars 的原子短句（保留原有切分与标点过滤逻辑）
 */
function splitTextToAtomicSentences(rawText: string, maxChars: number): string[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

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

  return atomicSentences;
}

function appendSegment(target: ChunkSegment[], seg: ChunkSegment): void {
  const last = target[target.length - 1];
  if (last && last.paragraphIndex === seg.paragraphIndex) {
    last.text += seg.text;
  } else {
    target.push({ paragraphIndex: seg.paragraphIndex, text: seg.text });
  }
}

/**
 * 结构化分句函数（保留每个片段对应的原段落索引，用于阅读模式精准句级渲染与高亮）
 */
export function chunkParagraphs(
  paragraphs: string[],
  options?: ChunkerOptions
): StructuredChunk[] {
  const minChars = options?.minChars ?? DEFAULT_MIN_CHARS;
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;

  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return [];
  }

  const atomicSegments: ChunkSegment[] = [];
  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const pieces = splitTextToAtomicSentences(paragraphs[paragraphIndex], maxChars);
    for (const piece of pieces) {
      atomicSegments.push({ paragraphIndex, text: piece });
    }
  }

  if (atomicSegments.length === 0) {
    return [];
  }

  const merged: StructuredChunk[] = [];
  let bufferText = '';
  let bufferSegments: ChunkSegment[] = [];

  for (const seg of atomicSegments) {
    if (!bufferText) {
      bufferText = seg.text;
      bufferSegments = [{ paragraphIndex: seg.paragraphIndex, text: seg.text }];
      continue;
    }

    if (bufferText.length < minChars && bufferText.length + seg.text.length <= maxChars) {
      bufferText += seg.text;
      appendSegment(bufferSegments, seg);
    } else {
      merged.push({
        index: merged.length,
        text: bufferText,
        segments: bufferSegments,
      });
      bufferText = seg.text;
      bufferSegments = [{ paragraphIndex: seg.paragraphIndex, text: seg.text }];
    }
  }

  if (bufferText) {
    if (
      bufferText.length < minChars &&
      merged.length > 0 &&
      merged[merged.length - 1].text.length + bufferText.length <= maxChars
    ) {
      const prev = merged[merged.length - 1];
      prev.text += bufferText;
      for (const seg of bufferSegments) {
        appendSegment(prev.segments, seg);
      }
    } else {
      merged.push({
        index: merged.length,
        text: bufferText,
        segments: bufferSegments,
      });
    }
  }

  const filtered = merged.filter((chunk) => !isPunctuationOrWhitespaceOnly(chunk.text));
  filtered.forEach((chunk, idx) => {
    chunk.index = idx;
  });
  return filtered;
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
  const paragraphs = Array.isArray(input) ? input : [input];
  return chunkParagraphs(paragraphs, options).map((chunk) => chunk.text);
}
