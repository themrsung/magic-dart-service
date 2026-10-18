import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { SessionUser } from './users';

/** Pages and endpoints reachable without a session. Everything else requires one. */
const PUBLIC_EXACT = new Set([
  '/login',
  '/login/2fa',
  '/setup',
  '/register',
  '/api/health',
  '/manifest.webmanifest',
  '/service-worker.js',
  '/favicon.ico',
  '/robots.txt',
  '/lang',
  '/auth/passkey/login/options',
  '/auth/passkey/login/verify',
  // MCP and OAuth machine endpoints authenticate with bearer tokens / PKCE instead.
  '/mcp',
  '/oauth/token',
  '/oauth/register',
  '/oauth/revoke'
]);
const PUBLIC_PREFIXES = ['/_app/', '/icons/', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource'];

/** POSTs from MCP clients (no browser, no cookies), exempt from the same-origin rule. */
export const MACHINE_ENDPOINTS = new Set(['/mcp', '/oauth/token', '/oauth/register', '/oauth/revoke']);

export function isPublicPath(pathname: string): boolean {
  // SvelteKit data requests for a page (e.g. /login/__data.json) follow the page's rule.
  const path = pathname.replace(/\/__data\.json$/, '') || '/';
  return PUBLIC_EXACT.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

export type GuardDecision = { kind: 'allow' } | { kind: 'redirect'; location: string } | { kind: 'unauthorized' };

/**
 * What to do with a request given its session. Browser navigations get sent to /login (or /setup
 * before the first account exists); API calls get a 401.
 */
export function decide(url: URL, user: SessionUser | null, noUsersYet: boolean): GuardDecision {
  if (user || isPublicPath(url.pathname)) return { kind: 'allow' };
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.endsWith('/__data.json')) return { kind: 'unauthorized' };
  if (noUsersYet) return { kind: 'redirect', location: '/setup' };
  const next = url.pathname + url.search;
  return { kind: 'redirect', location: next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}` };
}

/** Only same-site relative paths are followed after login. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  try {
    const u = new URL(raw, 'http://x');
    return u.origin === 'http://x' ? u.pathname + u.search : '/';
  } catch {
    return '/';
  }
}

/** Defence in depth for pages and actions (the hook already blocks anonymous requests). */
export function requireUser(event: Pick<RequestEvent, 'locals' | 'url'>): SessionUser {
  const user = event.locals.user;
  if (!user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
  return user;
}

export function requireAdmin(event: Pick<RequestEvent, 'locals' | 'url'>): SessionUser {
  const user = requireUser(event);
  if (user.role !== 'admin') error(403, '관리자만 사용할 수 있습니다');
  return user;
}

export function clientIp(event: Pick<RequestEvent, 'getClientAddress'>): string {
  try {
    return event.getClientAddress();
  } catch {
    return 'unknown';
  }
}

export function meta(event: Pick<RequestEvent, 'getClientAddress' | 'request'>) {
  return { ip: clientIp(event), userAgent: event.request.headers.get('user-agent') };
}
