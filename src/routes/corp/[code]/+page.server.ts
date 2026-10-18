import { error, fail } from '@sveltejs/kit';
import type { ReportCode } from 'magic-dart';
import * as cache from '$lib/server/cache';
import { endpointTitle, EVENT_THEMES, themeOf } from '$lib/server/catalog';
import { getCorp, getFinancials } from '$lib/server/store';
import { kstDate } from '$lib/server/time';

const TABS = ['overview', 'filings', 'financials', 'ownership', 'events'] as const;
type Tab = (typeof TABS)[number];
const REPORT_CODES = ['11011', '11014', '11012', '11013'];

function defaultAnnualYear(today: string): number {
  const y = +today.slice(0, 4);
  return today.slice(4) >= '0401' ? y - 1 : y - 2;
}

export const load = async ({ params, url }) => {
  const code = params.code;
  if (!/^\d{8}$/.test(code)) error(404, '잘못된 기업 코드입니다');
  const corp = getCorp(code);
  const tab: Tab = (TABS as readonly string[]).includes(url.searchParams.get('tab') ?? '') ? (url.searchParams.get('tab') as Tab) : 'overview';
  const today = kstDate();

  const company = await cache.company(code, 'ui');
  if (!corp && !company.data) error(404, '기업을 찾을 수 없습니다');

  const base = {
    code,
    corp: corp ?? null,
    company: company.data,
    companyAt: company.fetchedAt,
    companyError: company.error ?? null
  };

  if (tab === 'overview') {
    const filings = await cache.corpFilings(code, 'ui');
    const annualYear = defaultAnnualYear(today);
    const fin = await cache.financials(code, annualYear, '11011', 'ui');
    return { ...base, tab: 'overview' as const, filings: filings.data.slice(0, 8), filingsAt: filings.fetchedAt, headline: fin.data, headlineError: fin.error ?? null };
  }

  if (tab === 'filings') {
    const filings = await cache.corpFilings(code, 'ui');
    return { ...base, tab: 'filings' as const, filings: filings.data, filingsAt: filings.fetchedAt, filingsError: filings.error ?? null };
  }

  if (tab === 'financials') {
    const year = Number(url.searchParams.get('year')) || defaultAnnualYear(today);
    const reprt = (REPORT_CODES.includes(url.searchParams.get('reprt') ?? '') ? url.searchParams.get('reprt') : '11011') as ReportCode;
    if (year < 2015) error(400, '2015년 이전 재무 데이터는 OpenDART에서 제공하지 않습니다');
    const fin = await cache.financials(code, year, reprt, 'ui');
    const available = getFinancials(code).map((p) => ({ year: p.bsns_year, reprt: p.reprt_code }));
    return { ...base, tab: 'financials' as const, year, reprt, fin: fin.data, finAt: fin.fetchedAt, finError: fin.error ?? null, available, maxYear: +today.slice(0, 4) };
  }

  if (tab === 'ownership') {
    const [major, exec] = await Promise.all([cache.ownership(code, 'majorstock', 'ui'), cache.ownership(code, 'elestock', 'ui')]);
    const byDate = (a: Record<string, unknown>, b: Record<string, unknown>) => String(b.rcept_no ?? '').localeCompare(String(a.rcept_no ?? ''));
    return {
      ...base,
      tab: 'ownership' as const,
      major: { rows: [...major.data].sort(byDate).slice(0, 100), total: major.data.length, at: major.fetchedAt, error: major.error ?? null },
      exec: { rows: [...exec.data].sort(byDate).slice(0, 150), total: exec.data.length, at: exec.fetchedAt, error: exec.error ?? null }
    };
  }

  const ev = await cache.events(code, 'ui');
  return {
    ...base,
    tab: 'events' as const,
    events: ev.data.map((e) => ({
      endpoint: e.endpoint,
      title: endpointTitle(e.endpoint),
      theme: themeOf(e.endpoint),
      rcept_no: e.rcept_no,
      row: e.row
    })),
    themes: EVENT_THEMES.map((t) => t.label),
    eventsAt: ev.fetchedAt,
    eventsStale: cache.eventsStale(code)
  };
};

export const actions = {
  refresh: async ({ params, request }) => {
    const code = params.code;
    const form = await request.formData();
    const what = String(form.get('what') ?? '');
    if (what === 'events') {
      const r = await cache.events(code, 'ui', true);
      if (r.error) return fail(502, { message: r.error.message });
      return { message: r.failed?.length ? `${36 - r.failed.length}개 유형 조회 · ${r.failed.length}개 실패` : '36개 유형 모두 조회했습니다' };
    }
    if (what === 'company') {
      const r = await cache.company(code, 'ui', true);
      if (r.error) return fail(502, { message: r.error.message });
    } else if (what === 'filings') {
      const r = await cache.corpFilings(code, 'ui', true);
      if (r.error) return fail(502, { message: r.error.message });
    } else if (what === 'ownership') {
      for (const kind of ['majorstock', 'elestock'] as const) {
        const r = await cache.ownership(code, kind, 'ui', true);
        if (r.error) return fail(502, { message: r.error.message });
      }
    } else if (what === 'financials') {
      const year = Number(form.get('year'));
      const reprt = String(form.get('reprt')) as ReportCode;
      if (!REPORT_CODES.includes(reprt) || year < 2015) return fail(400, { message: '잘못된 기간입니다' });
      const r = await cache.financials(code, year, reprt, 'ui', true);
      if (r.error) return fail(502, { message: r.error.message });
    }
    return { message: '새로 고쳤습니다' };
  }
};
