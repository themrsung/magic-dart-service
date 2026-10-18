import { dev } from '$app/environment';
import { openDartBaseUrl } from '../dart';
import { db } from '../db';
import { hashPassword } from './password';
import { randomToken } from './config';
import { findUser, getUser, normalizeUsername, type User } from './users';

/** Seeded on first start so the app works against the mock without pasting a key. */
export const DEV_MOCK_API_KEY = 'mockopendartkey'.padEnd(40, '0');

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Login bypass for local development against the mock OpenDART API: any username and password
 * signs in (as an admin, creating the account if needed) and no second factor is asked for.
 *
 * Both conditions must hold: a `vite dev` server (`dev` is compiled to false in production builds,
 * so this code can't switch on in `node build`), and OPENDART_BASE_URL pointing at a loopback host.
 */
export function bypassAllowed(isDev: boolean, baseUrl: string | undefined): boolean {
  if (!isDev || !baseUrl) return false;
  try {
    const u = new URL(baseUrl);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname);
  } catch {
    return false;
  }
}

export function devAuthBypass(): boolean {
  return bypassAllowed(dev, openDartBaseUrl());
}

/** Finds or creates the account for a bypass login. Usernames are only trimmed and lowercased. */
export async function devUser(rawUsername: string): Promise<User> {
  const username = normalizeUsername(rawUsername).slice(0, 64) || 'dev';
  const existing = findUser(username);
  if (existing) {
    if (existing.disabled_at || existing.role !== 'admin') db().prepare(`UPDATE users SET disabled_at = NULL, role = 'admin' WHERE id = ?`).run(existing.id);
    return getUser(existing.id)!;
  }
  const now = Date.now();
  const id = db()
    .prepare(
      `INSERT INTO users (username, password_hash, role, webauthn_user_id, created_at, password_changed_at)
       VALUES (?, ?, 'admin', ?, ?, ?)`
    )
    .run(username, await hashPassword(randomToken(24)), randomToken(16), now, now).lastInsertRowid;
  return getUser(Number(id))!;
}
