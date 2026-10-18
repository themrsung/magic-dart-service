/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const SHELL = `shell-${version}`;
const PAGES = 'pages-v1';
const ASSETS = [...build, ...files];
const MAX_PAGES = 60;

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL && key !== PAGES) await caches.delete(key);
      await sw.clients.claim();
    })()
  );
});

async function trim(cache: Cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(k);
}

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;
  // Never cache auth/MCP/API traffic or the account/admin pages (live, security-sensitive).
  if (/^\/(mcp|oauth|\.well-known|api|auth|login|logout|setup|register|account|admin)/.test(url.pathname)) return;

  // Immutable build assets: cache first.
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
    return;
  }

  // Pages and SvelteKit data: network first, fall back to the last copy so recent views work offline.
  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        // Redirected responses are the login page, not the page asked for.
        if (res.ok && !res.redirected && (req.mode === 'navigate' || url.pathname.endsWith('__data.json'))) {
          await cache.put(req, res.clone());
          void trim(cache);
        }
        return res;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw new Error('offline');
      }
    })()
  );
});
