import { ts } from '../i18n';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../db';
import { appOrigin, randomToken, registrationMode, sha256 } from './config';
import { hashPassword, passwordProblem } from './password';

export type Role = 'admin' | 'user';

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  webauthn_user_id: string;
  totp_secret: string | null;
  totp_pending: string | null;
  totp_last_step: number | null;
  created_at: number;
  password_changed_at: number;
  disabled_at: number | null;
}

/** What request handlers see as `locals.user`. */
export interface SessionUser {
  id: number;
  username: string;
  role: Role;
}

export class AuthError extends Error {}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function usernameProblem(username: string): string | null {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ? null : ts('auth.error.usernameRule');
}

export function userCount(): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function getUser(id: number): User | undefined {
  return db().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function findUser(username: string): User | undefined {
  return db().prepare('SELECT * FROM users WHERE username = ?').get(normalizeUsername(username)) as User | undefined;
}

export async function createUser(rawUsername: string, password: string, role: Role): Promise<User> {
  const username = normalizeUsername(rawUsername);
  const problem = usernameProblem(username) ?? passwordProblem(password, username);
  if (problem) throw new AuthError(problem);
  if (findUser(username)) throw new AuthError(ts('auth.error.usernameTaken'));
  const now = Date.now();
  const hash = await hashPassword(password);
  const id = db()
    .prepare(
      `INSERT INTO users (username, password_hash, role, webauthn_user_id, created_at, password_changed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(username, hash, role, randomToken(16), now, now).lastInsertRowid;
  return getUser(Number(id))!;
}

export async function setPassword(userId: number, password: string): Promise<void> {
  const user = getUser(userId);
  if (!user) throw new AuthError(ts('auth.error.userNotFound'));
  const problem = passwordProblem(password, user.username);
  if (problem) throw new AuthError(problem);
  db().prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(await hashPassword(password), Date.now(), userId);
}

export function listUsers() {
  return db()
    .prepare(
      `SELECT u.id, u.username, u.role, u.created_at, u.disabled_at, u.totp_secret IS NOT NULL AS totp,
              (SELECT COUNT(*) FROM webauthn_credentials w WHERE w.user_id = u.id) AS passkeys,
              (SELECT MAX(last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at
       FROM users u ORDER BY u.created_at`
    )
    .all() as {
    id: number;
    username: string;
    role: Role;
    created_at: number;
    disabled_at: number | null;
    totp: number;
    passkeys: number;
    last_seen_at: number | null;
  }[];
}

function activeAdmins(): number {
  return (db().prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL`).get() as { n: number }).n;
}

/** Disabling signs the user out everywhere and cuts off their MCP clients. */
export function setDisabled(userId: number, disabled: boolean): void {
  const user = getUser(userId);
  if (!user) throw new AuthError(ts('auth.error.userNotFound'));
  if (disabled && user.role === 'admin' && !user.disabled_at && activeAdmins() <= 1) throw new AuthError(ts('auth.error.lastAdminDisable'));
  db().transaction(() => {
    db().prepare('UPDATE users SET disabled_at = ? WHERE id = ?').run(disabled ? Date.now() : null, userId);
    if (disabled) {
      db().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      db().prepare('DELETE FROM login_challenges WHERE user_id = ?').run(userId);
      db().prepare('DELETE FROM oauth_tokens WHERE user_id = ?').run(userId);
      db().prepare('DELETE FROM oauth_codes WHERE user_id = ?').run(userId);
    }
  })();
}

/** A role change is a privilege change: the user's sessions are ended so they sign in again. */
export function setRole(userId: number, role: Role): void {
  const user = getUser(userId);
  if (!user) throw new AuthError(ts('auth.error.userNotFound'));
  if (user.role === role) return;
  if (user.role === 'admin' && !user.disabled_at && activeAdmins() <= 1) throw new AuthError(ts('auth.error.lastAdminRole'));
  db().transaction(() => {
    db().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    db().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  })();
}

export function hasSecondFactor(userId: number): boolean {
  const u = getUser(userId);
  if (!u) return false;
  if (u.totp_secret) return true;
  return !!db().prepare('SELECT 1 FROM webauthn_credentials WHERE user_id = ? LIMIT 1').get(userId);
}

// ── First-run setup ────────────────────────────────────────────────────

let setupToken: string | undefined;

/** SETUP_TOKEN if given, otherwise a random token that lives until the first admin exists. */
export function currentSetupToken(): string | null {
  if (userCount() > 0) return null;
  setupToken ??= process.env.SETUP_TOKEN || randomToken(18);
  return setupToken;
}

export function announceSetup(): void {
  const token = currentSetupToken();
  if (!token) return;
  const origin = (() => {
    try {
      return appOrigin();
    } catch {
      return '(ORIGIN)';
    }
  })();
  const shown = process.env.SETUP_TOKEN ? '(the value of SETUP_TOKEN)' : token;
  console.log(`[auth] No accounts yet. Open ${origin}/setup and enter setup token: ${shown}`);
}

export function checkSetupToken(candidate: string): boolean {
  const token = currentSetupToken();
  if (!token) return false;
  const a = Buffer.from(sha256(candidate));
  const b = Buffer.from(sha256(token));
  return timingSafeEqual(a, b);
}

export function setupDone(): void {
  setupToken = undefined;
}

// ── Invites ────────────────────────────────────────────────────────────

const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;

export function createInvite(createdBy: number, role: Role, note: string | null): string {
  const token = randomToken(24);
  const now = Date.now();
  db()
    .prepare('INSERT INTO invites (token_hash, role, note, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha256(token), role, note?.slice(0, 100) || null, createdBy, now, now + INVITE_TTL);
  return token;
}

export interface Invite {
  token_hash: string;
  role: Role;
  note: string | null;
  created_by: number | null;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  used_by: number | null;
  revoked_at: number | null;
}

export function findValidInvite(token: string): Invite | undefined {
  const row = db().prepare('SELECT * FROM invites WHERE token_hash = ?').get(sha256(token)) as Invite | undefined;
  if (!row || row.used_at || row.revoked_at || row.expires_at < Date.now()) return undefined;
  return row;
}

export function listInvites() {
  return db()
    .prepare(
      `SELECT i.token_hash, i.role, i.note, i.created_at, i.expires_at, i.used_at, i.revoked_at, u.username AS used_by_name
       FROM invites i LEFT JOIN users u ON u.id = i.used_by
       WHERE i.created_at > ? ORDER BY i.created_at DESC`
    )
    .all(Date.now() - 30 * 24 * 60 * 60 * 1000) as {
    token_hash: string;
    role: Role;
    note: string | null;
    created_at: number;
    expires_at: number;
    used_at: number | null;
    revoked_at: number | null;
    used_by_name: string | null;
  }[];
}

export function revokeInvite(tokenHash: string): void {
  db().prepare('UPDATE invites SET revoked_at = ? WHERE token_hash = ? AND used_at IS NULL').run(Date.now(), tokenHash);
}

/**
 * Creates an account through /register: with a valid invite (its role applies), or without one when
 * REGISTRATION=open. The invite is consumed atomically with the account.
 */
export async function register(username: string, password: string, inviteToken: string | null): Promise<User> {
  const mode = registrationMode();
  if (mode === 'closed') throw new AuthError(ts('auth.register.closed'));
  const invite = inviteToken ? findValidInvite(inviteToken) : undefined;
  if (inviteToken && !invite) throw new AuthError(ts('auth.register.inviteInvalid'));
  if (!invite && mode !== 'open') throw new AuthError(ts('auth.register.inviteRequired'));
  const user = await createUser(username, password, invite?.role ?? 'user');
  if (invite) {
    const used = db()
      .prepare('UPDATE invites SET used_at = ?, used_by = ? WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL')
      .run(Date.now(), user.id, invite.token_hash);
    if (used.changes !== 1) {
      // Lost a race for the same invite.
      db().prepare('DELETE FROM users WHERE id = ?').run(user.id);
      throw new AuthError(ts('auth.register.inviteInvalid'));
    }
  }
  return user;
}
