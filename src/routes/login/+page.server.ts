import { fail, redirect } from '@sveltejs/kit';
import { registrationMode } from '$lib/server/auth/config';
import { safeNext } from '$lib/server/auth/guard';
import { passwordStep } from '$lib/server/auth/login';
import { userCount } from '$lib/server/auth/users';

export const load = ({ locals, url }) => {
  const next = safeNext(url.searchParams.get('next'));
  if (locals.user) redirect(303, next);
  if (userCount() === 0) redirect(303, '/setup');
  return { next, openRegistration: registrationMode() === 'open' };
};

export const actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');
    const next = safeNext(String(form.get('next') ?? ''));
    const r = await passwordStep(event, username, password);
    if (r.kind === 'error') return fail(r.status, { username, error: r.message });
    if (r.kind === 'second-factor') redirect(303, `/login/2fa?next=${encodeURIComponent(next)}`);
    redirect(303, next);
  }
};
