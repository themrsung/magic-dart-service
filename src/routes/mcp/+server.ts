import { handleMcp } from '$lib/server/mcp/server';
import { verifyAccess } from '$lib/server/mcp/oauth';
import type { RequestHandler } from './$types';

const handler: RequestHandler = async ({ request, url }) => {
  if (!verifyAccess(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'missing or invalid access token; authorize this client first' }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': `Bearer realm="magic-dart", resource_metadata="${url.origin}/.well-known/oauth-protected-resource/mcp"`
      }
    });
  }
  return handleMcp(request);
};

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
