/**
 * `npm run dev:mock`: the mock OpenDART API plus `vite dev` pointed at it.
 *
 * Uses its own database in .dev-data/, seeds a mock API key, and turns on the dev login bypass
 * (any username/password signs in as admin). Extra arguments go to vite, e.g. `npm run dev:mock -- --open`.
 * Env: MOCK_OPENDART_PORT (8790), DEV_PORT (5173), MOCK_SHIFT_DATES (default on).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { snapshotAgeDays, startMockOpenDart } from '../test/mock-opendart/server.ts';
import { CORPS, SNAPSHOT_DATE } from '../test/mock-opendart/data.ts';

const mockPort = Number(process.env.MOCK_OPENDART_PORT ?? 8790);
const devPort = Number(process.env.DEV_PORT ?? 5173);
const shiftDates = !/^(0|false|off|no)$/i.test(process.env.MOCK_SHIFT_DATES ?? '');

const mock = await startMockOpenDart(mockPort, {
  shiftDates,
  onRequest: (path, status) => console.log(`[mock-opendart] ${path} → ${status}`)
});
const base = mock.baseUrl.replace('127.0.0.1', 'localhost');
console.log(`[mock-opendart] ${base} (snapshot ${SNAPSHOT_DATE}, ${snapshotAgeDays()} days old${shiftDates ? ', dates shifted to today' : ''})`);
const MARKETS: Record<string, string> = { Y: 'KOSPI', K: 'KOSDAQ', N: 'KONEX', E: 'unlisted' };
console.log('[mock-opendart] fictional companies:');
for (const c of CORPS)
  console.log(`[mock-opendart]   ${c.corp_code}  ${c.corp_name} (${c.corp_eng_name.replace(' (MOCK)', '')})  ${MARKETS[c.corp_cls]}${c.stock_code ? ` ${c.stock_code}` : ''}`);
if (snapshotAgeDays() > 180) console.warn('[mock-opendart] WARNING: the mock data is over 6 months old; the real API may have changed.');

mkdirSync('.dev-data', { recursive: true });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--port', String(devPort), '--strictPort', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    OPENDART_BASE_URL: base,
    ORIGIN: `http://localhost:${devPort}`,
    APP_SECRET: process.env.APP_SECRET ?? 'dev-only-secret-not-for-production-use-000',
    DATA_DIR: '.dev-data',
    EGRESS_IP_LOOKUP: 'off',
    API_KEY_HOST_BINDING: 'off'
  }
});

const stop = () => {
  vite.kill('SIGTERM');
  void mock.close();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', (code) => {
  void mock.close().then(() => process.exit(code ?? 0));
});
