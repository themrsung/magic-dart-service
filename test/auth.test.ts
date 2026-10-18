import { isHttpError, isRedirect, type Cookies } from '@sveltejs/kit';
import { generateSync } from 'otplib';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, openDb, setDb } from '../src/lib/server/db';
import { beginTotp, confirmTotp, generateRecoveryCodes, recoveryCodesLeft, useRecoveryCode, verifyTotp } from '../src/lib/server/auth/factors';
import { decide, safeNext } from '../src/lib/server/auth/guard';
import { GENERIC_LOGIN_ERROR, passwordStep } from '../src/lib/server/auth/login';
import { hashPassword, passwordProblem, verifyPassword } from '../src/lib/server/auth/password';
import { hit, lockedFor, recordFailure, recordSuccess, resetLimits } from '../src/lib/server/auth/ratelimit';
import {
  ABSOLUTE_TTL,
  createSession,
  IDLE_TTL,
  PENDING_COOKIE,
  readPendingLogin,
  revokeAllSessions,
  revokeSession,
  SESSION_COOKIE,
  validateSession
} from '../src/lib/server/auth/sessions';
import { checkSetupToken, createInvite, createUser, register, setDisabled, setRole, setupDone, type SessionUser } from '../src/lib/server/auth/users';
import { sha256 } from '../src/lib/server/auth/config';

const PASSWORD = 'correct horse battery';

class FakeCookies {
  jar = new Map<string, string>();
  get(name: string) {
    return this.jar.get(name);
  }
  getAll() {
    return [...this.jar].map(([name, value]) => ({ name, value }));
  }
  set(name: string, value: string) {
    this.jar.set(name, value);
  }
  delete(name: string) {
    this.jar.delete(name);
  }
  serialize() {
    return '';
  }
}

function fakeEvent(opts: { path?: string; user?: SessionUser | null; sessionId?: string | null; form?: Record<string, string>; cookies?: FakeCookies } = {}) {
  const url = new URL(opts.path ?? '/', 'https://dart.example.com');
  const body = new FormData();
  for (const [k, v] of Object.entries(opts.form ?? {})) body.set(k, v);
  return {
    url,
    params: {},
    locals: { user: opts.user ?? null, sessionId: opts.sessionId ?? null },
    cookies: (opts.cookies ?? new FakeCookies()) as unknown as Cookies,
    request: new Request(url, { method: 'POST', body, headers: { origin: url.origin, 'user-agent': 'vitest' } }),
    getClientAddress: () => '203.0.113.7'
  };
}

/** Runs `fn` and returns what SvelteKit would turn into a response: a redirect, an HTTP error, or the value. */
async function outcome(fn: () => unknown) {
  try {
    return { value: await fn() };
  } catch (err) {
    if (isRedirect(err)) return { redirect: err.location, status: err.status };
    if (isHttpError(err)) return { error: err.status, message: err.body.message };
    throw err;
  }
}

beforeEach(() => {
  setDb(openDb(':memory:'));
  resetLimits();
  setupDone();
});

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const h = await hashPassword(PASSWORD);
    expect(h).toMatch(/^\$argon2id\$/);
    expect(h).not.toContain(PASSWORD);
    expect(await verifyPassword(h, PASSWORD)).toBe(true);
    expect(await verifyPassword(h, PASSWORD + '!')).toBe(false);
    expect(await verifyPassword('not-a-hash', PASSWORD)).toBe(false);
  });

  it('enforces length and the common-password list, without composition rules', () => {
    expect(passwordProblem('short')).toMatch(/10자/);
    expect(passwordProblem('Password123')).toMatch(/흔한/);
    expect(passwordProblem('qwertyuiop')).toMatch(/흔한/);
    expect(passwordProblem('aaaaaaaaaaaa')).not.toBeNull();
    expect(passwordProblem('alice-is-great', 'alice')).toMatch(/아이디/);
    // All lowercase, no digits or symbols: fine.
    expect(passwordProblem('correct horse battery')).toBeNull();
  });
});

describe('TOTP', () => {
  it('enrolls with a confirm step, verifies, and rejects replays', async () => {
    const user = await createUser('alice', PASSWORD, 'user');
    const { secret, uri, qr } = await beginTotp(user.id);
    expect(uri).toMatch(/^otpauth:\/\/totp\/MagicDART:alice\?/);
    expect(qr).toMatch(/^data:image\/png;base64,/);

    // Stored encrypted, and not active until confirmed.
    const row = db().prepare('SELECT totp_secret, totp_pending FROM users WHERE id = ?').get(user.id) as { totp_secret: string | null; totp_pending: string };
    expect(row.totp_secret).toBeNull();
    expect(row.totp_pending).not.toContain(secret);
    expect(verifyTotp(user.id, generateSync({ secret }))).toBe(false);

    const t0 = 1_800_000_000;
    expect(confirmTotp(user.id, '000000', t0)).toBe(false);
    expect(confirmTotp(user.id, generateSync({ secret, epoch: t0 }), t0)).toBe(true);

    // The enrollment code's step is spent; the next step's code works once.
    expect(verifyTotp(user.id, generateSync({ secret, epoch: t0 }), t0)).toBe(false);
    const next = generateSync({ secret, epoch: t0 + 30 });
    expect(verifyTotp(user.id, next, t0 + 30)).toBe(true);
    expect(verifyTotp(user.id, next, t0 + 30)).toBe(false);
    expect(verifyTotp(user.id, '123456', t0 + 60)).toBe(false);
    // Codes far outside the drift window are rejected.
    expect(verifyTotp(user.id, generateSync({ secret, epoch: t0 + 300 }), t0 + 120)).toBe(false);
  });
});

describe('recovery codes', () => {
  it('issues 10 single-use codes, stored hashed', async () => {
    const user = await createUser('alice', PASSWORD, 'user');
    const codes = generateRecoveryCodes(user.id);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const stored = db().prepare('SELECT code_hash FROM recovery_codes WHERE user_id = ?').all(user.id) as { code_hash: string }[];
    expect(stored.some((r) => codes.some((c) => r.code_hash.includes(c.replace('-', ''))))).toBe(false);

    expect(useRecoveryCode(user.id, codes[0].toLowerCase())).toBe(true); // case-insensitive
    expect(useRecoveryCode(user.id, codes[0])).toBe(false); // single use
    expect(useRecoveryCode(user.id, codes[1].replace('-', ''))).toBe(true);
    expect(recoveryCodesLeft(user.id)).toBe(8);

    // Regenerating invalidates the old set.
    generateRecoveryCodes(user.id);
    expect(useRecoveryCode(user.id, codes[2])).toBe(false);
    expect(recoveryCodesLeft(user.id)).toBe(10);
  });

  it('cannot be used for another account', async () => {
    const alice = await createUser('alice', PASSWORD, 'user');
    const bob = await createUser('bob', PASSWORD, 'user');
    const codes = generateRecoveryCodes(alice.id);
    expect(useRecoveryCode(bob.id, codes[0])).toBe(false);
  });
});

describe('sessions', () => {
  it('stores only a hash and resolves the user', async () => {
    const user = await createUser('alice', PASSWORD, 'admin');
    const token = createSession(user.id, 'password');
    expect(token).toHaveLength(43); // 256 bits, base64url
    expect(db().prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(token)).toBeUndefined();
    expect(validateSession(token)?.user).toEqual({ id: user.id, username: 'alice', role: 'admin' });
    expect(validateSession('nope')).toBeNull();
  });

  it('expires after the idle timeout', async () => {
    const user = await createUser('alice', PASSWORD, 'user');
    const token = createSession(user.id, 'password');
    const now = Date.now();
    expect(validateSession(token, now + IDLE_TTL - 60_000)).not.toBeNull(); // touches last_seen_at
    expect(validateSession(token, now + 2 * IDLE_TTL - 120_000)).not.toBeNull();
    expect(validateSession(token, now + 3 * IDLE_TTL)).toBeNull();
  });

  it('expires at the absolute limit even when active', async () => {
    const user = await createUser('alice', PASSWORD, 'user');
    const token = createSession(user.id, 'password');
    const start = Date.now();
    for (let t = start; t < start + ABSOLUTE_TTL - 24 * 3600_000; t += 24 * 3600_000) expect(validateSession(token, t)).not.toBeNull();
    expect(validateSession(token, start + ABSOLUTE_TTL + 1)).toBeNull();
  });

  it('can be revoked individually, all at once, and by disabling or demoting the user', async () => {
    const user = await createUser('alice', PASSWORD, 'admin');
    await createUser('root', PASSWORD, 'admin');
    const a = createSession(user.id, 'password');
    const b = createSession(user.id, 'password');
    const c = createSession(user.id, 'password');
    revokeSession(sha256(a));
    expect(validateSession(a)).toBeNull();
    expect(revokeAllSessions(user.id, sha256(b))).toBe(1);
    expect(validateSession(b)).not.toBeNull();
    expect(validateSession(c)).toBeNull();

    setRole(user.id, 'user');
    expect(validateSession(b)).toBeNull();

    const d = createSession(user.id, 'password');
    setDisabled(user.id, true);
    expect(validateSession(d)).toBeNull();
  });
});

describe('rate limiting', () => {
  it('allows up to the limit per window', () => {
    const limit = { max: 3, windowMs: 1000 };
    expect(hit('k', limit, 0)).toBe(0);
    expect(hit('k', limit, 10)).toBe(0);
    expect(hit('k', limit, 20)).toBe(0);
    expect(hit('k', limit, 30)).toBe(970);
    expect(hit('other', limit, 30)).toBe(0);
    expect(hit('k', limit, 1001)).toBe(0);
  });

  it('locks an account progressively after repeated failures', () => {
    for (let i = 0; i < 4; i++) expect(recordFailure('alice', 0)).toBe(0);
    expect(recordFailure('alice', 0)).toBe(60_000);
    expect(lockedFor('ALICE', 30_000)).toBe(30_000);
    expect(recordFailure('alice', 61_000)).toBe(120_000);
    recordSuccess('alice');
    expect(lockedFor('alice', 61_000)).toBe(0);
  });

  it('applies to the login form, with the same message for unknown users', async () => {
    await createUser('alice', PASSWORD, 'user');
    const wrong = await passwordStep(fakeEvent(), 'alice', 'wrong password!');
    const unknown = await passwordStep(fakeEvent(), 'nobody', 'wrong password!');
    expect(wrong).toEqual({ kind: 'error', message: GENERIC_LOGIN_ERROR, status: 400 });
    expect(unknown).toEqual(wrong);

    for (let i = 0; i < 4; i++) await passwordStep(fakeEvent(), 'alice', 'wrong password!');
    // Fifth failure locks; now even the right password is refused.
    const locked = await passwordStep(fakeEvent(), 'alice', PASSWORD);
    expect(locked).toMatchObject({ kind: 'error', status: 429 });
    // Unknown usernames lock the same way (no enumeration through lockouts).
    for (let i = 0; i < 4; i++) await passwordStep(fakeEvent(), 'nobody', 'x'.repeat(12));
    expect(await passwordStep(fakeEvent(), 'nobody', 'x'.repeat(12))).toMatchObject({ kind: 'error', status: 429 });
  });

  it('caps login attempts per IP', async () => {
    let last;
    for (let i = 0; i < 31; i++) last = await passwordStep(fakeEvent(), `user${i}`, 'x'.repeat(12));
    expect(last).toMatchObject({ kind: 'error', status: 429 });
  });
});

describe('login flow', () => {
  it('issues a session directly, or a pending login when a second factor exists', async () => {
    const alice = await createUser('alice', PASSWORD, 'user');
    const cookies = new FakeCookies();
    expect(await passwordStep(fakeEvent({ cookies }), 'Alice', PASSWORD)).toEqual({ kind: 'done' });
    expect(validateSession(cookies.get(SESSION_COOKIE))?.user.id).toBe(alice.id);

    const { secret } = await beginTotp(alice.id);
    confirmTotp(alice.id, generateSync({ secret }));
    const c2 = new FakeCookies();
    expect(await passwordStep(fakeEvent({ cookies: c2 }), 'alice', PASSWORD)).toEqual({ kind: 'second-factor' });
    expect(c2.get(SESSION_COOKIE)).toBeUndefined();
    expect(c2.get(PENDING_COOKIE)).toBeDefined();
    expect(readPendingLogin(c2 as unknown as Cookies)?.userId).toBe(alice.id);
  });

  it('completes the second factor on /login/2fa and rotates the session', async () => {
    const { actions } = await import('../src/routes/login/2fa/+page.server');
    const alice = await createUser('alice', PASSWORD, 'user');
    const { secret } = await beginTotp(alice.id);
    const t = Math.floor(Date.now() / 1000);
    confirmTotp(alice.id, generateSync({ secret, epoch: t - 30 }), t - 30);
    const cookies = new FakeCookies();
    const before = createSession(alice.id, 'password');
    cookies.set(SESSION_COOKIE, before);
    await passwordStep(fakeEvent({ cookies }), 'alice', PASSWORD);

    const bad = await outcome(() => actions.verify(fakeEvent({ path: '/login/2fa', cookies, form: { kind: 'totp', code: '000000', next: '/' } }) as never));
    expect(bad.value).toMatchObject({ status: 400 });
    const good = await outcome(() =>
      actions.verify(fakeEvent({ path: '/login/2fa', cookies, form: { kind: 'totp', code: generateSync({ secret }), next: '/corp/00126380' } }) as never)
    );
    expect(good.redirect).toBe('/corp/00126380');
    const after = cookies.get(SESSION_COOKIE)!;
    expect(after).not.toBe(before);
    expect(validateSession(before)).toBeNull(); // the pre-login session was replaced
    expect(validateSession(after)?.user.id).toBe(alice.id);
    expect(cookies.get(PENDING_COOKIE)).toBeUndefined();
  });
});

describe('route guard', () => {
  const u = (p: string) => new URL(p, 'https://dart.example.com');
  const user: SessionUser = { id: 1, username: 'alice', role: 'user' };

  it('sends anonymous page views to /login with a return path', () => {
    expect(decide(u('/corp/00126380?tab=financials'), null, false)).toEqual({
      kind: 'redirect',
      location: '/login?next=%2Fcorp%2F00126380%3Ftab%3Dfinancials'
    });
    expect(decide(u('/'), null, false)).toEqual({ kind: 'redirect', location: '/login' });
    expect(decide(u('/'), null, true)).toEqual({ kind: 'redirect', location: '/setup' });
  });

  it('answers 401 for anonymous API and data requests', () => {
    expect(decide(u('/api/search?q=삼성'), null, false)).toEqual({ kind: 'unauthorized' });
    expect(decide(u('/admin/__data.json'), null, false)).toEqual({ kind: 'unauthorized' });
    expect(decide(u('/auth/passkey/register/options'), null, false)).toEqual({ kind: 'unauthorized' });
  });

  it('leaves public and machine endpoints open', () => {
    for (const p of ['/login', '/login/__data.json', '/login/2fa', '/setup', '/register', '/api/health', '/mcp', '/oauth/token', '/oauth/register', '/oauth/revoke', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/mcp', '/_app/immutable/x.js', '/icons/icon-192.png', '/manifest.webmanifest', '/service-worker.js', '/auth/passkey/login/options'])
      expect(decide(u(p), null, false), p).toEqual({ kind: 'allow' });
    // The consent page is not public.
    expect(decide(u('/oauth/authorize?client_id=x'), null, false).kind).toBe('redirect');
    expect(decide(u('/admin'), user, false)).toEqual({ kind: 'allow' });
  });

  it('only follows same-site relative return paths', () => {
    expect(safeNext('/corp/1?tab=x')).toBe('/corp/1?tab=x');
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', null]) expect(safeNext(bad)).toBe('/');
  });
});

describe('server hook', () => {
  it('enforces the guard, the same-origin rule and security headers', async () => {
    const { handle } = await import('../src/hooks.server');
    const user = await createUser('alice', PASSWORD, 'user');
    const resolve = async () => new Response('ok');
    const run = (path: string, init: RequestInit = {}, token?: string) => {
      const ev = fakeEvent({ path });
      const cookies = ev.cookies as unknown as FakeCookies;
      if (token) cookies.set(SESSION_COOKIE, token);
      const event = { ...ev, request: new Request(ev.url, init) };
      return outcome(() => handle({ event: event as never, resolve: resolve as never }));
    };

    expect(await run('/admin')).toMatchObject({ redirect: '/login?next=%2Fadmin', status: 303 });
    const api = (await run('/api/search?q=x')).value as Response;
    expect(api.status).toBe(401);

    const token = createSession(user.id, 'password');
    const ok = (await run('/', {}, token)).value as Response;
    expect(ok.status).toBe(200);
    expect(ok.headers.get('x-frame-options')).toBe('DENY');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(ok.headers.get('cache-control')).toBe('private, no-store');

    const csrf = (await run('/account?/password', { method: 'POST', headers: { origin: 'https://evil.example' } }, token)).value as Response;
    expect(csrf.status).toBe(403);
    const noOrigin = (await run('/logout', { method: 'POST' }, token)).value as Response;
    expect(noOrigin.status).toBe(403);
    // MCP clients may post without an Origin header.
    const tokenEndpoint = (await run('/oauth/token', { method: 'POST', body: 'grant_type=x' })).value as Response;
    expect(tokenEndpoint.status).toBe(200);
  });
});

describe('OAuth consent', () => {
  it('requires a signed-in user', async () => {
    const page = await import('../src/routes/oauth/authorize/+page.server');
    const { register: dcr } = await import('../src/lib/server/mcp/oauth');
    const client = dcr({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    const qs = `client_id=${client.client_id}&response_type=code&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256`;
    const path = `/oauth/authorize?${qs}`;

    const anon = await outcome(() => page.load(fakeEvent({ path }) as never));
    expect(anon.redirect).toBe(`/login?next=${encodeURIComponent(path)}`);
    const anonPost = await outcome(() => page.actions.default(fakeEvent({ path, form: { decision: 'approve' } }) as never));
    expect(anonPost.redirect).toMatch(/^\/login\?next=/);

    const alice = await createUser('alice', PASSWORD, 'user');
    const me = { id: alice.id, username: 'alice', role: 'user' as const };
    const shown = await outcome(() => page.load(fakeEvent({ path, user: me }) as never));
    expect(shown.value).toMatchObject({ clientName: 'Claude', username: 'alice' });
    const approved = await outcome(() => page.actions.default(fakeEvent({ path, user: me, form: { decision: 'approve' } }) as never));
    expect(approved.redirect).toMatch(/^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?code=/);
  });
});

describe('admin-only settings', () => {
  it('refuses ordinary users and allows admins', async () => {
    process.env.EGRESS_IP_LOOKUP = 'off';
    const page = await import('../src/routes/admin/+page.server');
    const user = await createUser('alice', PASSWORD, 'user');
    const admin = await createUser('root', PASSWORD, 'admin');
    const asUser = { id: user.id, username: 'alice', role: 'user' as const };
    const asAdmin = { id: admin.id, username: 'root', role: 'admin' as const };

    expect(await outcome(() => page.load(fakeEvent({ path: '/admin', user: asUser }) as never))).toMatchObject({ error: 403 });
    for (const [name, action] of Object.entries(page.actions)) {
      const r = await outcome(() => (action as (e: unknown) => unknown)(fakeEvent({ path: '/admin', user: asUser, form: { key: 'a'.repeat(40), job: 'corpCodes', id: String(admin.id), op: 'disable' } })));
      expect(r, name).toMatchObject({ error: 403 });
    }
    expect(await outcome(() => page.actions.setKey(fakeEvent({ path: '/admin' }) as never))).toMatchObject({ redirect: expect.stringMatching(/^\/login/) });

    const loaded = await outcome(() => page.load(fakeEvent({ path: '/admin', user: asAdmin }) as never));
    expect(loaded.value).toMatchObject({ key: { configured: false } });
    const invited = await outcome(() => page.actions.invite(fakeEvent({ path: '/admin', user: asAdmin, form: { role: 'user' } }) as never));
    expect((invited.value as { inviteUrl: string }).inviteUrl).toMatch(/\/register\?invite=/);
  });
});

describe('setup and registration', () => {
  it('accepts only the setup token, and only before the first account', async () => {
    process.env.SETUP_TOKEN = 'setup-token-for-tests';
    try {
      expect(checkSetupToken('wrong')).toBe(false);
      expect(checkSetupToken('setup-token-for-tests')).toBe(true);
      await createUser('root', PASSWORD, 'admin');
      expect(checkSetupToken('setup-token-for-tests')).toBe(false);
    } finally {
      delete process.env.SETUP_TOKEN;
    }
  });

  it('honours REGISTRATION and single-use invites', async () => {
    const admin = await createUser('root', PASSWORD, 'admin');
    const invite = createInvite(admin.id, 'user', 'for bob');
    await expect(register('mallory', PASSWORD, null)).rejects.toThrow(/초대/); // default: invite
    const bob = await register('bob', PASSWORD, invite);
    expect(bob.role).toBe('user');
    await expect(register('eve', PASSWORD, invite)).rejects.toThrow(/만료|사용/);

    process.env.REGISTRATION = 'closed';
    await expect(register('carol', PASSWORD, createInvite(admin.id, 'user', null))).rejects.toThrow(/닫혀/);
    process.env.REGISTRATION = 'open';
    expect((await register('dave', PASSWORD, null)).role).toBe('user');
    delete process.env.REGISTRATION;
  });
});

describe('form actions', () => {
  it('never mixes a default action with named ones (SvelteKit rejects that at runtime)', async () => {
    const pages = import.meta.glob('../src/routes/**/+page.server.ts');
    for (const [file, load] of Object.entries(pages)) {
      const mod = (await load()) as { actions?: Record<string, unknown> };
      const names = Object.keys(mod.actions ?? {});
      if (names.includes('default')) expect(names, file).toEqual(['default']);
    }
  });
});
