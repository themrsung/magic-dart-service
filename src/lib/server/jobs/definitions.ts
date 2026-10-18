import type { DartRow, Filing, MajorAccountRow, OpenDartClient } from 'magic-dart';
import { RequestBudgetExceededError } from 'magic-dart';
import { detailEndpointFor, EVENT_ENDPOINTS } from '../catalog';
import {
  enqueueDetail,
  getCursor,
  getStateTime,
  hasFiling,
  listedByStaleness,
  listedCodes,
  nextPending,
  resolvePending,
  setCursor,
  setOwnership,
  upsertCompany,
  upsertCorps,
  upsertEvents,
  upsertFilings,
  upsertFinancials
} from '../store';
import { addDays, DAY, HOUR, kstDate } from '../time';
import { inFilingSeason, latestDuePeriod, periodKey, periodsBack } from './periods';

export interface JobContext {
  client: OpenDartClient;
  log: (msg: string) => void;
}

export interface JobDef {
  name: string;
  label: string;
  /** croner pattern, evaluated in Asia/Seoul. */
  schedule: string;
  /** Most requests one run may use (further capped by what's left of the daily budget). */
  cap: number;
  run: (ctx: JobContext) => Promise<void>;
}

/** Fetch filings for `day`; with `incremental`, stop at the first page whose filings are all known. */
async function pullFilings(ctx: JobContext, day: string, incremental: boolean): Promise<Filing[]> {
  const fresh: Filing[] = [];
  for (let page = 1; ; page++) {
    const res = await ctx.client.search({ bgn_de: day, end_de: day, page_no: page, page_count: 100, sort: 'date', sort_mth: 'desc' });
    const allKnown = res.list.length > 0 && res.list.every((f) => hasFiling(f.rcept_no));
    fresh.push(...upsertFilings(res.list));
    if (res.list.length === 0 || page >= res.total_page || (incremental && allKnown)) break;
  }
  for (const f of fresh) {
    const ep = detailEndpointFor(f.report_nm);
    if (ep) enqueueDetail(f.corp_code, ep, f.rcept_dt);
  }
  ctx.log(`${day}: 신규 공시 ${fresh.length}건`);
  return fresh;
}

export const JOBS: JobDef[] = [
  {
    name: 'corpCodes',
    label: '고유번호 목록',
    schedule: '30 5 * * *',
    cap: 3,
    async run(ctx) {
      const n = upsertCorps(await ctx.client.corpCodes());
      ctx.log(`${n}개 기업 갱신`);
    }
  },
  {
    name: 'filings',
    label: '공시 목록 (오늘)',
    schedule: '*/15 7-20 * * 1-5',
    cap: 20,
    async run(ctx) {
      await pullFilings(ctx, kstDate(), true);
    }
  },
  {
    name: 'filingsFull',
    label: '공시 목록 (전일 전체)',
    schedule: '0 6 * * *',
    cap: 60,
    async run(ctx) {
      const today = kstDate();
      await pullFilings(ctx, addDays(today, -1), false);
      // Backfill one earlier day per run, walking back up to 90 days, so the feed has history.
      const cursor = getCursor('filings:backfill') ?? addDays(today, -1);
      if (cursor > addDays(today, -90)) {
        const day = addDays(cursor, -1);
        await pullFilings(ctx, day, false);
        setCursor('filings:backfill', day);
      }
    }
  },
  {
    name: 'details',
    label: '지분·주요사항 상세',
    schedule: '5,35 7-21 * * *',
    cap: 150,
    async run(ctx) {
      let done = 0;
      for (const p of nextPending(150)) {
        try {
          if (p.endpoint === 'majorstock' || p.endpoint === 'elestock') {
            setOwnership(p.corp_code, p.endpoint, (await ctx.client.api[p.endpoint]({ corp_code: p.corp_code })) as DartRow[]);
          } else {
            const window = { bgn_de: p.rcept_dt, end_de: kstDate() };
            const rows = await ctx.client.api[p.endpoint as 'piicDecsn']({ corp_code: p.corp_code, ...window });
            upsertEvents(p.endpoint, p.corp_code, rows);
          }
          resolvePending(p.corp_code, p.endpoint, true);
          done++;
        } catch (err) {
          if (err instanceof RequestBudgetExceededError) throw err;
          resolvePending(p.corp_code, p.endpoint, false);
          ctx.log(`${p.corp_code} ${p.endpoint} 실패: ${(err as Error).message}`);
        }
      }
      ctx.log(`${done}건 처리`);
    }
  },
  {
    name: 'financials',
    label: '주요 재무 (전 상장사)',
    schedule: '0 3 * * *',
    cap: 700,
    async run(ctx) {
      const today = kstDate();
      const codes = listedCodes();
      const periods = periodsBack(latestDuePeriod(today));
      const recentTtl = inFilingSeason(today) ? 20 * HOUR : 7 * DAY;
      for (const [i, p] of periods.entries()) {
        const key = `financials:${periodKey(p)}`;
        const last = getStateTime(key);
        // The two newest periods keep receiving filings (late filers, corrections); older ones are swept once.
        const due = last === null || (i < 2 && Date.now() - last > recentTtl);
        if (!due) continue;
        let stored = 0;
        for (let j = 0; j < codes.length; j += 100) {
          const chunk = codes.slice(j, j + 100);
          // magic-dart's published typings widen endpoint results to a union; the row shape is documented.
          const rows = (await ctx.client.api.fnlttMultiAcnt({ corp_code: chunk, bsns_year: p.year, reprt_code: p.reprt })) as MajorAccountRow[];
          stored += upsertFinancials(rows, p.year, p.reprt, chunk);
        }
        setCursor(key, String(stored));
        ctx.log(`${p.year} ${p.reprt}: ${stored}개사 저장`);
      }
    }
  },
  {
    name: 'profiles',
    label: '기업개황 (순환)',
    schedule: '0 4 * * *',
    cap: 400,
    async run(ctx) {
      let n = 0;
      for (const code of listedByStaleness('profile_at', 400)) {
        upsertCompany(code, await ctx.client.company(code));
        n++;
      }
      ctx.log(`${n}개사 갱신`);
    }
  }
];

/** Event sweep for one company across every DS005 endpoint (used on demand, not scheduled). */
export async function sweepEvents(client: OpenDartClient, code: string, bgn_de: string, end_de: string): Promise<{ ok: number; failed: string[] }> {
  let ok = 0;
  const failed: string[] = [];
  for (const ep of EVENT_ENDPOINTS) {
    try {
      // All DS005 endpoints share the same parameter and row shape.
      const rows = await client.api[ep as 'piicDecsn']({ corp_code: code, bgn_de, end_de });
      upsertEvents(ep, code, rows, { bgn_de, end_de });
      ok++;
    } catch {
      failed.push(ep);
    }
  }
  return { ok, failed };
}
