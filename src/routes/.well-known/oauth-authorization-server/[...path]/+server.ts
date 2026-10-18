import { json } from '@sveltejs/kit';
import { metadata } from '$lib/server/mcp/oauth';

export const GET = ({ url }) => json(metadata(url.origin).authorizationServer, { headers: { 'access-control-allow-origin': '*' } });
