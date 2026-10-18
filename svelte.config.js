import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const FONT_CDN = 'https://cdn.jsdelivr.net';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    // MCP clients post cross-origin, form-encoded requests (often with no Origin header) to the
    // OAuth token endpoint, which SvelteKit's built-in check would reject. The same-origin rule is
    // enforced in hooks.server.ts instead, for every content type, with only those endpoints exempt.
    csrf: { trustedOrigins: ['*'] },
    // SvelteKit adds nonces/hashes for its own inline scripts.
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline', FONT_CDN],
        'font-src': ['self', FONT_CDN],
        'img-src': ['self', 'data:'],
        'connect-src': ['self'],
        'manifest-src': ['self'],
        'worker-src': ['self'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'frame-ancestors': ['none']
        // No form-action: the OAuth consent form redirects to the MCP client's own redirect_uri.
      }
    },
    serviceWorker: { register: true }
  }
};
