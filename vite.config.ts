import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  ssr: { external: ['better-sqlite3', '@node-rs/argon2'] },
  test: {
    include: ['test/**/*.test.ts'],
    env: { APP_SECRET: 'test-secret-that-is-at-least-32-characters-long', DISABLE_SCHEDULER: '1' }
  }
});
