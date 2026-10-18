import { ts } from '../i18n';
import type { RequestEvent } from '@sveltejs/kit';
import { sha256 } from './config';
import { audit } from './audit';
import { devAuthBypass, devUser } from './devbypass';
import { meta } from './guard';
import { burnPasswordCheck, MAX_PASSWORD, verifyPassword } from './password';
import { hit, LIMITS, lockedFor, recordFailure, recordSuccess, retryText } from './ratelimit';
import { clearPendingLogin, createPendingLogin, rotateSession, SESSION_COOKIE, type LoginMethod } from './sessions';
import { findUser, getUser, hasSecondFactor, normalizeUsername } from './users';

type Event = Pick<RequestEvent, 'cookies' | 'url' | 'getClientAddress' | 'request'>;

/** The Korean text of the generic login error (what ts() yields outside a request). */
export const GENERIC_LOGIN_ERROR = '아이디 또는 비밀번호가 올바르지 않습니다.';

export type PasswordStep = { kind: 'done' } | { kind: 'second-factor' } | { kind: 'error'; message: string; status: number };

/**
 * Step one of a login. Unknown users, wrong passwords and disabled accounts all produce the same
 * message and take the same time.
 */
export async function passwordStep(event: Event, rawUsername: string, password: string): Promise<PasswordStep> {
  const m = meta(event);
  const username = normalizeUsername(rawUsername).slice(0, 64);
  const wait = hit(`login:ip:${m.ip}`, LIMITS.loginPerIp);
  if (wait) return { kind: 'error', message: ts('auth.error.tooManyLogins', { retry: retryText(wait) }), status: 429 };
  const locked = lockedFor(username);
  if (locked) return { kind: 'error', message: ts('auth.error.tooManyLogins', { retry: retryText(locked) }), status: 429 };
  if (!username || !password || password.length > MAX_PASSWORD) return { kind: 'error', message: ts('auth.error.genericLogin'), status: 400 };

  // Local development against the mock API only (see devbypass.ts): any credentials, no second factor.
  if (devAuthBypass()) {
    completeLogin(event, (await devUser(username)).id, 'dev-bypass');
    return { kind: 'done' };
  }

  const user = findUser(username);
  const ok = user ? await verifyPassword(user.password_hash, password) : (await burnPasswordCheck(password), false);
  if (!user || !ok || user.disabled_at) {
    const lock = recordFailure(username);
    audit({ event: 'login_failed', userId: user?.id, username, ip: m.ip, detail: user ? (user.disabled_at ? 'disabled' : 'password') : 'unknown user' });
    if (lock) audit({ event: 'lockout', userId: user?.id, username, ip: m.ip, detail: `${Math.round(lock / 1000)}s` });
    return { kind: 'error', message: ts('auth.error.genericLogin'), status: 400 };
  }

  if (hasSecondFactor(user.id)) {
    createPendingLogin(event.cookies, event.url, user.id);
    return { kind: 'second-factor' };
  }
  completeLogin(event, user.id, 'password');
  return { kind: 'done' };
}

/** Issues a fresh session (dropping any previous one on this browser) and records the login. */
export function completeLogin(event: Event, userId: number, method: LoginMethod, pendingId?: string): void {
  const user = getUser(userId)!;
  const old = event.cookies.get(SESSION_COOKIE);
  const m = meta(event);
  rotateSession(event.cookies, event.url, userId, method, m, old ? sha256(old) : undefined);
  clearPendingLogin(event.cookies, event.url, pendingId);
  recordSuccess(user.username);
  audit({ event: 'login', userId, username: user.username, ip: m.ip, detail: method });
}

/** Second-factor failures count toward the same per-account lockout as passwords. */
export function secondFactorFailed(event: Event, userId: number, detail: string): void {
  const user = getUser(userId);
  if (!user) return;
  const m = meta(event);
  const lock = recordFailure(user.username);
  audit({ event: 'second_factor_failed', userId, username: user.username, ip: m.ip, detail });
  if (lock) audit({ event: 'lockout', userId, username: user.username, ip: m.ip, detail: `${Math.round(lock / 1000)}s` });
}

export function secondFactorRateLimited(event: Event, userId: number): string | null {
  const user = getUser(userId);
  const wait = hit(`2fa:ip:${meta(event).ip}`, LIMITS.secondFactorPerIp) || (user ? lockedFor(user.username) : 0);
  return wait ? ts('auth.error.tooManyAttempts', { retry: retryText(wait) }) : null;
}
