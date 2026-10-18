import { createHash, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDb } from '../src/lib/server/db';
import { createUser, setDisabled } from '../src/lib/server/auth/users';
import {
  approve,
  exchange,
  listClients,
  metadata,
  OAuthError,
  parseAuthRequest,
  redirectMatches,
  register,
  revokeClient,
  verifyAccess
} from '../src/lib/server/mcp/oauth';
import { apiKeyStatus, readApiKey, writeApiKey } from '../src/lib/server/settings';

const ORIGIN = 'https://dart.example.com';
const PASSWORD = 'correct horse battery';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function authorize(client_id: string, redirect_uri: string, challenge: string, userId: number) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id,
    redirect_uri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz'
  });
  const parsed = parseAuthRequest(params, userId);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed));
  const location = new URL(approve(parsed.req, ORIGIN, userId));
  expect(location.searchParams.get('state')).toBe('xyz');
  expect(location.searchParams.get('iss')).toBe(ORIGIN);
  return location.searchParams.get('code')!;
}

let alice: number;
let bob: number;

beforeEach(async () => {
  setDb(openDb(':memory:'));
  alice = (await createUser('alice', PASSWORD, 'user')).id;
  bob = (await createUser('bob', PASSWORD, 'user')).id;
});

describe('oauth', () => {
  it('runs the full DCR → consent → token → refresh flow', () => {
    const client = register({ client_name: 'Claude Code', redirect_uris: ['http://localhost:33418/callback'] });
    const { verifier, challenge } = pkce();
    // Loopback redirects may change port (RFC 8252).
    const code = authorize(client.client_id, 'http://localhost:51234/callback', challenge, alice);

    const tokens = exchange(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: client.client_id,
        redirect_uri: 'http://localhost:51234/callback',
        code_verifier: verifier
      })
    );
    expect(verifyAccess(`Bearer ${tokens.access_token}`)).toMatchObject({ client_id: client.client_id, user_id: alice });

    // Codes are single-use.
    expect(() =>
      exchange(new URLSearchParams({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: verifier }))
    ).toThrow(OAuthError);

    // Refresh rotates: the old refresh token stops working, and the grant stays with the same user.
    const next = exchange(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id }));
    expect(verifyAccess(`Bearer ${next.access_token}`)?.user_id).toBe(alice);
    expect(() =>
      exchange(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id }))
    ).toThrow(OAuthError);

    // Revoking the client kills every token.
    expect(revokeClient(client.client_id, { id: alice, asAdmin: false })).toBe(true);
    expect(verifyAccess(`Bearer ${next.access_token}`)).toBeNull();
  });

  it('rejects a wrong PKCE verifier', () => {
    const client = register({ client_name: 'x', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    const { challenge } = pkce();
    const code = authorize(client.client_id, 'https://claude.ai/api/mcp/auth_callback', challenge, alice);
    expect(() =>
      exchange(
        new URLSearchParams({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: pkce().verifier })
      )
    ).toThrow(/PKCE/);
  });

  it('rejects a code redeemed with a different redirect_uri or client', () => {
    const client = register({ client_name: 'x', redirect_uris: ['https://good.example/cb', 'https://good.example/other'] });
    const other = register({ client_name: 'y', redirect_uris: ['https://good.example/cb'] });
    const { verifier, challenge } = pkce();
    const code = authorize(client.client_id, 'https://good.example/cb', challenge, alice);
    expect(() =>
      exchange(new URLSearchParams({ grant_type: 'authorization_code', code, client_id: other.client_id, code_verifier: verifier }))
    ).toThrow(OAuthError);
    const code2 = authorize(client.client_id, 'https://good.example/cb', challenge, alice);
    expect(() =>
      exchange(
        new URLSearchParams({ grant_type: 'authorization_code', code: code2, client_id: client.client_id, redirect_uri: 'https://good.example/other', code_verifier: verifier })
      )
    ).toThrow(/redirect_uri/);
  });

  it('never redirects to an unregistered URI', () => {
    const client = register({ client_name: 'x', redirect_uris: ['https://good.example/cb'] });
    const r = parseAuthRequest(
      new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://evil.example/cb', code_challenge: pkce().challenge, code_challenge_method: 'S256' }),
      alice
    );
    expect(r).toMatchObject({ ok: false, fatal: expect.any(String) });
    expect(redirectMatches(['https://good.example/cb'], 'https://good.example/cb?x=1')).toBe(false);
  });

  it('rejects non-https, non-loopback redirect registration', () => {
    expect(() => register({ redirect_uris: ['http://evil.example/cb'] })).toThrow(OAuthError);
    expect(() => register({ redirect_uris: ['javascript:alert(1)'] })).toThrow(OAuthError);
  });

  it('requires S256 PKCE', () => {
    const client = register({ client_name: 'x', redirect_uris: ['https://good.example/cb'] });
    const r = parseAuthRequest(new URLSearchParams({ response_type: 'code', client_id: client.client_id }), alice);
    expect(r).toMatchObject({ ok: false, redirect: expect.stringContaining('error=invalid_request') });
    const plain = parseAuthRequest(
      new URLSearchParams({ response_type: 'code', client_id: client.client_id, code_challenge: pkce().challenge, code_challenge_method: 'plain' }),
      alice
    );
    expect(plain).toMatchObject({ ok: false, redirect: expect.stringContaining('error=invalid_request') });
  });

  it('rate-limits open registration', () => {
    for (let i = 0; i < 30; i++) register({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    expect(() => register({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] })).toThrow(/too many/);
  });
});

describe('per-user client isolation', () => {
  it('binds a client to the first user who approves it', () => {
    const client = register({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    authorize(client.client_id, 'https://claude.ai/api/mcp/auth_callback', pkce().challenge, alice);

    // Bob cannot open the consent page for Alice's client, nor approve it directly.
    const asBob = parseAuthRequest(
      new URLSearchParams({ response_type: 'code', client_id: client.client_id, code_challenge: pkce().challenge, code_challenge_method: 'S256' }),
      bob
    );
    expect(asBob).toMatchObject({ ok: false, fatal: expect.any(String) });
    const asAlice = parseAuthRequest(
      new URLSearchParams({ response_type: 'code', client_id: client.client_id, code_challenge: pkce().challenge, code_challenge_method: 'S256' }),
      alice
    );
    if (!asAlice.ok) throw new Error('alice should be able to re-authorize');
    expect(() => approve(asAlice.req, ORIGIN, bob)).toThrow(OAuthError);
  });

  it('lists and revokes only your own clients; admins see all', () => {
    const a = register({ client_name: 'A', redirect_uris: ['https://a.example/cb'] });
    const b = register({ client_name: 'B', redirect_uris: ['https://b.example/cb'] });
    authorize(a.client_id, 'https://a.example/cb', pkce().challenge, alice);
    authorize(b.client_id, 'https://b.example/cb', pkce().challenge, bob);

    expect(listClients(alice).map((c) => c.client_name)).toEqual(['A']);
    expect(listClients(bob).map((c) => c.client_name)).toEqual(['B']);
    expect(listClients(null).map((c) => c.client_name).sort()).toEqual(['A', 'B']);

    expect(revokeClient(b.client_id, { id: alice, asAdmin: false })).toBe(false);
    expect(listClients(bob)[0].revoked_at).toBeNull();
    expect(revokeClient(b.client_id, { id: alice, asAdmin: true })).toBe(true);
    expect(listClients(bob)[0].revoked_at).not.toBeNull();
  });

  it('stops honouring tokens when their user is disabled', () => {
    const client = register({ client_name: 'x', redirect_uris: ['https://good.example/cb'] });
    const { verifier, challenge } = pkce();
    const code = authorize(client.client_id, 'https://good.example/cb', challenge, alice);
    const tokens = exchange(new URLSearchParams({ grant_type: 'authorization_code', code, client_id: client.client_id, code_verifier: verifier }));
    setDisabled(alice, true);
    expect(verifyAccess(`Bearer ${tokens.access_token}`)).toBeNull();
    expect(() =>
      exchange(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id }))
    ).toThrow(OAuthError);
  });
});

describe('single origin', () => {
  it('serves consent, tokens and the resource from ORIGIN', () => {
    process.env.ORIGIN = ORIGIN;
    try {
      const m = metadata('http://internal:3000');
      expect(m.authorizationServer.issuer).toBe(ORIGIN);
      expect(m.authorizationServer.authorization_endpoint).toBe(`${ORIGIN}/oauth/authorize`);
      expect(m.authorizationServer.token_endpoint).toBe(`${ORIGIN}/oauth/token`);
      expect(m.protectedResource).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });
    } finally {
      delete process.env.ORIGIN;
    }
  });
});

describe('api key storage', () => {
  it('exposes only status, never the value', () => {
    const key = 'f'.repeat(40);
    writeApiKey(key);
    const status = apiKeyStatus();
    expect(status.configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain(key);
    expect(readApiKey()).toBe(key);
  });
});
