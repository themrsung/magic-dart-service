import type { Cookies } from '@sveltejs/kit';
import { db } from '../db';
import { randomToken, secureCookies, sha256 } from './config';
import type { Role, SessionUser } from './users';

export const SESSION_COOKIE = 'mds_session';
export const PENDING_COOKIE = 'mds_pending';

/** Signed out after a week without activity, and after 30 days regardless. */
export const IDLE_TTL = 7 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_TTL = 30 * 24 * 60 * 60 * 1000;
/** last_seen_at is only written this often, to keep reads cheap. */
const TOUCH_EVERY = 5 * 60 * 1000;

const PENDING_TTL = 5 * 60 * 1000;
export const PENDING_MAX_ATTEMPTS = 5;

export type LoginMethod = 'password' | 'password+totp' | 'password+passkey' | 'password+recovery' | 'passkey' | 'setup' | 'register';

export interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface SessionInfo {
  id: string;
  user: SessionUser;
  createdAt: number;
}

export function createSession(userId: number, method: LoginMethod, meta: Meta = {}): string {
  const token = randomToken(32);
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, method, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(sha256(token), userId, now, now, now + ABSOLUTE_TTL, method, meta.ip ?? null, meta.userAgent?.slice(0, 200) ?? null);
  return token;
}

/** Resolves a raw cookie value to its session, enforcing idle and absolute expiry. */
export function validateSession(token: string | undefined, now = Date.now()): SessionInfo | null {
  if (!token) return null;
  const id = sha256(token);
  const row = db()
    .prepare(
      `SELECT s.token_hash, s.created_at, s.last_seen_at, s.expires_at, u.id AS user_id, u.username, u.role, u.disabled_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
    )
    .get(id) as
    | { token_hash: string; created_at: number; last_seen_at: number; expires_at: number; user_id: number; username: string; role: Role; disabled_at: number | null }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= now || row.last_seen_at + IDLE_TTL <= now || row.disabled_at) {
    db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(id);
    return null;
  }
  if (now - row.last_seen_at > TOUCH_EVERY) db().prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, id);
  return { id, user: { id: row.user_id, username: row.username, role: row.role }, createdAt: row.created_at };
}

export function revokeSession(id: string): void {
  db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(id);
}

/** Revokes one of the user's sessions by id; returns false if it is not theirs. */
export function revokeOwnSession(userId: number, id: string): boolean {
  return db().prepare('DELETE FROM sessions WHERE token_hash = ? AND user_id = ?').run(id, userId).changes === 1;
}

export function revokeAllSessions(userId: number, exceptId?: string): number {
  return db().prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash IS NOT ?').run(userId, exceptId ?? null).changes;
}

export function listSessions(userId: number) {
  return db()
    .prepare('SELECT token_hash AS id, created_at, last_seen_at, expires_at, method, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC')
    .all(userId) as { id: string; created_at: number; last_seen_at: number; expires_at: number; method: string; ip: string | null; user_agent: string | null }[];
}

/**
 * Replaces the current session with a fresh token (login, privilege change). The old token stops
 * working immediately.
 */
export function rotateSession(cookies: Cookies, url: URL, userId: number, method: LoginMethod, meta: Meta, oldId?: string): string {
  if (oldId) revokeSession(oldId);
  const token = createSession(userId, method, meta);
  setSessionCookie(cookies, url, token);
  return sha256(token);
}

/** Rotation after a privilege change (new factor, new password): keeps the original login method. */
export function rotateCurrentSession(cookies: Cookies, url: URL, userId: number, meta: Meta, currentId: string | null): string {
  const row = currentId ? (db().prepare('SELECT method FROM sessions WHERE token_hash = ?').get(currentId) as { method: LoginMethod } | undefined) : undefined;
  return rotateSession(cookies, url, userId, row?.method ?? 'password', meta, currentId ?? undefined);
}

export function setSessionCookie(cookies: Cookies, url: URL, token: string): void {
  cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: secureCookies(url), maxAge: ABSOLUTE_TTL / 1000 });
}

export function clearSessionCookie(cookies: Cookies, url: URL): void {
  cookies.delete(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: secureCookies(url) });
}

// ── Pending logins (password accepted, second factor owed) ────────────

export function createPendingLogin(cookies: Cookies, url: URL, userId: number): void {
  const token = randomToken(32);
  db().prepare('DELETE FROM login_challenges WHERE user_id = ? OR expires_at < ?').run(userId, Date.now());
  db().prepare('INSERT INTO login_challenges (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now() + PENDING_TTL);
  cookies.set(PENDING_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: secureCookies(url), maxAge: PENDING_TTL / 1000 });
}

export interface PendingLogin {
  id: string;
  userId: number;
  attempts: number;
}

export function readPendingLogin(cookies: Cookies): PendingLogin | null {
  const token = cookies.get(PENDING_COOKIE);
  if (!token) return null;
  const row = db().prepare('SELECT token_hash, user_id, expires_at, attempts FROM login_challenges WHERE token_hash = ?').get(sha256(token)) as
    | { token_hash: string; user_id: number; expires_at: number; attempts: number }
    | undefined;
  if (!row || row.expires_at < Date.now() || row.attempts >= PENDING_MAX_ATTEMPTS) return null;
  return { id: row.token_hash, userId: row.user_id, attempts: row.attempts };
}

/** Counts a failed second-factor attempt; the pending login dies after PENDING_MAX_ATTEMPTS. */
export function failPendingLogin(id: string): number {
  db().prepare('UPDATE login_challenges SET attempts = attempts + 1 WHERE token_hash = ?').run(id);
  const row = db().prepare('SELECT attempts FROM login_challenges WHERE token_hash = ?').get(id) as { attempts: number } | undefined;
  return PENDING_MAX_ATTEMPTS - (row?.attempts ?? PENDING_MAX_ATTEMPTS);
}

export function clearPendingLogin(cookies: Cookies, url: URL, id?: string): void {
  if (id) db().prepare('DELETE FROM login_challenges WHERE token_hash = ?').run(id);
  cookies.delete(PENDING_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: secureCookies(url) });
}

export function purgeSessions(now = Date.now()): void {
  db().prepare('DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?').run(now, now - IDLE_TTL);
  db().prepare('DELETE FROM login_challenges WHERE expires_at < ?').run(now);
  db().prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').run(now);
}
