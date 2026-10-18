import { ts } from '../i18n';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { appOrigin } from '../auth/config';
import { db } from '../db';

export const SCOPE = 'dart:read';
const CODE_TTL = 10 * 60 * 1000;
const ACCESS_TTL = 60 * 60 * 1000;
const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const token = (bytes = 32) => randomBytes(bytes).toString('base64url');

export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400
  ) {
    super(description);
  }
  toResponse(): Response {
    return Response.json({ error: this.error, error_description: this.description }, { status: this.status, headers: { 'cache-control': 'no-store' } });
  }
}

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: number;
  approved_at: number | null;
  revoked_at: number | null;
  /** The account that approved it first; null until then. Its grants act as that user. */
  user_id: number | null;
}

/** The app, the MCP endpoint and the authorization server all live on the single ORIGIN. */
export function metadata(requestOrigin?: string) {
  const issuer = appOrigin(requestOrigin);
  return {
    authorizationServer: {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE]
    },
    protectedResource: {
      resource: `${issuer}/mcp`,
      authorization_servers: [issuer],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'MagicDART (OpenDART 캐시)'
    }
  };
}

function isLoopback(u: URL): boolean {
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]');
}

function validRedirect(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const u = new URL(raw);
    if (u.hash) return false;
    // https, loopback http (RFC 8252 §7.3), or a private-use scheme for native apps (§7.1).
    return u.protocol === 'https:' || isLoopback(u) || /^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/.test(u.protocol);
  } catch {
    return false;
  }
}

/** Exact match, except loopback redirects may use any port (RFC 8252 §7.3). */
export function redirectMatches(registered: string[], candidate: string): boolean {
  if (registered.includes(candidate)) return true;
  let c: URL;
  try {
    c = new URL(candidate);
  } catch {
    return false;
  }
  if (!isLoopback(c)) return false;
  return registered.some((r) => {
    const u = new URL(r);
    return isLoopback(u) && u.hostname === c.hostname && u.pathname === c.pathname && u.search === c.search;
  });
}

// ── Dynamic client registration (RFC 7591) ─────────────────────────────

const REGISTRATIONS_PER_HOUR = 30;

/**
 * Registration is open to the internet (DCR) and grants nothing by itself: a client only gets
 * tokens after a signed-in user approves it on the consent page.
 */
export function register(body: Record<string, unknown>) {
  // Global cap on top of the per-IP limit in the route, so nobody can flood the table.
  const recent = db().prepare('SELECT COUNT(*) AS n FROM oauth_clients WHERE created_at > ?').get(Date.now() - 60 * 60 * 1000) as { n: number };
  if (recent.n >= REGISTRATIONS_PER_HOUR) throw new OAuthError('temporarily_unavailable', 'too many registrations, try again later', 429);
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every(validRedirect))
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be https, loopback http, or a private-use scheme');
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none')
    throw new OAuthError('invalid_client_metadata', 'only public clients (token_endpoint_auth_method=none) are supported');
  const name = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : '이름 없는 MCP 클라이언트';
  const client_id = `mcp_${token(16)}`;
  const now = Date.now();
  db()
    .prepare('INSERT INTO oauth_clients (client_id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)')
    .run(client_id, name, JSON.stringify(uris), now);
  return {
    client_id,
    client_id_issued_at: Math.floor(now / 1000),
    client_name: name,
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: SCOPE
  };
}

export function getClient(client_id: string): OAuthClient | undefined {
  const r = db().prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(client_id) as
    | (Omit<OAuthClient, 'redirect_uris'> & { redirect_uris: string })
    | undefined;
  return r && { ...r, redirect_uris: JSON.parse(r.redirect_uris) };
}

// ── Authorization request ──────────────────────────────────────────────

export interface AuthRequest {
  client: OAuthClient;
  redirect_uri: string;
  state: string | null;
  code_challenge: string;
  scope: string;
  resource: string | null;
}

/**
 * Validates /oauth/authorize parameters for the signed-in `userId`. Problems with client_id or
 * redirect_uri are shown on the page (never redirected); everything else is reported back to the client.
 */
export function parseAuthRequest(
  params: URLSearchParams,
  userId: number
): { ok: true; req: AuthRequest } | { ok: false; fatal: string } | { ok: false; redirect: string } {
  const client = getClient(params.get('client_id') ?? '');
  if (!client || client.revoked_at) return { ok: false, fatal: ts('auth.consent.unknownClient') };
  // A client belongs to whoever approved it first; nobody else can approve (and so use) it.
  if (client.user_id !== null && client.user_id !== userId) return { ok: false, fatal: ts('auth.consent.otherAccountRestart') };
  const redirect_uri = params.get('redirect_uri') ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : '');
  if (!redirect_uri || !redirectMatches(client.redirect_uris, redirect_uri)) return { ok: false, fatal: ts('auth.consent.redirectMismatch') };
  const state = params.get('state');
  const fail = (error: string, description: string) => ({ ok: false as const, redirect: errorRedirect(redirect_uri, state, error, description) });
  if (params.get('response_type') !== 'code') return fail('unsupported_response_type', 'response_type must be code');
  const code_challenge = params.get('code_challenge');
  if (!code_challenge || !/^[A-Za-z0-9_-]{43,128}$/.test(code_challenge)) return fail('invalid_request', 'PKCE code_challenge required');
  if ((params.get('code_challenge_method') ?? 'plain') !== 'S256') return fail('invalid_request', 'code_challenge_method must be S256');
  const requested = (params.get('scope') ?? SCOPE).split(' ').filter(Boolean);
  if (requested.some((s) => s !== SCOPE)) return fail('invalid_scope', `only ${SCOPE} is supported`);
  return { ok: true, req: { client, redirect_uri, state, code_challenge, scope: SCOPE, resource: params.get('resource') } };
}

function errorRedirect(redirect_uri: string, state: string | null, error: string, description: string): string {
  const u = new URL(redirect_uri);
  u.searchParams.set('error', error);
  u.searchParams.set('error_description', description);
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

export function approve(req: AuthRequest, issuer: string, userId: number): string {
  const code = token();
  db().transaction(() => {
    // Binds the client to this user on first approval; refuses if someone else got there first.
    const bound = db()
      .prepare('UPDATE oauth_clients SET approved_at = ?, user_id = ? WHERE client_id = ? AND revoked_at IS NULL AND (user_id IS NULL OR user_id = ?)')
      .run(Date.now(), userId, req.client.client_id, userId);
    if (bound.changes !== 1) throw new OAuthError('access_denied', 'client belongs to another user', 403);
    db()
      .prepare(
        `INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, scope, resource, expires_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(sha256(code), req.client.client_id, req.redirect_uri, req.code_challenge, req.scope, req.resource, Date.now() + CODE_TTL, userId);
  })();
  const u = new URL(req.redirect_uri);
  u.searchParams.set('code', code);
  if (req.state) u.searchParams.set('state', req.state);
  u.searchParams.set('iss', issuer);
  return u.toString();
}

export function deny(req: AuthRequest): string {
  return errorRedirect(req.redirect_uri, req.state, 'access_denied', ts('auth.consent.denied'));
}

// ── Token endpoint ─────────────────────────────────────────────────────

function issueTokens(client_id: string, user_id: number, scope: string) {
  const access = token();
  const refresh = token();
  const now = Date.now();
  const put = db().prepare('INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, scope, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  put.run(sha256(access), 'access', client_id, user_id, scope, now + ACCESS_TTL, now);
  put.run(sha256(refresh), 'refresh', client_id, user_id, scope, now + REFRESH_TTL, now);
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope };
}

function pkceOk(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The grant's user must still be active and still own the client. */
function ownerActive(client: OAuthClient, user_id: number): boolean {
  if (client.user_id !== user_id) return false;
  const u = db().prepare('SELECT disabled_at FROM users WHERE id = ?').get(user_id) as { disabled_at: number | null } | undefined;
  return !!u && !u.disabled_at;
}

export function exchange(form: URLSearchParams) {
  const grant = form.get('grant_type');
  const client_id = form.get('client_id') ?? '';
  const client = getClient(client_id);
  if (!client || client.revoked_at) throw new OAuthError('invalid_client', 'unknown or revoked client', 401);

  if (grant === 'authorization_code') {
    const code = form.get('code') ?? '';
    const row = db()
      .prepare('SELECT * FROM oauth_codes WHERE code_hash = ?')
      .get(sha256(code)) as { client_id: string; redirect_uri: string; code_challenge: string; scope: string; expires_at: number; user_id: number } | undefined;
    // Single use: delete before validating so a replay never succeeds.
    db().prepare('DELETE FROM oauth_codes WHERE code_hash = ? OR expires_at < ?').run(sha256(code), Date.now());
    if (!row || row.expires_at < Date.now() || row.client_id !== client_id) throw new OAuthError('invalid_grant', 'invalid or expired code');
    if ((form.get('redirect_uri') ?? row.redirect_uri) !== row.redirect_uri) throw new OAuthError('invalid_grant', 'redirect_uri mismatch');
    if (!pkceOk(form.get('code_verifier') ?? '', row.code_challenge)) throw new OAuthError('invalid_grant', 'PKCE verification failed');
    if (!ownerActive(client, row.user_id)) throw new OAuthError('invalid_grant', 'the approving account is no longer active');
    return issueTokens(client_id, row.user_id, row.scope);
  }

  if (grant === 'refresh_token') {
    const hash = sha256(form.get('refresh_token') ?? '');
    const row = db().prepare(`SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'`).get(hash) as
      | { client_id: string; scope: string; expires_at: number; user_id: number }
      | undefined;
    if (!row || row.client_id !== client_id || row.expires_at < Date.now()) throw new OAuthError('invalid_grant', 'invalid refresh token');
    // Rotation: the presented refresh token is spent even if what follows fails.
    if (db().prepare('DELETE FROM oauth_tokens WHERE token_hash = ?').run(hash).changes !== 1) throw new OAuthError('invalid_grant', 'invalid refresh token');
    if (!ownerActive(client, row.user_id)) throw new OAuthError('invalid_grant', 'the approving account is no longer active');
    return issueTokens(client_id, row.user_id, row.scope);
  }

  throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
}

export function revokeToken(raw: string): void {
  db().prepare('DELETE FROM oauth_tokens WHERE token_hash = ?').run(sha256(raw));
}

/** Resolves a bearer token to its client and user, or null. */
export function verifyAccess(header: string | null): { client_id: string; user_id: number; scope: string } | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  if (!m) return null;
  const row = db()
    .prepare(
      `SELECT t.client_id, t.user_id, t.scope, t.expires_at FROM oauth_tokens t
       JOIN oauth_clients c ON c.client_id = t.client_id
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.kind = 'access' AND c.revoked_at IS NULL AND c.user_id = t.user_id AND u.disabled_at IS NULL`
    )
    .get(sha256(m[1])) as { client_id: string; user_id: number; scope: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  db().prepare('UPDATE oauth_tokens SET last_used_at = ? WHERE token_hash = ?').run(Date.now(), sha256(m[1]));
  return { client_id: row.client_id, user_id: row.user_id, scope: row.scope };
}

// ── Management (account and admin pages) ───────────────────────────────

/** Clients approved by `userId`, or every approved client when `userId` is null (admins). */
export function listClients(userId: number | null) {
  return db()
    .prepare(
      `SELECT c.client_id, c.client_name, c.redirect_uris, c.created_at, c.approved_at, c.revoked_at, c.user_id, u.username,
              MAX(t.last_used_at) AS last_used_at,
              SUM(t.kind = 'refresh' AND t.expires_at > @now) AS active_grants
       FROM oauth_clients c LEFT JOIN oauth_tokens t ON t.client_id = c.client_id LEFT JOIN users u ON u.id = c.user_id
       WHERE c.user_id IS NOT NULL AND (@user IS NULL OR c.user_id = @user)
       GROUP BY c.client_id ORDER BY c.revoked_at IS NOT NULL, COALESCE(MAX(t.last_used_at), c.created_at) DESC`
    )
    .all({ now: Date.now(), user: userId }) as {
    client_id: string;
    client_name: string;
    redirect_uris: string;
    created_at: number;
    approved_at: number | null;
    revoked_at: number | null;
    user_id: number;
    username: string | null;
    last_used_at: number | null;
    active_grants: number | null;
  }[];
}

/** Users may revoke only their own clients; admins (`asAdmin`) may revoke any. */
export function revokeClient(client_id: string, actor: { id: number; asAdmin: boolean }): boolean {
  const client = getClient(client_id);
  if (!client || (!actor.asAdmin && client.user_id !== actor.id)) return false;
  db().transaction(() => {
    db().prepare('UPDATE oauth_clients SET revoked_at = ? WHERE client_id = ?').run(Date.now(), client_id);
    db().prepare('DELETE FROM oauth_tokens WHERE client_id = ?').run(client_id);
    db().prepare('DELETE FROM oauth_codes WHERE client_id = ?').run(client_id);
  })();
  return true;
}

/** Housekeeping: expired codes/tokens. */
export function purgeExpired(): void {
  const now = Date.now();
  db().prepare('DELETE FROM oauth_codes WHERE expires_at < ?').run(now);
  db().prepare('DELETE FROM oauth_tokens WHERE expires_at < ?').run(now);
  // Registrations nobody ever approved (abandoned or drive-by) go after a week.
  db().prepare('DELETE FROM oauth_clients WHERE approved_at IS NULL AND created_at < ?').run(now - 7 * 24 * 60 * 60 * 1000);
}
