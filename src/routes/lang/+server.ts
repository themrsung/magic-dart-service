import { redirect } from '@sveltejs/kit';
import { LOCALE_COOKIE, normalizeLocale } from '$lib/i18n';
import { secureCookies } from '$lib/server/auth/config';
import { safeNext } from '$lib/server/auth/guard';

/** Language switch: a same-origin form post (no JavaScript needed), then back to the same page. */
export const POST = async ({ request, cookies, url }) => {
  const form = await request.formData();
  cookies.set(LOCALE_COOKIE, normalizeLocale(form.get('lang')), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(url),
    maxAge: 365 * 24 * 60 * 60
  });
  redirect(303, safeNext(String(form.get('next') ?? '/')));
};
