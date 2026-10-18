import { fail, type RequestEvent } from '@sveltejs/kit';
import { audit, recentAudit } from '$lib/server/auth/audit';
import { appOrigin, registrationMode } from '$lib/server/auth/config';
import { meta, requireAdmin } from '$lib/server/auth/guard';
import { AuthError, createInvite, getUser, listInvites, listUsers, revokeInvite, setDisabled, setRole, type Role } from '$lib/server/auth/users';
import { describeError, usageHistory, usageToday, validateKey } from '$lib/server/dart';
import { egressIp, egressLookupEnabled } from '$lib/server/egress';
import { ts } from '$lib/server/i18n';
import { enqueue, jobOverview, recentRuns } from '$lib/server/jobs/runner';
import { JOBS } from '$lib/server/jobs/definitions';
import { listClients, revokeClient } from '$lib/server/mcp/oauth';
import { apiKeyStatus, ApiKeyStorageError, AUTO_DAILY_BUDGET, isPlausibleApiKey, TOTAL_DAILY_CAP, writeApiKey } from '$lib/server/settings';
import { corpCount, filingCount, pendingCount } from '$lib/server/store';

export const load = async (event) => {
  const admin = requireAdmin(event);
  return {
    me: admin.id,
    key: apiKeyStatus(),
    usage: {
      total: usageToday(),
      cron: usageToday('cron'),
      ui: usageToday('ui'),
      mcp: usageToday('mcp'),
      budget: AUTO_DAILY_BUDGET,
      cap: TOTAL_DAILY_CAP,
      history: usageHistory(7)
    },
    jobs: jobOverview(),
    runs: recentRuns(15),
    stats: { corps: corpCount(), filings: filingCount(), pending: pendingCount() },
    egress: egressLookupEnabled() ? egressIp() : Promise.resolve(null), // streamed
    egressEnabled: egressLookupEnabled(),
    registration: registrationMode(),
    users: listUsers(),
    invites: listInvites(),
    clients: listClients(null).map((c) => ({ ...c, redirect_uris: JSON.parse(c.redirect_uris) as string[] })),
    audit: recentAudit(60)
  };
};

function log(event: RequestEvent, e: Parameters<typeof audit>[0]['event'], detail?: string) {
  const user = event.locals.user!;
  audit({ event: e, userId: user.id, username: user.username, ip: meta(event).ip, detail });
}

export const actions = {
  /** Write-only: the key is validated, stored, and never sent back to any browser. */
  setKey: async (event) => {
    requireAdmin(event);
    const key = String((await event.request.formData()).get('key') ?? '').trim();
    if (!isPlausibleApiKey(key)) return fail(400, { keyError: ts('admin.key.invalidFormat') });
    let warning: { status?: string; message: string } | undefined;
    try {
      await validateKey(key);
    } catch (err) {
      const info = describeError(err);
      // Only auth failures mean the key itself is bad; anything else (maintenance, network) still saves.
      if (info.kind === 'auth' || info.kind === 'validation') return fail(400, { keyError: ts('admin.key.checkFailed', { message: info.message }), keyStatus: info.status });
      warning = { status: info.status, message: info.message };
    }
    try {
      writeApiKey(key);
    } catch (err) {
      if (err instanceof ApiKeyStorageError) return fail(500, { keyError: err.message, keyStatus: undefined });
      throw err;
    }
    const protection = apiKeyStatus().protection;
    log(event, 'api_key_changed', `${protection === 'host' ? 'host-bound' : 'APP_SECRET only'}${warning ? ', validation call failed' : ''}`);
    if (warning) return { keyStatus: warning.status, keySaved: ts('admin.key.savedUnverified', { message: warning.message }) };
    // Kick off the corp list right away so search works.
    enqueue('corpCodes', 'key-set');
    return { keyStatus: undefined, keySaved: ts('admin.key.saved') };
  },

  runJob: async (event) => {
    requireAdmin(event);
    const name = String((await event.request.formData()).get('job') ?? '');
    if (!JOBS.some((j) => j.name === name)) return fail(400, { jobMessage: ts('admin.jobs.unknown') });
    return { jobMessage: enqueue(name, 'manual') ? ts('admin.jobs.enqueued') : ts('admin.jobs.alreadyQueued') };
  },

  revoke: async (event) => {
    const admin = requireAdmin(event);
    const id = String((await event.request.formData()).get('client_id') ?? '');
    if (!revokeClient(id, { id: admin.id, asAdmin: true })) return fail(404, { clientMessage: ts('admin.clients.notFound') });
    log(event, 'oauth_client_revoked', id);
    return { clientMessage: ts('admin.clients.disconnected') };
  },

  invite: async (event) => {
    const admin = requireAdmin(event);
    const form = await event.request.formData();
    const role: Role = form.get('role') === 'admin' ? 'admin' : 'user';
    const note = String(form.get('note') ?? '').trim() || null;
    if (registrationMode() === 'closed') return fail(400, { inviteError: ts('admin.invites.closedError') });
    const token = createInvite(admin.id, role, note);
    log(event, 'invite_created', `${role}${note ? ` (${note})` : ''}`);
    return { inviteUrl: `${appOrigin(event.url.origin)}/register?invite=${token}` };
  },

  inviteRevoke: async (event) => {
    requireAdmin(event);
    revokeInvite(String((await event.request.formData()).get('id') ?? ''));
    log(event, 'invite_revoked');
    return { inviteMessage: ts('admin.invites.revokedMessage') };
  },

  userState: async (event) => {
    const admin = requireAdmin(event);
    const form = await event.request.formData();
    const id = Number(form.get('id'));
    const target = getUser(id);
    if (!target) return fail(404, { userError: ts('admin.users.notFound') });
    if (id === admin.id) return fail(400, { userError: ts('admin.users.notSelf') });
    try {
      if (form.get('op') === 'disable') {
        setDisabled(id, true);
        log(event, 'user_disabled', target.username);
      } else if (form.get('op') === 'enable') {
        setDisabled(id, false);
        log(event, 'user_enabled', target.username);
      } else {
        const role: Role = form.get('role') === 'admin' ? 'admin' : 'user';
        setRole(id, role);
        log(event, 'role_changed', `${target.username}: ${target.role} → ${role}`);
      }
    } catch (err) {
      if (err instanceof AuthError) return fail(400, { userError: err.message });
      throw err;
    }
    return { userMessage: ts('admin.users.changed') };
  }
};
