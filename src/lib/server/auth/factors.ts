import { randomInt } from 'node:crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { db } from '../db';
import { keyedHash, seal, unseal } from './config';
import { getUser } from './users';

const TOTP_PURPOSE = 'totp-secret-v1';
const RECOVERY_PURPOSE = 'recovery-code-v1';
const ISSUER = 'MagicDART';

// ── TOTP (RFC 6238: SHA-1, 6 digits, 30 s) ─────────────────────────────

/** Starts (or restarts) enrollment. The secret only becomes active after confirmTotp. */
export async function beginTotp(userId: number): Promise<{ secret: string; uri: string; qr: string }> {
  const user = getUser(userId);
  if (!user) throw new Error('no such user');
  const secret = generateSecret();
  db().prepare('UPDATE users SET totp_pending = ? WHERE id = ?').run(seal(secret, TOTP_PURPOSE), userId);
  const uri = generateURI({ issuer: ISSUER, label: user.username, secret });
  return { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

/** The pending secret (for re-rendering the enrollment screen). */
export async function pendingTotp(userId: number): Promise<{ secret: string; uri: string; qr: string } | null> {
  const user = getUser(userId);
  if (!user?.totp_pending) return null;
  const secret = unseal(user.totp_pending, TOTP_PURPOSE);
  const uri = generateURI({ issuer: ISSUER, label: user.username, secret });
  return { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

function check(secret: string, code: string, afterStep: number | null, epoch?: number): number | null {
  const token = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return null;
  // ±1 step for clock drift; codes from an already used step are rejected (replay).
  const r = verifySync({ secret, token, epochTolerance: 30, afterTimeStep: afterStep ?? undefined, epoch });
  return r.valid && 'timeStep' in r ? r.timeStep : null;
}

/** Confirms enrollment with a code from the authenticator app. */
export function confirmTotp(userId: number, code: string, epoch?: number): boolean {
  const user = getUser(userId);
  if (!user?.totp_pending) return false;
  const secret = unseal(user.totp_pending, TOTP_PURPOSE);
  const step = check(secret, code, null, epoch);
  if (step === null) return false;
  db().prepare('UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = ? WHERE id = ?').run(step, userId);
  return true;
}

export function verifyTotp(userId: number, code: string, epoch?: number): boolean {
  const user = getUser(userId);
  if (!user?.totp_secret) return false;
  const step = check(unseal(user.totp_secret, TOTP_PURPOSE), code, user.totp_last_step, epoch);
  if (step === null) return false;
  // Conditional update so two concurrent requests cannot both spend the same step.
  return db().prepare('UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)').run(step, userId, step).changes === 1;
}

export function disableTotp(userId: number): void {
  db().prepare('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_last_step = NULL WHERE id = ?').run(userId);
}

// ── Recovery codes ─────────────────────────────────────────────────────

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no 0/O, 1/I/L, U
const RECOVERY_COUNT = 10;

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Replaces all recovery codes; the plaintext is returned once and never stored. */
export function generateRecoveryCodes(userId: number): string[] {
  const codes = Array.from({ length: RECOVERY_COUNT }, () => {
    const raw = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  db().transaction(() => {
    db().prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    const put = db().prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
    for (const c of codes) put.run(userId, keyedHash(normalizeCode(c), RECOVERY_PURPOSE));
  })();
  return codes;
}

/** Spends one recovery code. Each works exactly once. */
export function useRecoveryCode(userId: number, code: string): boolean {
  const normalized = normalizeCode(code);
  if (normalized.length !== 10) return false;
  return (
    db()
      .prepare('UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
      .run(Date.now(), userId, keyedHash(normalized, RECOVERY_PURPOSE)).changes === 1
  );
}

export function recoveryCodesLeft(userId: number): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').get(userId) as { n: number }).n;
}

export function clearRecoveryCodes(userId: number): void {
  db().prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
}
