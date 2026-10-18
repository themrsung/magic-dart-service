import { json } from '@sveltejs/kit';
import { clientIp } from '$lib/server/auth/guard';
import { hit, LIMITS } from '$lib/server/auth/ratelimit';
import { OAuthError, register } from '$lib/server/mcp/oauth';

export const POST = async (event) => {
  if (hit(`oauth-register:ip:${clientIp(event)}`, LIMITS.oauthRegisterPerIp))
    return new OAuthError('temporarily_unavailable', 'too many registrations, try again later', 429).toResponse();
  let body: Record<string, unknown>;
  try {
    body = await event.request.json();
  } catch {
    return new OAuthError('invalid_client_metadata', 'body must be JSON').toResponse();
  }
  try {
    return json(register(body), { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof OAuthError) return err.toResponse();
    throw err;
  }
};
