import { ts } from '$lib/server/i18n';
import { error, fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/auth/audit';
import { registrationMode } from '$lib/server/auth/config';
import { meta } from '$lib/server/auth/guard';
import { MIN_PASSWORD } from '$lib/server/auth/password';
import { hit, LIMITS, retryText } from '$lib/server/auth/ratelimit';
import { rotateSession } from '$lib/server/auth/sessions';
import { AuthError, findValidInvite, register, userCount } from '$lib/server/auth/users';

export const load = ({ url, locals }) => {
  if (userCount() === 0) redirect(303, '/setup');
  if (locals.user) redirect(303, '/');
  const invite = url.searchParams.get('invite');
  const mode = registrationMode();
  if (invite) {
    if (mode === 'closed' || !findValidInvite(invite)) error(400, ts('auth.register.inviteInvalid'));
  } else if (mode !== 'open') {
    error(403, ts('auth.register.inviteOnly'));
  }
  return { invite, minPassword: MIN_PASSWORD };
};

export const actions = {
  default: async (event) => {
    const m = meta(event);
    const wait = hit(`register:ip:${m.ip}`, LIMITS.registerPerIp);
    if (wait) return fail(429, { username: '', error: ts('auth.error.tooManyAttempts', { retry: retryText(wait) }) });
    const form = await event.request.formData();
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');
    const invite = String(form.get('invite') ?? '') || null;
    if (password !== String(form.get('confirm') ?? '')) return fail(400, { username, error: ts('auth.password.mismatch') });
    let user;
    try {
      user = await register(username, password, invite);
    } catch (err) {
      if (err instanceof AuthError) return fail(400, { username, error: err.message });
      throw err;
    }
    audit({ event: 'user_registered', userId: user.id, username: user.username, ip: m.ip, detail: invite ? `invite (${user.role})` : 'open' });
    rotateSession(event.cookies, event.url, user.id, 'register', m);
    redirect(303, '/account?welcome=1');
  }
};
