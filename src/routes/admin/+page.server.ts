import { fail, type RequestEvent } from '@sveltejs/kit';
import { audit, recentAudit } from '$lib/server/auth/audit';
import { appOrigin, registrationMode } from '$lib/server/auth/config';
import { meta, requireAdmin } from '$lib/server/auth/guard';
import { AuthError, createInvite, getUser, listInvites, listUsers, revokeInvite, setDisabled, setRole, type Role } from '$lib/server/auth/users';
import { describeError, usageHistory, usageToday, validateKey } from '$lib/server/dart';
import { egressIp, egressLookupEnabled } from '$lib/server/egress';
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
    if (!isPlausibleApiKey(key)) return fail(400, { keyError: 'API 키는 영문·숫자 40자입니다.' });
    let warning: { status?: string; message: string } | undefined;
    try {
      await validateKey(key);
    } catch (err) {
      const info = describeError(err);
      // Only auth failures mean the key itself is bad; anything else (maintenance, network) still saves.
      if (info.kind === 'auth' || info.kind === 'validation') return fail(400, { keyError: `키 확인 실패: ${info.message}`, keyStatus: info.status });
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
    if (warning) return { keyStatus: warning.status, keySaved: `저장했지만 확인 호출은 실패했습니다: ${warning.message}` };
    // Kick off the corp list right away so search works.
    enqueue('corpCodes', 'key-set');
    return { keyStatus: undefined, keySaved: '키를 확인하고 암호화해 저장했습니다. 고유번호 목록을 받아오는 중입니다.' };
  },

  runJob: async (event) => {
    requireAdmin(event);
    const name = String((await event.request.formData()).get('job') ?? '');
    if (!JOBS.some((j) => j.name === name)) return fail(400, { jobMessage: '알 수 없는 작업입니다' });
    return { jobMessage: enqueue(name, 'manual') ? '대기열에 추가했습니다' : '이미 대기 중입니다' };
  },

  revoke: async (event) => {
    const admin = requireAdmin(event);
    const id = String((await event.request.formData()).get('client_id') ?? '');
    if (!revokeClient(id, { id: admin.id, asAdmin: true })) return fail(404, { clientMessage: '클라이언트를 찾을 수 없습니다' });
    log(event, 'oauth_client_revoked', id);
    return { clientMessage: '연결을 해제했습니다' };
  },

  invite: async (event) => {
    const admin = requireAdmin(event);
    const form = await event.request.formData();
    const role: Role = form.get('role') === 'admin' ? 'admin' : 'user';
    const note = String(form.get('note') ?? '').trim() || null;
    if (registrationMode() === 'closed') return fail(400, { inviteError: 'REGISTRATION=closed 상태에서는 초대 링크를 쓸 수 없습니다.' });
    const token = createInvite(admin.id, role, note);
    log(event, 'invite_created', `${role}${note ? ` (${note})` : ''}`);
    return { inviteUrl: `${appOrigin(event.url.origin)}/register?invite=${token}` };
  },

  inviteRevoke: async (event) => {
    requireAdmin(event);
    revokeInvite(String((await event.request.formData()).get('id') ?? ''));
    log(event, 'invite_revoked');
    return { inviteMessage: '초대를 취소했습니다' };
  },

  userState: async (event) => {
    const admin = requireAdmin(event);
    const form = await event.request.formData();
    const id = Number(form.get('id'));
    const target = getUser(id);
    if (!target) return fail(404, { userError: '사용자를 찾을 수 없습니다' });
    if (id === admin.id) return fail(400, { userError: '자신의 계정은 여기서 바꿀 수 없습니다' });
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
    return { userMessage: '변경했습니다' };
  }
};
