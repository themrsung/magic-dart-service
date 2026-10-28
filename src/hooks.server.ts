import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { purgeAudit } from '$lib/server/auth/audit';
import { appOrigin, assertSecret } from '$lib/server/auth/config';
import { DEV_MOCK_API_KEY, devAuthBypass } from '$lib/server/auth/devbypass';
import { decide, MACHINE_ENDPOINTS } from '$lib/server/auth/guard';
import { sweep } from '$lib/server/auth/ratelimit';
import { purgeSessions, SESSION_COOKIE, validateSession } from '$lib/server/auth/sessions';
import { announceSetup, userCount } from '$lib/server/auth/users';
import { startScheduler } from '$lib/server/jobs/runner';
import { hostIdSource } from '$lib/server/hostid';
import { LOCALE_COOKIE, pickLocale } from '$lib/i18n';
import { runWithLocale } from '$lib/server/i18n';
import { purgeExpired } from '$lib/server/mcp/oauth';
import { openDartBaseUrl } from '$lib/server/dart';
import { warnIfUnpatchedNode } from '$lib/server/runtime';
import { apiKeyStatus, hostBindingMode, writeApiKey } from '$lib/server/settings';

if (!building) {
  warnIfUnpatchedNode();
  assertSecret();
  if (process.env.ORIGIN && !/^https:/.test(process.env.ORIGIN) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(process.env.ORIGIN))
    console.warn('[auth] ORIGIN is not https: session cookies are Secure and browsers will drop them over plain http.');
  if (devAuthBypass()) {
    console.warn(`[auth] DEV LOGIN BYPASS ON: any username/password signs in as admin (vite dev + OPENDART_BASE_URL=${openDartBaseUrl()}).`);
    if (!apiKeyStatus().stored) writeApiKey(DEV_MOCK_API_KEY);
  } else {
    announceSetup();
  }
  if (hostBindingMode() !== 'off') {
    const source = hostIdSource();
    if (source) console.log(`[key] OpenDART key is bound to this host (identifier from ${source}).`);
    else console.warn('[key] No host identifier found: the OpenDART key is encrypted with APP_SECRET only. Set HOST_ID_FILE (see README).');
  }
  const key = apiKeyStatus();
  if (key.error) console.warn(`[key] ${key.error}`);
  if (process.env.DISABLE_SCHEDULER !== '1') startScheduler();
  setInterval(() => {
    purgeExpired();
    purgeSessions();
    purgeAudit();
    sweep();
  }, 60 * 60 * 1000).unref();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const handle: Handle = async ({ event, resolve }) => {
  const { request, url } = event;

  // Same-origin rule for every state-changing browser request, whatever its content type (SvelteKit's
  // built-in check only covers form posts and cannot exempt the MCP/OAuth endpoints, so it is off).
  if (!SAFE_METHODS.has(request.method) && !MACHINE_ENDPOINTS.has(url.pathname)) {
    if (request.headers.get('origin') !== url.origin) {
      return new Response('Cross-origin request blocked', { status: 403 });
    }
  }

  const locale = pickLocale(event.cookies.get(LOCALE_COOKIE), request.headers.get('accept-language'));
  event.locals.locale = locale;
  return runWithLocale(locale, () => handleRequest({ event, resolve }));
};

const handleRequest: Handle = async ({ event, resolve }) => {
  const { url } = event;
  const locale = event.locals.locale;
  const session = validateSession(event.cookies.get(SESSION_COOKIE));
  event.locals.user = session?.user ?? null;
  event.locals.sessionId = session?.id ?? null;

  const decision = decide(url, event.locals.user, !event.locals.user && userCount() === 0 && !devAuthBypass());
  if (decision.kind === 'unauthorized') {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  if (decision.kind === 'redirect') redirect(303, decision.location);

  const response = await resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', locale) });
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  if (appOrigin(url.origin).startsWith('https:')) response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  // Personalised pages must not be stored by shared caches.
  if (event.locals.user && !response.headers.has('cache-control')) response.headers.set('cache-control', 'private, no-store');
  return response;
};
