import { error, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/auth/audit';
import { meta, requireUser } from '$lib/server/auth/guard';
import { hit, LIMITS, retryText } from '$lib/server/auth/ratelimit';
import { approve, deny, metadata, OAuthError, parseAuthRequest } from '$lib/server/mcp/oauth';

/** Consent requires a signed-in user; the approved client is bound to that user. */
export const load = (event) => {
  const user = requireUser(event);
  const parsed = parseAuthRequest(event.url.searchParams, user.id);
  if (!parsed.ok) {
    if ('redirect' in parsed) redirect(302, parsed.redirect);
    error(400, parsed.fatal);
  }
  const { req } = parsed;
  const target = new URL(req.redirect_uri);
  return {
    username: user.username,
    clientName: req.client.client_name,
    clientId: req.client.client_id,
    redirectHost: target.host || target.protocol,
    redirectUri: req.redirect_uri,
    loopback: target.hostname === 'localhost' || target.hostname === '127.0.0.1',
    registeredAt: req.client.created_at,
    previouslyApproved: !!req.client.approved_at
  };
};

export const actions = {
  // The query string still carries the original authorization request; it is re-validated here.
  default: async (event) => {
    const user = requireUser(event);
    const wait = hit(`consent:${user.id}`, LIMITS.oauthConsentPerUser);
    if (wait) error(429, `요청이 너무 많습니다. ${retryText(wait)}`);
    const parsed = parseAuthRequest(event.url.searchParams, user.id);
    if (!parsed.ok) {
      if ('redirect' in parsed) redirect(303, parsed.redirect);
      error(400, parsed.fatal);
    }
    const decision = (await event.request.formData()).get('decision');
    if (decision !== 'approve') redirect(303, deny(parsed.req));
    let location: string;
    try {
      location = approve(parsed.req, metadata(event.url.origin).authorizationServer.issuer, user.id);
    } catch (err) {
      if (err instanceof OAuthError) error(403, '다른 계정에 연결된 클라이언트입니다.');
      throw err;
    }
    audit({ event: 'oauth_client_approved', userId: user.id, username: user.username, ip: meta(event).ip, detail: `${parsed.req.client.client_name} (${parsed.req.client.client_id})` });
    redirect(303, location);
  }
};
