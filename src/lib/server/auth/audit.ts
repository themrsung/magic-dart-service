import { db } from '../db';

export type AuditEvent =
  | 'setup'
  | 'login'
  | 'login_failed'
  | 'second_factor_failed'
  | 'lockout'
  | 'logout'
  | 'password_changed'
  | 'totp_enabled'
  | 'totp_disabled'
  | 'recovery_codes_generated'
  | 'recovery_code_used'
  | 'passkey_added'
  | 'passkey_removed'
  | 'session_revoked'
  | 'user_registered'
  | 'user_disabled'
  | 'user_enabled'
  | 'role_changed'
  | 'invite_created'
  | 'invite_revoked'
  | 'oauth_client_approved'
  | 'oauth_client_revoked'
  | 'api_key_changed';

export interface AuditInput {
  event: AuditEvent;
  userId?: number | null;
  username?: string | null;
  ip?: string | null;
  detail?: string | null;
}

export function audit({ event, userId = null, username = null, ip = null, detail = null }: AuditInput): void {
  db()
    .prepare('INSERT INTO audit_log (at, user_id, username, event, ip, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .run(Date.now(), userId, username, event, ip, detail?.slice(0, 500) ?? null);
}

export interface AuditRow {
  id: number;
  at: number;
  user_id: number | null;
  username: string | null;
  event: AuditEvent;
  ip: string | null;
  detail: string | null;
}

export function recentAudit(limit = 100, userId?: number): AuditRow[] {
  return (
    userId === undefined
      ? db().prepare('SELECT * FROM audit_log ORDER BY at DESC, id DESC LIMIT ?').all(limit)
      : db().prepare('SELECT * FROM audit_log WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT ?').all(userId, limit)
  ) as AuditRow[];
}

/** Keeps a year of history. */
export function purgeAudit(): void {
  db().prepare('DELETE FROM audit_log WHERE at < ?').run(Date.now() - 365 * 24 * 60 * 60 * 1000);
}
