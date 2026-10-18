import { redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/auth/audit';
import { meta } from '$lib/server/auth/guard';
import { clearSessionCookie, revokeSession } from '$lib/server/auth/sessions';

export const POST = async (event) => {
  const { locals, cookies, url } = event;
  if (locals.sessionId) revokeSession(locals.sessionId);
  if (locals.user) audit({ event: 'logout', userId: locals.user.id, username: locals.user.username, ip: meta(event).ip });
  clearSessionCookie(cookies, url);
  redirect(303, '/login');
};
