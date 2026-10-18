import { ts } from '$lib/server/i18n';
import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/auth/audit';
import { devAuthBypass } from '$lib/server/auth/devbypass';
import { meta } from '$lib/server/auth/guard';
import { MIN_PASSWORD } from '$lib/server/auth/password';
import { hit, LIMITS, retryText } from '$lib/server/auth/ratelimit';
import { rotateSession } from '$lib/server/auth/sessions';
import { AuthError, checkSetupToken, createUser, setupDone, userCount } from '$lib/server/auth/users';

export const load = () => {
  if (userCount() > 0 || devAuthBypass()) redirect(303, '/login');
  return { minPassword: MIN_PASSWORD };
};

export const actions = {
  default: async (event) => {
    if (userCount() > 0) redirect(303, '/login');
    const m = meta(event);
    const wait = hit(`setup:ip:${m.ip}`, LIMITS.setupPerIp);
    if (wait) return fail(429, { username: '', error: ts('auth.error.tooManyAttempts', { retry: retryText(wait) }) });
    const form = await event.request.formData();
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');
    if (!checkSetupToken(String(form.get('token') ?? '').trim())) return fail(400, { username, error: ts('auth.setup.badToken') });
    if (password !== String(form.get('confirm') ?? '')) return fail(400, { username, error: ts('auth.password.mismatch') });
    let user;
    try {
      user = await createUser(username, password, 'admin');
    } catch (err) {
      if (err instanceof AuthError) return fail(400, { username, error: err.message });
      throw err;
    }
    setupDone();
    audit({ event: 'setup', userId: user.id, username: user.username, ip: m.ip });
    rotateSession(event.cookies, event.url, user.id, 'setup', m);
    redirect(303, '/account?welcome=1');
  }
};
