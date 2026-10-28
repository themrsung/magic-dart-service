// Node.js security floor: the October 2026 security releases (Brotli RCE CVE-2026-111497, TLS hostname bypasses,
// Undici behind fetch). Keep in sync with engines.node in package.json and the Dockerfile base image.
const PATCHED: Record<number, [number, number, number]> = { 22: [22, 23, 4], 24: [24, 22, 1], 26: [26, 12, 1] };
const ADVISORY = 'https://nodejs.org/en/blog/vulnerability/october-2026-security-releases';

/** Why `version` (e.g. `v22.18.0`) is unsafe to run, or null if it is patched. Lines newer than 26 are trusted. */
export function nodeSecurityProblem(version: string): string | null {
  const v = version.replace(/^v/, '').split('.').map(Number) as [number, number, number];
  const major = v[0];
  if (major > 26 && major % 2 === 0) return null;
  const floor = PATCHED[major];
  if (!floor) return `Node.js ${major}.x no longer receives security fixes.`;
  for (let i = 0; i < 3; i++) {
    if (v[i] > floor[i]) return null;
    if (v[i] < floor[i]) return `Node.js ${version} has known security vulnerabilities, including remote code execution.`;
  }
  return null;
}

/**
 * Prints a loud banner on stderr when the runtime is unpatched, at startup and again every 6 hours so it stays in
 * rotated logs. Never exits: refusing to start would take existing installs offline on a routine restart.
 */
export function warnIfUnpatchedNode(version = process.version): void {
  const problem = nodeSecurityProblem(version);
  if (!problem) return;
  const lines = [
    'SECURITY WARNING: UNPATCHED NODE.JS RUNTIME',
    problem,
    'This server is exposed to attacks fixed in the October 2026 Node.js security releases.',
    'Upgrade to Node.js 22.23.4+, 24.22.1+ or 26.12.1+ (Docker: docker compose build --pull) and restart.',
    ADVISORY
  ];
  const width = Math.max(...lines.map((l) => l.length));
  const bar = '!'.repeat(width + 4);
  const banner = [bar, ...lines.map((l) => `! ${l.padEnd(width)} !`), bar].join('\n');
  const print = () => console.error(`[security]\n${banner}`);
  print();
  setInterval(print, 6 * 60 * 60 * 1000).unref();
}
