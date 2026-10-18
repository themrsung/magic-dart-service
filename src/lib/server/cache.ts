import type { CompanyProfile, DartRow, MajorAccountRow, ReportCode } from 'magic-dart';
import type { OwnershipKind } from './catalog';
import { describeError, interactiveClient, type ErrorInfo } from './dart';
import { sweepEvents } from './jobs/definitions';
import {
  getCompany,
  getCorp,
  getEvents,
  getFinancialPeriod,
  getOwnership,
  getStateTime,
  lastEventSweep,
  queryFilings,
  setCursor,
  setOwnership,
  upsertCompany,
  upsertFilings,
  upsertFinancials,
  type EventRow,
  type FilingRow,
  type FinancialPeriod
} from './store';
import { addDays, DAY, HOUR, kstDate } from './time';

export type Via = 'ui' | 'mcp';

export interface Cached<T> {
  data: T;
  fetchedAt: number | null;
  /** Set when a refresh was attempted and failed; `data` is then whatever was cached. */
  error?: ErrorInfo;
}

const TTL = {
  company: 7 * DAY,
  corpFilings: 6 * HOUR,
  ownership: DAY,
  events: 3 * DAY,
  currentFinancials: DAY
};

const stale = (at: number | null | undefined, ttl: number) => !at || Date.now() - at > ttl;

export async function company(code: string, via: Via, force = false): Promise<Cached<CompanyProfile | null>> {
  const hit = getCompany(code);
  if (hit && !force && !stale(hit.fetchedAt, TTL.company)) return { data: hit.profile, fetchedAt: hit.fetchedAt };
  try {
    const profile = await interactiveClient(via).company(code);
    upsertCompany(code, profile);
    return { data: profile, fetchedAt: Date.now() };
  } catch (err) {
    return { data: hit?.profile ?? null, fetchedAt: hit?.fetchedAt ?? null, error: describeError(err) };
  }
}

/** A company's filings over the past year (two pages at most), refreshed every few hours. */
export async function corpFilings(code: string, via: Via, force = false): Promise<Cached<FilingRow[]>> {
  const key = `corpFilings:${code}`;
  const at = getStateTime(key);
  let error: ErrorInfo | undefined;
  if (force || stale(at, TTL.corpFilings)) {
    try {
      const client = interactiveClient(via);
      const today = kstDate();
      for (let page = 1; page <= 2; page++) {
        const res = await client.search({ corp_code: code, bgn_de: addDays(today, -365), end_de: today, page_no: page, page_count: 100 });
        upsertFilings(res.list);
        if (page >= res.total_page) break;
      }
      setCursor(key, null);
    } catch (err) {
      error = describeError(err);
    }
  }
  return { data: queryFilings({ corp_code: code, limit: 200 }), fetchedAt: getStateTime(key), error };
}

/** Key accounts for one period; past periods are kept indefinitely, the current year for a day. */
export async function financials(code: string, year: number, reprt: ReportCode, via: Via, force = false): Promise<Cached<FinancialPeriod | null>> {
  const hit = getFinancialPeriod(code, year, reprt);
  const isCurrent = year >= +kstDate().slice(0, 4) - 1;
  if (hit && !force && !(isCurrent && stale(hit.fetchedAt, TTL.currentFinancials))) return { data: hit, fetchedAt: hit.fetchedAt };
  try {
    const rows = (await interactiveClient(via).api.fnlttSinglAcnt({ corp_code: code, bsns_year: year, reprt_code: reprt })) as MajorAccountRow[];
    // Single-company rows may omit corp_code; stamp it so grouping works.
    upsertFinancials(rows.map((r) => ({ ...r, corp_code: r.corp_code || code })), year, reprt, [code]);
    const fresh = getFinancialPeriod(code, year, reprt);
    return { data: fresh ?? { bsns_year: year, reprt_code: reprt, rows: [], fetchedAt: Date.now() }, fetchedAt: Date.now() };
  } catch (err) {
    return { data: hit ?? null, fetchedAt: hit?.fetchedAt ?? null, error: describeError(err) };
  }
}

export async function ownership(code: string, kind: OwnershipKind, via: Via, force = false): Promise<Cached<DartRow[]>> {
  const hit = getOwnership(code, kind);
  if (hit && !force && !stale(hit.fetchedAt, TTL.ownership)) return { data: hit.rows, fetchedAt: hit.fetchedAt };
  try {
    const rows = (await interactiveClient(via).api[kind]({ corp_code: code })) as DartRow[];
    setOwnership(code, kind, rows);
    return { data: rows, fetchedAt: Date.now() };
  } catch (err) {
    return { data: hit?.rows ?? [], fetchedAt: hit?.fetchedAt ?? null, error: describeError(err) };
  }
}

/**
 * Major events from cache. With `refresh`, sweeps all 36 DS005 endpoints for the past year
 * (36 requests), which is why this is an explicit user action rather than automatic.
 */
export async function events(
  code: string,
  via: Via,
  refresh = false
): Promise<Cached<EventRow[]> & { failed?: string[] }> {
  let error: ErrorInfo | undefined;
  let failed: string[] | undefined;
  if (refresh) {
    try {
      const today = kstDate();
      const res = await sweepEvents(interactiveClient(via), code, addDays(today, -365), today);
      failed = res.failed;
    } catch (err) {
      error = describeError(err);
    }
  }
  return { data: getEvents(code), fetchedAt: lastEventSweep(code), error, failed };
}

export function eventsStale(code: string): boolean {
  return stale(lastEventSweep(code), TTL.events);
}

export { getCorp };
