import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/auth/audit';
import { recoveryCodesLeft, useRecoveryCode, verifyTotp } from '$lib/server/auth/factors';
import { meta, safeNext } from '$lib/server/auth/guard';
import { completeLogin, secondFactorFailed, secondFactorRateLimited } from '$lib/server/auth/login';
import { listPasskeys } from '$lib/server/auth/passkeys';
import { clearPendingLogin, failPendingLogin, readPendingLogin } from '$lib/server/auth/sessions';
import { getUser } from '$lib/server/auth/users';

export const load = ({ cookies, url }) => {
  const pending = readPendingLogin(cookies);
  const next = safeNext(url.searchParams.get('next'));
  if (!pending) redirect(303, `/login?next=${encodeURIComponent(next)}`);
  const user = getUser(pending.userId)!;
  return { next, totp: !!user.totp_secret, passkeys: listPasskeys(user.id).length > 0, recovery: recoveryCodesLeft(user.id) > 0 };
};

export const actions = {
  verify: async (event) => {
    const { cookies, url, request } = event;
    const form = await request.formData();
    const next = safeNext(String(form.get('next') ?? ''));
    const pending = readPendingLogin(cookies);
    if (!pending) redirect(303, `/login?next=${encodeURIComponent(next)}`);

    const limited = secondFactorRateLimited(event, pending.userId);
    if (limited) return fail(429, { error: limited, kind: undefined });

    const code = String(form.get('code') ?? '').trim();
    const kind = form.get('kind') === 'recovery' ? 'recovery' : 'totp';
    const ok = kind === 'recovery' ? useRecoveryCode(pending.userId, code) : verifyTotp(pending.userId, code);
    if (!ok) {
      secondFactorFailed(event, pending.userId, kind);
      const left = failPendingLogin(pending.id);
      if (left <= 0) {
        clearPendingLogin(cookies, url, pending.id);
        redirect(303, `/login?next=${encodeURIComponent(next)}`);
      }
      return fail(400, { error: kind === 'recovery' ? '복구 코드가 올바르지 않거나 이미 사용되었습니다.' : '인증 코드가 올바르지 않습니다.', kind });
    }
    if (kind === 'recovery') {
      const user = getUser(pending.userId)!;
      audit({ event: 'recovery_code_used', userId: user.id, username: user.username, ip: meta(event).ip, detail: `${recoveryCodesLeft(user.id)} left` });
    }
    completeLogin(event, pending.userId, kind === 'recovery' ? 'password+recovery' : 'password+totp', pending.id);
    redirect(303, kind === 'recovery' ? '/account?recovered=1' : next);
  },

  cancel: async ({ cookies, url }) => {
    clearPendingLogin(cookies, url, readPendingLogin(cookies)?.id);
    redirect(303, '/login');
  }
};
