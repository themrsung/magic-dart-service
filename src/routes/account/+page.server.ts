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
import { ts } from '$lib/server/i18n';
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
  if (wait) return ts('account.err.tooMany', { retry: retryText(wait) });
  const row = getUser(user.id)!;
  return (await verifyPassword(row.password_hash, String(form.get('current') ?? ''))) ? null : ts('account.err.wrongCurrent');
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
    if (next !== String(form.get('confirm') ?? '')) return fail(400, { section: 'password', error: ts('account.err.confirmMismatch') });
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
    return { section: 'password', message: ts('account.ok.passwordChanged', { count: ended }) };
  },

  totpBegin: async (event) => {
    const user = requireUser(event);
    if (getUser(user.id)!.totp_secret) return fail(400, { section: 'totp', error: ts('account.err.totpExists') });
    await beginTotp(user.id);
    return { section: 'totp' };
  },

  totpConfirm: async (event) => {
    const user = requireUser(event);
    const wait = hit(`sensitive:${user.id}`, LIMITS.sensitivePerUser);
    if (wait) return fail(429, { section: 'totp', error: ts('account.err.tooMany', { retry: retryText(wait) }) });
    const code = String((await event.request.formData()).get('code') ?? '');
    if (!confirmTotp(user.id, code)) return fail(400, { section: 'totp', error: ts('account.err.totpBadCode') });
    log(event, 'totp_enabled');
    rotateCurrentSession(event.cookies, event.url, user.id, meta(event), event.locals.sessionId);
    return { section: 'totp', message: ts('account.ok.totpEnabled'), recoveryCodes: ensureRecoveryCodes(event) };
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
    return { section: 'totp', message: ts('account.ok.totpDisabled') };
  },

  recovery: async (event) => {
    const user = requireUser(event);
    const problem = await confirmPassword(event, await event.request.formData());
    if (problem) return fail(400, { section: 'recovery', error: problem });
    if (!hasSecondFactor(user.id)) return fail(400, { section: 'recovery', error: ts('account.err.needFactor') });
    const codes = generateRecoveryCodes(user.id);
    log(event, 'recovery_codes_generated');
    return { section: 'recovery', recoveryCodes: codes };
  },

  passkeyRename: async (event) => {
    const user = requireUser(event);
    const form = await event.request.formData();
    if (!renamePasskey(user.id, String(form.get('id') ?? ''), String(form.get('name') ?? ''))) return fail(400, { section: 'passkeys', error: ts('account.err.renameFailed') });
    return { section: 'passkeys', message: ts('account.ok.renamed') };
  },

  passkeyRemove: async (event) => {
    const user = requireUser(event);
    const form = await event.request.formData();
    const problem = await confirmPassword(event, form);
    if (problem) return fail(400, { section: 'passkeys', error: problem });
    const id = String(form.get('id') ?? '');
    const name = listPasskeys(user.id).find((p) => p.id === id)?.name;
    if (!removePasskey(user.id, id)) return fail(400, { section: 'passkeys', error: ts('account.err.passkeyNotFound') });
    dropRecoveryIfNoFactor(user.id);
    log(event, 'passkey_removed', name);
    rotateCurrentSession(event.cookies, event.url, user.id, meta(event), event.locals.sessionId);
    return { section: 'passkeys', message: ts('account.ok.passkeyRemoved') };
  },

  sessionRevoke: async (event) => {
    const user = requireUser(event);
    const id = String((await event.request.formData()).get('id') ?? '');
    if (id === event.locals.sessionId) return fail(400, { section: 'sessions', error: ts('account.err.currentSession') });
    if (!revokeOwnSession(user.id, id)) return fail(400, { section: 'sessions', error: ts('account.err.sessionNotFound') });
    log(event, 'session_revoked');
    return { section: 'sessions', message: ts('account.ok.sessionEnded') };
  },

  sessionRevokeOthers: async (event) => {
    const user = requireUser(event);
    const n = revokeAllSessions(user.id, event.locals.sessionId ?? undefined);
    log(event, 'session_revoked', `${n} other session(s)`);
    return { section: 'sessions', message: ts('account.ok.othersEnded', { count: n }) };
  },

  clientRevoke: async (event) => {
    const user = requireUser(event);
    const id = String((await event.request.formData()).get('client_id') ?? '');
    if (!revokeClient(id, { id: user.id, asAdmin: false })) return fail(404, { section: 'clients', error: ts('account.err.clientNotFound') });
    log(event, 'oauth_client_revoked', id);
    return { section: 'clients', message: ts('account.ok.clientRevoked') };
  }
};
