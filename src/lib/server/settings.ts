import { seal, unseal } from './auth/config';
import { db } from './db';
import { hostIdDigest, hostIdSource } from './hostid';
import { ts } from './i18n';

const API_KEY = 'opendart_api_key';
const PURPOSE = 'opendart-api-key-v1';

/** Daily request budget for scheduled (automatic) pulls. */
export const AUTO_DAILY_BUDGET = Number(process.env.AUTO_DAILY_BUDGET ?? 2000);
/** Hard stop for all traffic in one KST day, kept below OpenDART's ~20k/day quota. */
export const TOTAL_DAILY_CAP = Number(process.env.TOTAL_DAILY_CAP ?? 18000);

/**
 * How the stored key is protected (API_KEY_HOST_BINDING):
 * - auto (default): AES-256-GCM with a key derived from APP_SECRET and, when one is available,
 *   the host's machine identifier;
 * - required: refuse to store the key unless a host identifier is available;
 * - off: APP_SECRET only (the database can then move to another host together with APP_SECRET).
 *
 * Stored as `enc:h:<sealed>` (host-bound) or `enc:s:<sealed>` (APP_SECRET only).
 */
export type HostBinding = 'auto' | 'required' | 'off';
export type KeyProtection = 'host' | 'secret' | 'plaintext';

export function hostBindingMode(): HostBinding {
  const v = (process.env.API_KEY_HOST_BINDING ?? 'auto').toLowerCase();
  return v === 'required' || v === 'off' ? v : 'auto';
}

export class ApiKeyStorageError extends Error {}

let keyVersion = 0;
/** Why a stored key can't be used; turned into text per request so it follows the user's language. */
type KeyError = 'host' | 'secret' | null;

let cache: { stored: string; host: string; key: string | undefined; error: KeyError } | undefined;

function storedRow(): { value: string; updated_at: number } | undefined {
  return db().prepare('SELECT value, updated_at FROM settings WHERE key = ?').get(API_KEY) as { value: string; updated_at: number } | undefined;
}

function protectionOf(stored: string): KeyProtection {
  return stored.startsWith('enc:h:') ? 'host' : stored.startsWith('enc:s:') ? 'secret' : 'plaintext';
}

function encode(key: string): string {
  const mode = hostBindingMode();
  const host = mode === 'off' ? null : hostIdDigest();
  if (mode === 'required' && !host)
    throw new ApiKeyStorageError(ts('admin.key.bindingRequired'));
  return host ? `enc:h:${seal(key, PURPOSE, host)}` : `enc:s:${seal(key, PURPOSE)}`;
}

function decode(stored: string): string {
  const protection = protectionOf(stored);
  if (protection === 'plaintext') return stored;
  if (protection === 'host') {
    const host = hostIdDigest();
    if (!host) throw new Error('host identifier unavailable');
    return unseal(stored.slice(6), PURPOSE, host);
  }
  return unseal(stored.slice(6), PURPOSE);
}

function put(stored: string, updatedAt = Date.now()): void {
  db()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(API_KEY, stored, updatedAt);
}

function load(): { key: string | undefined; error: KeyError } {
  const row = storedRow();
  if (!row) return { key: undefined, error: null };
  const host = hostIdDigest()?.toString('hex') ?? '';
  if (cache?.stored === row.value && cache.host === host) return cache;
  let result: { key: string | undefined; error: KeyError };
  try {
    const key = decode(row.value);
    result = { key, error: null };
    // Upgrade a plaintext or weaker copy in place, keeping its original timestamp.
    const want = hostBindingMode() !== 'off' && hostIdDigest() ? 'host' : 'secret';
    const have = protectionOf(row.value);
    if (have === 'plaintext' || (have === 'secret' && want === 'host')) {
      const upgraded = encode(key);
      put(upgraded, row.updated_at);
      cache = { stored: upgraded, host, ...result };
      return result;
    }
  } catch {
    // Different APP_SECRET, different host, or a missing HOST_ID_FILE mount.
    result = { key: undefined, error: protectionOf(row.value) === 'host' ? 'host' : 'secret' };
  }
  cache = { stored: row.value, host, ...result };
  return result;
}

/** For tests (e.g. after swapping APP_SECRET). */
export function resetApiKeyCache(): void {
  cache = undefined;
}

/** Server-side only. Never return this from an endpoint, log it, or put it in an error. */
export function readApiKey(): string | undefined {
  return load().key;
}

export function writeApiKey(key: string): void {
  put(encode(key));
  cache = undefined;
  keyVersion++;
}

/** Bumps whenever the key changes so cached clients can be rebuilt. */
export function apiKeyVersion(): number {
  return keyVersion;
}

/** Safe to show to admins: never contains the key. `configured` means a usable key exists. */
export function apiKeyStatus(): {
  configured: boolean;
  stored: boolean;
  updatedAt: number | null;
  protection: KeyProtection | null;
  error: string | null;
  binding: HostBinding;
  hostSource: string | null;
} {
  const { key, error } = load();
  const row = storedRow();
  return {
    configured: !!key,
    stored: !!row,
    updatedAt: row?.updated_at ?? null,
    protection: row ? protectionOf(row.value) : null,
    error: error === 'host' ? ts('admin.key.decryptHost') : error === 'secret' ? ts('admin.key.decryptSecret') : null,
    binding: hostBindingMode(),
    hostSource: hostBindingMode() === 'off' ? null : hostIdSource()
  };
}

export function isPlausibleApiKey(key: string): boolean {
  return /^[0-9a-zA-Z]{40}$/.test(key);
}

/** Masks anything that looks like a crtfc_key, as a last line of defence for logs and messages. */
export function redact(text: string): string {
  return text.replace(/crtfc_key=[^&\s"']+/g, 'crtfc_key=***').replace(/\b[0-9a-f]{40}\b/gi, '***');
}
