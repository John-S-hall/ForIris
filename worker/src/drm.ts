/**
 * Sec-MS-GEC v2 DRM token generator & MUID helper for Edge TTS.
 * Pure Web Standards / TypedArray implementation (zero Node.js dependencies).
 */

export const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
export const CHROMIUM_FULL_VERSION = "143.0.3650.75";
export const CHROMIUM_MAJOR_VERSION = "143";
export const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;

const WIN_EPOCH = 11644473600n;
const TICKS_PER_SEC = 10_000_000n;

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA256_STATE = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a,
  0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2,
] as const;

const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba,
  0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6,
  0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564,
] as const;

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const SHA256_ADJ = 0xc9dc06a7;
const K_BLOCK = [...K.slice(0, 14), SHA256_ADJ, ...K.slice(15)];

const CS64_COEFFICIENTS: ReadonlyArray<readonly [number, number]> = [
  [0xe82e91b1, 0xb32700d0],
  [0x44de24c6, 0x88dff51d],
  [0x3beb65bc, 0x29514038],
  [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5],
  [0x314ef5d5, 0x26e55f3c],
  [0xe92491b1, 0x607801c6],
  [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da],
  [0xda79fa60, 0x207cc464],
  [0xbed20560, 0x3c3c74f3],
  [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1],
  [0xcb49e3c6, 0xc5626167],
];

const rotr = (v: number, n: number): number => ((v >>> n) | (v << (32 - n))) >>> 0;
const rol16 = (v: number): number => ((v << 16) | (v >>> 16)) >>> 0;
const sigma0 = (v: number): number => (rotr(v, 7) ^ rotr(v, 18) ^ (v >>> 3)) >>> 0;
const sigma1 = (v: number): number => (rotr(v, 17) ^ rotr(v, 19) ^ (v >>> 10)) >>> 0;
const bigSigma0 = (v: number): number => (rotr(v, 2) ^ rotr(v, 13) ^ rotr(v, 22)) >>> 0;
const bigSigma1 = (v: number): number => (rotr(v, 6) ^ rotr(v, 11) ^ rotr(v, 25)) >>> 0;

function sha256Rounds(state: readonly number[], words: number[], firstRound = 0): number[] {
  let [a, b, c, d, e, f, g, h] = state;
  const kc = firstRound === 14 ? K_BLOCK : K;
  for (let i = firstRound; i < 64; i++) {
    const t1 = (h + bigSigma1(e) + ((g ^ (e & (f ^ g))) >>> 0) + kc[i] + words[i]) >>> 0;
    const t2 = (bigSigma0(a) + (((a & b) | (c & (a | b))) >>> 0)) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function expandSha256Schedule(words: number[], firstWord = 16): void {
  for (let i = firstWord; i < 64; i++) {
    words.push((sigma1(words[i - 2]) + words[i - 7] + sigma0(words[i - 15]) + words[i - 16]) >>> 0);
  }
}

function sha256Init(head: Uint8Array): number[] {
  const words = new Array<number>(14).fill(0);
  words.push(((head[0] << 16) | (head[1] << 8) | head[2]) >>> 0);
  words.push(((head[3] << 24) | (head[4] << 16) | (head[5] << 8) | head[6]) >>> 0);

  for (let i = 16; i < 30; i++) {
    let val = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) {
      val = (val + (i === 16 ? (sigma1(words[i - 2]) ^ 0x000b92c0) >>> 0 : sigma1(words[i - 2]))) >>> 0;
    }
    if (i - 7 >= 14) {
      val = (val + words[i - 7]) >>> 0;
    }
    if (i - 15 >= 14) {
      val = (val + (i === 29 ? (sigma0(words[i - 15]) ^ 0x059c0b80) >>> 0 : sigma0(words[i - 15]))) >>> 0;
    }
    words.push(val >>> 0);
  }

  words.push(
    (sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + SHA256_ADJ - K[14]) >>> 0
  );
  expandSha256Schedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, idx) => (x + working[idx]) >>> 0);
}

function sha256Digest(data: Uint8Array): Uint8Array {
  if (data.length < 7) {
    throw new Error("Token payload too short");
  }
  const len = 57 + data.length;
  const rem = data.subarray(7);
  const padZeros = (((55 - len) % 64) + 64) % 64;
  const padded = new Uint8Array(rem.length + 1 + padZeros + 8);
  padded.set(rem, 0);
  padded[rem.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setBigUint64(padded.length - 8, BigInt(len) * 8n, false);

  let state = sha256Init(data.subarray(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const words: number[] = [];
    for (let j = 0; j < 16; j++) {
      words.push(dv.getUint32(off + j * 4, false));
    }
    expandSha256Schedule(words, 16);
    const working = sha256Rounds(state, words, 0);
    state = state.map((x, idx) => (x + working[idx]) >>> 0);
  }

  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  state.forEach((v, idx) => odv.setUint32(idx * 4, v, false));
  return out;
}

function wordsLe4Even(data: Uint8Array): number[] {
  const pad = ((-data.length % 4) + 4) % 4;
  const buf = new Uint8Array(data.length + pad);
  buf.set(data, 0);
  const dv = new DataView(buf.buffer);
  const words: number[] = [];
  for (let i = 0; i < buf.length; i += 4) {
    words.push(dv.getUint32(i, true));
  }
  if (words.length % 2 === 1) {
    words.push(0);
  }
  return words;
}

function cs64Digest(data: Uint8Array, digest: Uint8Array): Uint8Array {
  const ddv = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const keyA = (ddv.getUint32(0, true) | 1) >>> 0;
  const keyB = (ddv.getUint32(4, true) | 1) >>> 0;
  const factors = [
    Math.imul(keyA, 0x82893933) >>> 0,
    Math.imul(keyB, 0x82893933) >>> 0,
  ];
  const terms = CS64_COEFFICIENTS.map(([c], i) => Math.imul(c, factors[i % 2]) >>> 0);
  const offsets = CS64_COEFFICIENTS.map(([, o]) => o >>> 0);

  const prefixed = new Uint8Array(1 + data.length);
  prefixed[0] = 0;
  prefixed.set(data, 1);

  const words = wordsLe4Even(prefixed);
  words.forEach((word, i) => {
    let term = Math.imul(word, i % 2 === 0 ? keyA : keyB) >>> 0;
    let off = Math.imul(rol16(word), i % 2 === 0 ? 0xef0569fb : 0xc31713db) >>> 0;
    if (i === 0) {
      term = (term + (Math.imul(0xf2f90b1a, factors[0]) >>> 0)) >>> 0;
      off = (off + 0x0b1a0000) >>> 0;
    }
    terms.push(term);
    offsets.push(off);
  });

  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;

  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];

    let t = rol16((offsets[i] + x) >>> 0);
    let q = Math.imul(t, 0x76f50f34) >>> 0;
    swapAcc = (swapAcc + (((Math.imul(rol16(q), 0xc3efea97) >>> 0) + q) >>> 0)) >>> 0;

    t = rol16((offsets[i + 1] + y) >>> 0);
    q = Math.imul(t, 0x1881ce3c) >>> 0;
    swapLast = ((Math.imul(rol16(q), 0x35bd1ec9) >>> 0) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = ((Math.imul(state, keyA) >>> 0) + x) >>> 0;
    state = Math.imul(rol16(state), 0xcf98b111) >>> 0;
    state = Math.imul(rol16(state), 0x87085b9f) >>> 0;
    state = Math.imul(rol16(state), 0x12ceb96d) >>> 0;
    state = Math.imul(rol16(state), 0x257e1d83) >>> 0;
    acc = (acc + state) >>> 0;

    t = ((Math.imul(state, keyB) >>> 0) + y) >>> 0;
    t = Math.imul(rol16(t), 0xa27416f5) >>> 0;
    t = Math.imul(rol16(t), 0xd38396ff) >>> 0;
    state = Math.imul(rol16(Math.imul(rol16(t), 0x7c932b89) >>> 0), 0xbfa49f69) >>> 0;
    acc = (acc + state) >>> 0;
  }

  const out = new Uint8Array(8);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, (swapLast ^ state) >>> 0, true);
  odv.setUint32(4, (swapAcc ^ acc) >>> 0, true);
  return out;
}

function toUpperHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function generateSecMsGecV2(clockSkewSec = 0): string {
  const nowSec = BigInt(Math.floor(Date.now() / 1000 + clockSkewSec));
  let ticks = nowSec + WIN_EPOCH;
  ticks -= ticks % 300n;
  ticks *= TICKS_PER_SEC;

  const strBytes = new TextEncoder().encode(`${ticks.toString()}${TRUSTED_CLIENT_TOKEN}`);
  const digest = sha256Digest(strBytes);
  const cs64 = cs64Digest(strBytes, digest);
  return `${toUpperHex(cs64)}-${toUpperHex(digest)}`;
}

export function generateMuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toUpperHex(bytes);
}
