/**
 * Exercises this repo's OpenDART client code against the mock API in test/mock-opendart
 * (fictional data, snapshot 2026-10-18): the magic-dart client itself, the scheduled jobs, the
 * page cache and the MCP tools.
 */
import { OpenDartClient, OpenDartError } from 'magic-dart';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bypassAllowed } from '../src/lib/server/auth/devbypass';
import * as cache from '../src/lib/server/cache';
import { cronClient, describeError, validateKey } from '../src/lib/server/dart';
import { openDb, setDb } from '../src/lib/server/db';
import { JOBS } from '../src/lib/server/jobs/definitions';
import { handleMcp } from '../src/lib/server/mcp/server';
import { writeApiKey } from '../src/lib/server/settings';
import { getCorp, queryFilings, searchCorps } from '../src/lib/server/store';
import { SNAPSHOT_DATE } from './mock-opendart/data';
import { MOCK_API_KEY, REJECTED_KEY, startMockOpenDart, type MockOpenDart } from './mock-opendart/server';

let mock: MockOpenDart;
let client: OpenDartClient;

beforeAll(async () => {
  mock = await startMockOpenDart(0, { today: SNAPSHOT_DATE });
  client = new OpenDartClient({ apiKey: MOCK_API_KEY, baseUrl: mock.baseUrl, retries: 0 });
});
afterAll(() => mock.close());

const amount = (rows: Record<string, string | undefined>[], fs: string, name: string) =>
  Number(rows.find((r) => r.fs_div === fs && r.account_nm === name)?.thstrm_amount?.replaceAll(',', ''));

describe('mock OpenDART via the magic-dart client', () => {
  it('serves the corp list as a ZIP of XML', async () => {
    const corps = await client.corpCodes();
    expect(corps.map((c) => c.corp_name)).toEqual(['가상반도체', '모의바이오', '예시물류']);
    expect(corps.find((c) => c.corp_code === '99000003')?.stock_code).toBe('');
  });

  it('serves company profiles and 013 for unknown companies', async () => {
    expect(await client.company('99000002')).toMatchObject({ corp_name: '모의바이오(주)', corp_cls: 'K', acc_mt: '12' });
    await expect(client.company('99999999')).rejects.toMatchObject({ status: '013' });
  });

  it('searches and pages filings', async () => {
    const page1 = await client.search({ corp_code: '99000001', page_count: 2 });
    expect(page1).toMatchObject({ page_no: 1, total_count: 5, total_page: 3 });
    expect(page1.list[0].rcept_no > page1.list[1].rcept_no).toBe(true);
    const all = [];
    for await (const f of client.searchAll({ corp_code: '99000001' })) all.push(f);
    expect(all).toHaveLength(5);
    const today = await client.search({ bgn_de: SNAPSHOT_DATE, end_de: SNAPSHOT_DATE });
    expect(today.list.map((f) => f.report_nm)).toContain('주요사항보고서(자기주식취득결정)');
  });

  it('serves consistent key accounts, and none for unfiled periods or unlisted companies', async () => {
    const rows = (await client.api.fnlttSinglAcnt({ corp_code: '99000001', bsns_year: 2025, reprt_code: '11011' })) as Record<string, string>[];
    expect(rows).toHaveLength(28); // 14 accounts × CFS/OFS
    for (const fs of ['CFS', 'OFS']) {
      // Rounded to the million per line, so allow a few million of slack.
      expect(Math.abs(amount(rows, fs, '자산총계') - amount(rows, fs, '유동자산') - amount(rows, fs, '비유동자산'))).toBeLessThanOrEqual(2e6);
      expect(Math.abs(amount(rows, fs, '자산총계') - amount(rows, fs, '부채총계') - amount(rows, fs, '자본총계'))).toBeLessThanOrEqual(3e6);
    }
    const half = (await client.api.fnlttSinglAcnt({ corp_code: '99000002', bsns_year: 2026, reprt_code: '11012' })) as Record<string, string>[];
    expect(half.find((r) => r.account_nm === '영업이익' && r.fs_div === 'CFS')).toMatchObject({ thstrm_amount: expect.stringMatching(/^-/), thstrm_add_amount: expect.stringMatching(/^-/) });
    expect(await client.api.fnlttSinglAcnt({ corp_code: '99000001', bsns_year: 2026, reprt_code: '11014' })).toEqual([]);
    expect(await client.api.fnlttSinglAcnt({ corp_code: '99000003', bsns_year: 2025, reprt_code: '11011' })).toEqual([]);
    const multi = (await client.api.fnlttMultiAcnt({ corp_code: ['99000001', '99000002', '99000003'], bsns_year: 2025, reprt_code: '11011' })) as Record<string, string>[];
    expect(new Set(multi.map((r) => r.corp_code))).toEqual(new Set(['99000001', '99000002']));
  });

  it('serves ownership and major events', async () => {
    expect(await client.api.majorstock({ corp_code: '99000002' })).toMatchObject([{ repror: '모의투자파트너스', stkrt: '5.81' }]);
    expect(await client.api.elestock({ corp_code: '99000001' })).toMatchObject([{ repror: '김가상' }]);
    expect(await client.api.piicDecsn({ corp_code: '99000002', bgn_de: '20260101', end_de: SNAPSHOT_DATE })).toMatchObject([{ ic_mthn: '제3자배정증자' }]);
    expect(await client.api.piicDecsn({ corp_code: '99000002', bgn_de: '20250101', end_de: '20250201' })).toEqual([]);
    expect(await client.api.cmpMgDecsn({ corp_code: '99000001', bgn_de: '20260101', end_de: SNAPSHOT_DATE })).toEqual([]);
  });

  it('rejects the reject key with 010', async () => {
    const bad = new OpenDartClient({ apiKey: REJECTED_KEY, baseUrl: mock.baseUrl, retries: 0 });
    const err = await bad.company('99000001').catch((e) => e);
    expect(err).toBeInstanceOf(OpenDartError);
    expect(describeError(err)).toMatchObject({ kind: 'auth', status: '010' });
  });

  it('shifts dates to today when asked', async () => {
    const shifted = await startMockOpenDart(0, { shiftDates: true, today: '20270101' });
    try {
      const c = new OpenDartClient({ apiKey: MOCK_API_KEY, baseUrl: shifted.baseUrl, retries: 0 });
      const res = await c.search({ bgn_de: '20270101', end_de: '20270101' });
      expect(res.list.length).toBe(2);
      expect(res.list.every((f) => f.rcept_no.startsWith('20270101') && f.rcept_dt === '20270101')).toBe(true);
    } finally {
      await shifted.close();
    }
  });
});

// The client keeps OpenDART's rate limit (4–6 requests/s), so full job runs take several seconds.
describe('the app against the mock', { timeout: 60_000 }, () => {
  let shifted: MockOpenDart;

  beforeAll(async () => {
    // Date-shifted so "today's filings" has data whenever these tests run.
    shifted = await startMockOpenDart(0, { shiftDates: true });
    process.env.OPENDART_BASE_URL = shifted.baseUrl;
  });
  afterAll(async () => {
    delete process.env.OPENDART_BASE_URL;
    await shifted.close();
  });
  beforeEach(() => {
    setDb(openDb(':memory:'));
    writeApiKey(MOCK_API_KEY);
  });

  const run = async (name: string) => {
    const log: string[] = [];
    await JOBS.find((j) => j.name === name)!.run({ client: cronClient(), log: (m) => log.push(m) });
    return log;
  };

  it('validates the key the way the admin page does', async () => {
    await expect(validateKey(MOCK_API_KEY)).resolves.toBeUndefined();
    await expect(validateKey(REJECTED_KEY)).rejects.toMatchObject({ status: '010' });
  });

  it('runs the scheduled jobs end to end', async () => {
    expect(await run('corpCodes')).toEqual(['3개 기업 갱신']);
    expect(searchCorps('모의').map((c) => c.corp_code)).toEqual(['99000002']);
    expect(searchCorps('990010')[0]?.corp_name).toBe('가상반도체');

    expect((await run('filings'))[0]).toMatch(/신규 공시 2건/);
    await run('filingsFull');
    // Ownership/event filings were queued and get resolved by the details job.
    expect((await run('details')).at(-1)).toMatch(/\d+건 처리/);

    expect((await run('profiles')).at(-1)).toBe('2개사 갱신'); // listed companies only
    expect(getCorp('99000001')?.profile_at).toBeTruthy();

    const fin = await run('financials');
    expect(fin.some((l) => /2025 11011: 2개사 저장/.test(l))).toBe(true);
  });

  it('serves the company pages and MCP tools from the mock via the cache', async () => {
    await run('corpCodes');
    const company = await cache.company('99000001', 'ui');
    expect(company.data?.ceo_nm).toBe('김가상');
    expect(company.error).toBeUndefined();

    const filings = await cache.corpFilings('99000002', 'ui');
    expect(filings.data.length).toBe(6);
    expect(queryFilings({ corp_code: '99000002', limit: 10 })).toHaveLength(6);

    const fin = await cache.financials('99000001', 2025, '11011', 'ui');
    expect(fin.data?.rows.length).toBe(28);

    expect((await cache.ownership('99000002', 'majorstock', 'ui')).data).toHaveLength(1);
    const events = await cache.events('99000002', 'ui', true);
    expect(events.failed ?? []).toEqual([]);
    expect(events.data.map((e) => e.endpoint)).toEqual(['piicDecsn']);

    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await handleMcp(
        new Request('http://localhost/mcp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
        })
      );
      const body = (await res.json()) as { result?: { content: { text: string }[]; isError?: boolean } };
      return JSON.parse(body.result!.content[0].text);
    };
    expect(await call('search_companies', { query: '예시' })).toMatchObject([{ corp_code: '99000003', corp_name: '예시물류' }]);
    expect(await call('get_financials', { corp_code: '99000002', year: 2026, report: 'half' })).toMatchObject({ period: '2026 반기' });
    expect((await call('get_major_events', { corp_code: '99000001', refresh: true })).events).toMatchObject([{ type: '자기주식 취득 결정' }]);
  });
});

describe('dev login bypass', () => {
  it('turns on only in dev mode with a loopback OpenDART base URL', () => {
    expect(bypassAllowed(true, 'http://localhost:8790/api')).toBe(true);
    expect(bypassAllowed(true, 'http://127.0.0.1:8790/api')).toBe(true);
    expect(bypassAllowed(true, 'http://[::1]:8790/api')).toBe(true);
    expect(bypassAllowed(false, 'http://localhost:8790/api')).toBe(false); // production build
    expect(bypassAllowed(true, undefined)).toBe(false); // real OpenDART
    expect(bypassAllowed(true, 'https://opendart.fss.or.kr/api')).toBe(false);
    expect(bypassAllowed(true, 'http://localhost.evil.example/api')).toBe(false);
    expect(bypassAllowed(true, 'http://10.0.0.5:8790/api')).toBe(false);
  });
});
