import { MIN_BSNS_YEAR, type ReportCode } from 'magic-dart';

export interface Period {
  year: number;
  reprt: ReportCode;
}

/** Report codes in fiscal order within a year. */
const ORDER: ReportCode[] = ['11013', '11012', '11014', '11011'];

/**
 * Most recent period whose statutory filing deadline has passed (December year-ends):
 * Q1 by mid-May, H1 by mid-Aug, Q3 by mid-Nov, annual by end of March next year.
 */
export function latestDuePeriod(today: string): Period {
  const y = +today.slice(0, 4);
  const md = today.slice(4, 8);
  if (md >= '1115') return { year: y, reprt: '11014' };
  if (md >= '0815') return { year: y, reprt: '11012' };
  if (md >= '0516') return { year: y, reprt: '11013' };
  if (md >= '0331') return { year: y - 1, reprt: '11011' };
  return { year: y - 1, reprt: '11014' };
}

export function previousPeriod(p: Period): Period {
  const i = ORDER.indexOf(p.reprt);
  return i === 0 ? { year: p.year - 1, reprt: '11011' } : { year: p.year, reprt: ORDER[i - 1] };
}

/** Periods from `from` going back to MIN_BSNS_YEAR Q1, newest first. */
export function periodsBack(from: Period): Period[] {
  const out: Period[] = [];
  for (let p = from; p.year >= MIN_BSNS_YEAR; p = previousPeriod(p)) out.push(p);
  return out;
}

export const periodKey = (p: Period) => `${p.year}-${p.reprt}`;

/** Weeks around filing deadlines, when many reports land and recent periods are re-swept daily. */
export function inFilingSeason(today: string): boolean {
  const md = today.slice(4, 8);
  return (
    (md >= '0301' && md <= '0410') ||
    (md >= '0501' && md <= '0525') ||
    (md >= '0801' && md <= '0825') ||
    (md >= '1101' && md <= '1125')
  );
}
