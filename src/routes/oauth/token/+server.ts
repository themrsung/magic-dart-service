import { json } from '@sveltejs/kit';
import { clientIp } from '$lib/server/auth/guard';
import { hit, LIMITS } from '$lib/server/auth/ratelimit';
import { exchange, OAuthError } from '$lib/server/mcp/oauth';

export const POST = async (event) => {
  if (hit(`oauth-token:ip:${clientIp(event)}`, LIMITS.oauthTokenPerIp)) return new OAuthError('slow_down', 'too many requests', 429).toResponse();
  const form = new URLSearchParams(await event.request.text());
  try {
    return json(exchange(form), { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } });
  } catch (err) {
    if (err instanceof OAuthError) return err.toResponse();
    throw err;
  }
};
