/**
 * Runs the mock OpenDART API on its own: `node test/mock-opendart/cli.ts`.
 * MOCK_OPENDART_PORT (default 8790); MOCK_SHIFT_DATES=1 moves filing dates up to today.
 */
import { MOCK_API_KEY, snapshotAgeDays, startMockOpenDart } from './server.ts';
import { SNAPSHOT_DATE } from './data.ts';

const port = Number(process.env.MOCK_OPENDART_PORT ?? 8790);
const shiftDates = /^(1|true|on|yes)$/i.test(process.env.MOCK_SHIFT_DATES ?? '');
const mock = await startMockOpenDart(port, {
  shiftDates,
  onRequest: (path, status) => console.log(`[mock-opendart] ${path} → ${status}`)
});

const age = snapshotAgeDays();
console.log(`[mock-opendart] ${mock.baseUrl}  (snapshot ${SNAPSHOT_DATE}, ${age} days old${shiftDates ? ', dates shifted to today' : ''})`);
console.log(`[mock-opendart] any 40-character key works, e.g. ${MOCK_API_KEY}`);
if (age > 180) console.warn('[mock-opendart] WARNING: the mock data is over 6 months old; the real API may have changed.');

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void mock.close().then(() => process.exit(0)));
