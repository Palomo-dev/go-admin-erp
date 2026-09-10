/**
 * Cliente Resend cacheado por API key + token bucket 10 req/s (docs-resend.md).
 * SOLO servidor.
 */

import { Resend } from 'resend';

const cache = new Map<string, Resend>();
const MAX_CACHE = 50;

export function getResendClient(apiKey: string): Resend {
  const existing = cache.get(apiKey);
  if (existing) return existing;
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  const client = new Resend(apiKey);
  cache.set(apiKey, client);
  return client;
}

/** Key global (full_access) para dominios, api keys y receiving. */
export function getMasterResendKey(): string | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || /your|placeholder|xxx/i.test(key) || !key.startsWith('re_')) return null;
  return key;
}

export function getMasterResend(): Resend {
  const key = getMasterResendKey();
  if (!key) throw new Error('RESEND_API_KEY no configurada');
  return getResendClient(key);
}

// ─── Token bucket ────────────────────────────────────────────────────────────

export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private capacity = 10, private refillPerSec = 10, now = Date.now) {
    this.tokens = capacity;
    this.last = now();
    this.now = now;
  }
  private now: () => number;

  /** Ms a esperar hasta poder consumir un token (0 si hay). */
  take(): number {
    const t = this.now();
    const elapsed = (t - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    this.last = t;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
  }

  async wait(signal?: AbortSignal): Promise<void> {
    for (;;) {
      const ms = this.take();
      if (ms <= 0) return;
      if (signal?.aborted) throw new Error('aborted');
      await new Promise((r) => setTimeout(r, ms));
    }
  }
}

const globalBucket = new TokenBucket(10, 10);

/** Bucket compartido por proceso (todos los envíos de la misma instancia). */
export function getResendRateLimiter(): TokenBucket {
  return globalBucket;
}
