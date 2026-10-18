import { fail, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/auth/audit';
import { meta } from '$lib/server/auth/guard';
import { MIN_PASSWORD } from '$lib/server/auth/password';
import { hit, LIMITS, retryText } from '$lib/server/auth/ratelimit';
import { rotateSession } from '$lib/server/auth/sessions';
import { AuthError, checkSetupToken, createUser, setupDone, userCount } from '$lib/server/auth/users';

export const load = () => {
  if (userCount() > 0) redirect(303, '/login');
  return { minPassword: MIN_PASSWORD };
};

export const actions = {
  default: async (event) => {
    if (userCount() > 0) redirect(303, '/login');
    const m = meta(event);
    const wait = hit(`setup:ip:${m.ip}`, LIMITS.setupPerIp);
    if (wait) return fail(429, { username: '', error: `시도가 너무 많습니다. ${retryText(wait)}` });
    const form = await event.request.formData();
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');
    if (!checkSetupToken(String(form.get('token') ?? '').trim())) return fail(400, { username, error: '설정 토큰이 올바르지 않습니다. 서버 로그를 확인하세요.' });
    if (password !== String(form.get('confirm') ?? '')) return fail(400, { username, error: '비밀번호 확인이 일치하지 않습니다.' });
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
