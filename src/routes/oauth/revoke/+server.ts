import { clientIp } from '$lib/server/auth/guard';
import { hit, LIMITS } from '$lib/server/auth/ratelimit';
import { revokeToken } from '$lib/server/mcp/oauth';

/** RFC 7009: always 200, whether or not the token existed. */
export const POST = async (event) => {
  if (hit(`oauth-token:ip:${clientIp(event)}`, LIMITS.oauthTokenPerIp)) return new Response(null, { status: 429 });
  const token = new URLSearchParams(await event.request.text()).get('token');
  if (token) revokeToken(token);
  return new Response(null, { status: 200 });
};
