import { fail, type RequestEvent } from '@sveltejs/kit';
import { audit, recentAudit } from '$lib/server/auth/audit';
import { appOrigin } from '$lib/server/auth/config';
import { beginTotp, clearRecoveryCodes, confirmTotp, disableTotp, generateRecoveryCodes, pendingTotp, recoveryCodesLeft } from '$lib/server/auth/factors';
import { meta, requireUser } from '$lib/server/auth/guard';
import { MIN_PASSWORD, verifyPassword } from '$lib/server/auth/password';
import { listPasskeys, removePasskey, renamePasskey } from '$lib/server/auth/passkeys';
import { hit, LIMITS, retryText } from '$lib/server/auth/ratelimit';
import { listSessions, revokeAllSessions, revokeOwnSession, rotateCurrentSession } from '$lib/server/auth/sessions';
import { AuthError, getUser, hasSecondFactor, setPassword } from '$lib/server/auth/users';
import { listClients, revokeClient } from '$lib/server/mcp/oauth';

export const load = async (event) => {
  const user = requireUser(event);
  const row = getUser(user.id)!;
  const origin = appOrigin(event.url.origin);
  return {
    username: user.username,
    role: user.role,
    welcome: event.url.searchParams.has('welcome'),
    recovered: event.url.searchParams.has('recovered'),
    minPassword: MIN_PASSWORD,
    totp: { enabled: !!row.totp_secret, pending: row.totp_secret ? null : await pendingTotp(user.id) },
    recoveryLeft: recoveryCodesLeft(user.id),
    passkeys: listPasskeys(user.id).map((p) => ({ id: p.id, name: p.name, created_at: p.created_at, last_used_at: p.last_used_at, backed_up: !!p.backed_up })),
    sessions: listSessions(user.id).map((s) => ({ ...s, current: s.id === event.locals.sessionId })),
    clients: listClients(user.id).map((c) => ({ ...c, redirect_uris: JSON.parse(c.redirect_uris) as string[] })),
    activity: recentAudit(10, user.id),
    mcpUrl: `${origin}/mcp`
  };
};

type Event = RequestEvent;

/** Sensitive changes need the current password and are rate limited per account. */
async function confirmPassword(event: Event, form: FormData): Promise<string | null> {
  const user = requireUser(event);
  const wait = hit(`sensitive:${user.id}`, LIMITS.sensitivePerUser);
  if (wait) return `시도가 너무 많습니다. ${retryText(wait)}`;
  const row = getUser(user.id)!;
  return (await verifyPassword(row.password_hash, String(form.get('current') ?? ''))) ? null : '현재 비밀번호가 올바르지 않습니다.';
}

function log(event: Event, e: Parameters<typeof audit>[0]['event'], detail?: string) {
  const user = event.locals.user!;
  audit({ event: e, userId: user.id, username: user.username, ip: meta(event).ip, detail });
}

/** First second factor: issue recovery codes. */
function ensureRecoveryCodes(event: Event): string[] | undefined {
  const user = event.locals.user!;
  if (recoveryCodesLeft(user.id) > 0) return undefined;
  log(event, 'recovery_codes_generated');
  return generateRecoveryCodes(user.id);
}

/** Removing the last factor makes recovery codes meaningless. */
function dropRecoveryIfNoFactor(userId: number) {
  if (!hasSecondFactor(userId)) clearRecoveryCodes(userId);
}

export const actions = {
  password: async (event) => {
    const user = requireUser(event);
    const form = await event.request.formData();
    const problem = await confirmPassword(event, form);
    if (problem) return fail(400, { section: 'password', error: problem });
    const next = String(form.get('password') ?? '');
    if (next !== String(form.get('confirm') ?? '')) return fail(400, { section: 'password', error: '새 비밀번호 확인이 일치하지 않습니다.' });
    try {
      await setPassword(user.id, next);
    } catch (err) {
      if (err instanceof AuthError) return fail(400, { section: 'password', error: err.message });
      throw err;
    }
    // Everyone else holding this account's sessions is signed out; this browser gets a new token.
    const newId = rotateCurrentSession(event.cookies, event.url, user.id, meta(event), event.locals.sessionId);
    const ended = revokeAllSessions(user.id, newId);
    log(event, 'password_changed', `${ended} other session(s) ended`);
    return { section: 'password', message: `비밀번호를 바꿨습니다. 다른 기기 ${ended}곳에서 로그아웃했습니다.` };
  },

  totpBegin: async (event) => {
    const user = requireUser(event);
    if (getUser(user.id)!.totp_secret) return fail(400, { section: 'totp', error: '이미 인증 앱이 등록되어 있습니다.' });
    await beginTotp(user.id);
    return { section: 'totp' };
  },

  totpConfirm: async (event) => {
    const user = requireUser(event);
    const wait = hit(`sensitive:${user.id}`, LIMITS.sensitivePerUser);
    if (wait) return fail(429, { section: 'totp', error: `시도가 너무 많습니다. ${retryText(wait)}` });
    const code = String((await event.request.formData()).get('code') ?? '');
    if (!confirmTotp(user.id, code)) return fail(400, { section: 'totp', error: '코드가 맞지 않습니다. 기기 시간이 맞는지 확인하고 새 코드를 입력하세요.' });
    log(event, 'totp_enabled');
    rotateCurrentSession(event.cookies, event.url, user.id, meta(event), event.locals.sessionId);
    return { section: 'totp', message: '인증 앱을 등록했습니다.', recoveryCodes: ensureRecoveryCodes(event) };
  },

  totpCancel: async (event) => {
    const user = requireUser(event);
    if (!getUser(user.id)!.totp_secret) disableTotp(user.id);
    return { section: 'totp' };
  },

  totpDisable: async (event) => {
    const user = requireUser(event);
    const problem = await confirmPassword(event, await event.request.formData());
    if (problem) return fail(400, { section: 'totp', error: problem });
    disableTotp(user.id);
    dropRecoveryIfNoFactor(user.id);
    log(event, 'totp_disabled');
    rotateCurrentSession(event.cookies, event.url, user.id, meta(event), event.locals.sessionId);
    return { section: 'totp', message: '인증 앱 등록을 해제했습니다.' };
  },

  recovery: async (event) => {
    const user = requireUser(event);
    const problem = await confirmPassword(event, await event.request.formData());
    if (problem) return fail(400, { section: 'recovery', error: problem });
    if (!hasSecondFactor(user.id)) return fail(400, { section: 'recovery', error: '먼저 인증 앱이나 패스키를 등록하세요.' });
    const codes = generateRecoveryCodes(user.id);
    log(event, 'recovery_codes_generated');
    return { section: 'recovery', recoveryCodes: codes };
  },

  passkeyRename: async (event) => {
    const user = requireUser(event);
    const form = await event.request.formData();
    if (!renamePasskey(user.id, String(form.get('id') ?? ''), String(form.get('name') ?? ''))) return fail(400, { section: 'passkeys', error: '이름을 바꾸지 못했습니다.' });
    return { section: 'passkeys', message: '이름을 바꿨습니다.' };
  },

  passkeyRemove: async (event) => {
    const user = requireUser(event);
    const form = await event.request.formData();
    const problem = await confirmPassword(event, form);
    if (problem) return fail(400, { section: 'passkeys', error: problem });
    const id = String(form.get('id') ?? '');
    const name = listPasskeys(user.id).find((p) => p.id === id)?.name;
    if (!removePasskey(user.id, id)) return fail(400, { section: 'passkeys', error: '패스키를 찾을 수 없습니다.' });
    dropRecoveryIfNoFactor(user.id);
    log(event, 'passkey_removed', name);
    rotateCurrentSession(event.cookies, event.url, user.id, meta(event), event.locals.sessionId);
    return { section: 'passkeys', message: '패스키를 삭제했습니다. 기기에 남은 패스키도 지워 주세요.' };
  },

  sessionRevoke: async (event) => {
    const user = requireUser(event);
    const id = String((await event.request.formData()).get('id') ?? '');
    if (id === event.locals.sessionId) return fail(400, { section: 'sessions', error: '현재 세션은 로그아웃으로 끝내세요.' });
    if (!revokeOwnSession(user.id, id)) return fail(400, { section: 'sessions', error: '세션을 찾을 수 없습니다.' });
    log(event, 'session_revoked');
    return { section: 'sessions', message: '세션을 끝냈습니다.' };
  },

  sessionRevokeOthers: async (event) => {
    const user = requireUser(event);
    const n = revokeAllSessions(user.id, event.locals.sessionId ?? undefined);
    log(event, 'session_revoked', `${n} other session(s)`);
    return { section: 'sessions', message: `다른 세션 ${n}개를 끝냈습니다.` };
  },

  clientRevoke: async (event) => {
    const user = requireUser(event);
    const id = String((await event.request.formData()).get('client_id') ?? '');
    if (!revokeClient(id, { id: user.id, asAdmin: false })) return fail(404, { section: 'clients', error: '클라이언트를 찾을 수 없습니다.' });
    log(event, 'oauth_client_revoked', id);
    return { section: 'clients', message: '연결을 해제했습니다.' };
  }
};
