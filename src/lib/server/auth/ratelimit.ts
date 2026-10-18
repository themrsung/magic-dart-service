/**
 * In-memory limits. The app runs as a single Node process, so this is authoritative; counters reset
 * on restart, which only ever loosens limits briefly.
 */
import { ts } from '../i18n';

interface Window {
  hits: number[];
}

const windows = new Map<string, Window>();

export interface Limit {
  /** Maximum hits per window. */
  max: number;
  windowMs: number;
}

export const LIMITS = {
  loginPerIp: { max: 30, windowMs: 15 * 60 * 1000 },
  secondFactorPerIp: { max: 30, windowMs: 15 * 60 * 1000 },
  registerPerIp: { max: 5, windowMs: 60 * 60 * 1000 },
  setupPerIp: { max: 10, windowMs: 15 * 60 * 1000 },
  oauthRegisterPerIp: { max: 10, windowMs: 60 * 60 * 1000 },
  oauthTokenPerIp: { max: 120, windowMs: 60 * 1000 },
  oauthConsentPerUser: { max: 30, windowMs: 60 * 60 * 1000 },
  sensitivePerUser: { max: 20, windowMs: 15 * 60 * 1000 }
} satisfies Record<string, Limit>;

/** Records a hit. Returns 0 if allowed, otherwise the milliseconds until the next hit would be. */
export function hit(key: string, limit: Limit, now = Date.now()): number {
  const w = windows.get(key) ?? { hits: [] };
  w.hits = w.hits.filter((t) => t > now - limit.windowMs);
  if (w.hits.length >= limit.max) {
    windows.set(key, w);
    return w.hits[0] + limit.windowMs - now;
  }
  w.hits.push(now);
  windows.set(key, w);
  return 0;
}

// ── Per-account lockout ────────────────────────────────────────────────
// Keyed by the submitted username whether or not it exists, so a lockout reveals nothing.

const FREE_FAILURES = 5;
const BASE_LOCK = 60 * 1000;
const MAX_LOCK = 60 * 60 * 1000;
const FORGET_AFTER = 24 * 60 * 60 * 1000;

const failures = new Map<string, { count: number; lockedUntil: number; last: number }>();

/** Milliseconds the account is still locked for, or 0. */
export function lockedFor(account: string, now = Date.now()): number {
  const f = failures.get(account.toLowerCase());
  return f && f.lockedUntil > now ? f.lockedUntil - now : 0;
}

/** After FREE_FAILURES consecutive failures, each further one doubles the lock (1 min … 1 h). */
export function recordFailure(account: string, now = Date.now()): number {
  const key = account.toLowerCase();
  const prev = failures.get(key);
  const f = prev && now - prev.last < FORGET_AFTER ? prev : { count: 0, lockedUntil: 0, last: now };
  f.count++;
  f.last = now;
  if (f.count >= FREE_FAILURES) f.lockedUntil = now + Math.min(MAX_LOCK, BASE_LOCK * 2 ** (f.count - FREE_FAILURES));
  failures.set(key, f);
  return f.lockedUntil > now ? f.lockedUntil - now : 0;
}

export function recordSuccess(account: string): void {
  failures.delete(account.toLowerCase());
}

/** Drops stale entries so memory stays bounded. */
export function sweep(now = Date.now()): void {
  for (const [k, w] of windows) if (!w.hits.some((t) => t > now - MAX_LOCK)) windows.delete(k);
  for (const [k, f] of failures) if (now - f.last > FORGET_AFTER) failures.delete(k);
}

/** For tests. */
export function resetLimits(): void {
  windows.clear();
  failures.clear();
}

export function retryText(ms: number): string {
  const min = Math.ceil(ms / 60000);
  return min <= 1 ? ts('auth.retry.soon') : ts('auth.retry.minutes', { min });
}
