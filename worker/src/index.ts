/**
 * Cloudflare Worker — Edge TTS Proxy
 *
 * GET /tts?text=...&voice=...&rate=...&token=...
 *   → Connects to Microsoft Edge TTS via WebSocket
 *   → Returns synthesized audio as audio/mpeg
 *
 * GET /health  → { "status": "ok" }
 *
 * Auth: `token` query param must match env.AUTH_TOKEN (default "dev-secret").
 */

// ─── Constants ────────────────────────────────────────────────────────

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
// Keep this in sync with a recent Chromium-based Edge build. Microsoft rejects
// otherwise valid Sec-MS-GEC hashes when this value becomes too old.
const SEC_MS_GEC_VERSION = "1-143.0.3650.75";
const WSS_BASE = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const SYNTHESIS_TIMEOUT_MS = 15_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ─── Types ────────────────────────────────────────────────────────────

interface Env {
  AUTH_TOKEN?: string;
}

// ─── Utility helpers ──────────────────────────────────────────────────

/** UUID without hyphens, used as ConnectionId / RequestId. */
function newId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Compute Sec-MS-GEC token.
 * Algorithm: SHA-256( roundedWindowsTicks + TrustedClientToken )
 * where ticks are 100-ns intervals since 0001-01-01, rounded to 5-min.
 */
async function generateSecMsGec(): Promise<string> {
  const WIN_EPOCH = 11644473600n;
  const TICKS_PER_SEC = 10_000_000n;
  const ROUND = 3_000_000_000n;

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const ticks = (nowSec + WIN_EPOCH) * TICKS_PER_SEC;
  const rounded = ticks - (ticks % ROUND);

  const payload = new TextEncoder().encode(
    `${rounded}${TRUSTED_CLIENT_TOKEN}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
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

async function synthesize(
  text: string,
  voice: string,
  rate: number,
): Promise<Uint8Array> {
  const connId = newId();
  const gec = await generateSecMsGec();

  const wsUrl =
    `${WSS_BASE}` +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${gec}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
    `&ConnectionId=${connId}`;

  // Try CF Workers fetch-upgrade first; fall back to standard WebSocket
  let ws: WebSocket;
  try {
    const resp = await fetch(wsUrl.replace("wss://", "https://"), {
      headers: { Upgrade: "websocket" },
    });
    if (resp.webSocket) {
      ws = resp.webSocket;
      ws.accept();
    } else {
      throw new Error("fetch upgrade returned no webSocket property");
    }
  } catch {
    // Fallback: standard WebSocket constructor (works in workerd with
    // nodejs_compat flag and recent compat dates)
    ws = new WebSocket(wsUrl);
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
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
        } catch { /* ignore */ }
        reject(new Error("TTS synthesis timed out"));
      });
    }, SYNTHESIS_TIMEOUT_MS);

    // ── Handler to send config + SSML once connected ──
    const onOpen = () => {
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
    };

    // ── Handler for incoming data ──
    const onMessage = (evt: MessageEvent) => {
      if (settled) return;

      if (typeof evt.data === "string") {
        if (evt.data.includes("Path:turn.end")) {
          finish(() => {
            try {
              ws.close();
            } catch { /* ignore */ }
            resolve(concat(chunks));
          });
        }
      } else {
        // Binary frame — could be ArrayBuffer or Buffer (Node compat)
        let bytes: Uint8Array;
        if (evt.data instanceof ArrayBuffer) {
          bytes = new Uint8Array(evt.data);
        } else if (ArrayBuffer.isView(evt.data)) {
          bytes = new Uint8Array(
            evt.data.buffer,
            evt.data.byteOffset,
            evt.data.byteLength,
          );
        } else {
          return; // unknown type, skip
        }
        const audio = extractAudioPayload(bytes);
        if (audio && audio.length > 0) {
          chunks.push(audio);
        }
      }
    };

    const onClose = () => {
      finish(() => {
        if (chunks.length > 0) {
          resolve(concat(chunks));
        } else {
          reject(new Error("WebSocket closed before receiving audio data"));
        }
      });
    };

    const onError = () => {
      finish(() =>
        reject(new Error("WebSocket error during TTS synthesis")),
      );
    };

    // For CF Workers' accepted websocket, `open` has already fired.
    // Check readyState to decide whether we need an open listener.
    if ((ws as any).readyState === 1 /* OPEN */) {
      onOpen();
    } else {
      ws.addEventListener("open", onOpen);
    }
    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);
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
          "Cache-Control": "public, max-age=86400",
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
