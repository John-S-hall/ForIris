/**
 * Cloudflare Worker — Edge TTS Proxy
 *
 * GET /tts?text=...&voice=...&rate=...&token=...
 *   → Connects to Microsoft Edge TTS via WebSocket (Sec-MS-GEC v2)
 *   → Returns synthesized audio as audio/mpeg
 *
 * GET /health  → { "status": "ok" }
 *
 * Auth: `token` query param must match env.AUTH_TOKEN (default "dev-secret").
 */

import {
  CHROMIUM_MAJOR_VERSION,
  SEC_MS_GEC_VERSION,
  TRUSTED_CLIENT_TOKEN,
  generateMuid,
  generateSecMsGecV2,
} from "./drm";

// ─── Constants ────────────────────────────────────────────────────────

const EDGE_TTS_HTTPS_BASE =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const SYNTHESIS_TIMEOUT_MS = 15_000;
const MAX_TEXT_LENGTH = 2000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

let clockSkewSec = 0;

// ─── Types ────────────────────────────────────────────────────────────

interface Env {
  AUTH_TOKEN?: string;
}

// ─── Utility helpers ──────────────────────────────────────────────────

/** UUID without hyphens, used as ConnectionId / RequestId. */
function newId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build SSML payload. `rate` is a multiplier (1.0 = normal). */
function buildSSML(text: string, voice: string, rate: number): string {
  const pct = Math.round((rate - 1) * 100);
  const rateStr = pct >= 0 ? `+${pct}%` : `${pct}%`;
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
    `<voice name='${escapeXml(voice)}'>` +
    `<prosody rate='${rateStr}'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  );
}

/**
 * Parse a binary WebSocket frame from Edge TTS.
 * Layout: [ 2-byte BE header-length ][ header bytes ][ audio payload ]
 */
function extractAudioPayload(data: Uint8Array): Uint8Array | null {
  if (data.length < 2) return null;
  const headerLen = (data[0] << 8) | data[1];
  const audioStart = 2 + headerLen;
  if (audioStart >= data.length) return null;
  return data.slice(audioStart);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// ─── Edge TTS synthesis via WebSocket ─────────────────────────────────

async function openEdgeWebSocket(allowSkewRetry = true): Promise<WebSocket> {
  const connId = newId();
  const gec = generateSecMsGecV2(clockSkewSec);

  const wsUrl =
    `${EDGE_TTS_HTTPS_BASE}` +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${gec}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
    `&ConnectionId=${connId}`;

  const resp = await fetch(wsUrl, {
    headers: {
      Upgrade: "websocket",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent":
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
        `(KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: `muid=${generateMuid()};`,
    },
  });

  if (resp.webSocket) {
    resp.webSocket.accept();
    try {
      (resp.webSocket as unknown as { binaryType?: string }).binaryType =
        "arraybuffer";
    } catch {
      /* ignore if runtime disallows setting binaryType */
    }
    return resp.webSocket;
  }

  // 时钟偏移自动校准：403 时解析服务端 Date 头校准一次并重试
  if (allowSkewRetry && resp.status === 403) {
    const serverDate = resp.headers.get("Date");
    if (serverDate) {
      const serverMs = Date.parse(serverDate);
      if (Number.isFinite(serverMs)) {
        clockSkewSec = serverMs / 1000 - Date.now() / 1000;
        return openEdgeWebSocket(false);
      }
    }
  }

  throw new Error(`Edge TTS upstream HTTP ${resp.status} ${resp.statusText || ""}`.trim());
}

async function synthesize(
  text: string,
  voice: string,
  rate: number,
): Promise<Uint8Array> {
  const ws = await openEdgeWebSocket(true);

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunkTasks: Array<Promise<Uint8Array | null>> = [];
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error("TTS synthesis timed out"));
      });
    }, SYNTHESIS_TIMEOUT_MS);

    const finalizeAudio = (emptyError: string) => {
      finish(() => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        void Promise.all(chunkTasks).then(
          (parts) => {
            const valid = parts.filter(
              (p): p is Uint8Array => p !== null && p.byteLength > 0,
            );
            const out = concat(valid);
            if (out.byteLength === 0) {
              reject(new Error(emptyError));
              return;
            }
            resolve(out);
          },
          (err) => {
            reject(err instanceof Error ? err : new Error(String(err)));
          },
        );
      });
    };

    const sendSynthesisMessages = () => {
      try {
        // 1. speech.config
        const configPayload = JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: OUTPUT_FORMAT,
              },
            },
          },
        });
        ws.send(
          `X-Timestamp:${new Date().toISOString()}\r\n` +
            `Content-Type:application/json; charset=utf-8\r\n` +
            `Path:speech.config\r\n\r\n${configPayload}`,
        );

        // 2. SSML
        const reqId = newId();
        const ts = new Date().toISOString();
        const ssml = buildSSML(text, voice, rate);
        ws.send(
          `X-RequestId:${reqId}\r\n` +
            `Content-Type:application/ssml+xml\r\n` +
            `X-Timestamp:${ts}\r\n` +
            `Path:ssml\r\n\r\n${ssml}`,
        );
      } catch (sendErr: unknown) {
        finish(() => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          reject(sendErr instanceof Error ? sendErr : new Error(String(sendErr)));
        });
      }
    };

    const onMessage = (evt: MessageEvent) => {
      if (settled) return;

      if (typeof evt.data === "string") {
        if (evt.data.includes("Path:turn.end")) {
          finalizeAudio("Edge TTS returned empty audio");
        }
      } else if (evt.data instanceof ArrayBuffer) {
        chunkTasks.push(
          Promise.resolve(extractAudioPayload(new Uint8Array(evt.data))),
        );
      } else if (ArrayBuffer.isView(evt.data)) {
        const view = evt.data;
        chunkTasks.push(
          Promise.resolve(
            extractAudioPayload(
              new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
            ),
          ),
        );
      } else if (typeof Blob !== "undefined" && evt.data instanceof Blob) {
        const blob = evt.data;
        chunkTasks.push(
          blob.arrayBuffer().then((buf) => extractAudioPayload(new Uint8Array(buf))),
        );
      }
    };

    const onClose = () => {
      finalizeAudio("WebSocket closed before receiving audio data");
    };

    const onError = () => {
      finish(() => reject(new Error("WebSocket error during TTS synthesis")));
    };

    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);

    // CF Workers fetch-upgrade 返回的 WebSocket 在 accept() 后已处于可用状态
    sendSynthesisMessages();
  });
}

// ─── Worker entry ─────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" }, { headers: CORS_HEADERS });
    }

    // Only handle /tts
    if (url.pathname !== "/tts") {
      return new Response("Not Found", {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    // ─ Auth ─
    const token = url.searchParams.get("token");
    const expected = env.AUTH_TOKEN || "dev-secret";
    if (!token || token !== expected) {
      return new Response("Unauthorized: missing or invalid token", {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    // ─ Validate params ─
    const text = url.searchParams.get("text");
    if (!text || text.trim().length === 0) {
      return new Response("Bad Request: 'text' parameter is required", {
        status: 400,
        headers: CORS_HEADERS,
      });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return new Response(
        `Bad Request: 'text' exceeds maximum length of ${MAX_TEXT_LENGTH}`,
        {
          status: 400,
          headers: CORS_HEADERS,
        },
      );
    }

    const voice =
      url.searchParams.get("voice") || "zh-CN-XiaoxiaoNeural";
    const requestedRate = Number.parseFloat(
      url.searchParams.get("rate") || "1.2",
    );
    const rate = Number.isFinite(requestedRate)
      ? Math.max(0.5, Math.min(2.5, requestedRate))
      : 1.2;

    // ─ Synthesize ─
    try {
      const audio = await synthesize(text, voice, rate);
      return new Response(audio, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(audio.byteLength),
          "Cache-Control": "private, max-age=86400",
          ...CORS_HEADERS,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[TTS Error]", msg);
      return new Response(`TTS synthesis failed: ${msg}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
  },
} satisfies ExportedHandler<Env>;
