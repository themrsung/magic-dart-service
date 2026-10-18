import { describe, expect, it } from 'vitest';
import { date, krwShort, kstDateTime, relDay } from '../src/lib/format';
import { NAMESPACES, pickLocale, translate } from '../src/lib/i18n';
import { accountName, periodName, personTerm, reportName } from '../src/lib/i18n/dart-terms';
import { runWithLocale, ts } from '../src/lib/server/i18n';

const pairs = Object.values(NAMESPACES).flatMap((ns) => Object.entries(ns.ko).map(([key, ko]) => ({ key, ko: ko as string, en: (ns.en as Record<string, string>)[key] })));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Placeholders deliberately different between languages. */
const PLACEHOLDER_EXCEPTIONS = new Set(['corp.profile.fiscalMonth']);

describe('dictionaries', () => {
  it('have a non-empty English string for every Korean key', () => {
    // Korean may be empty for English-only notices (e.g. the accounting-standards footer line).
    expect(pairs.length).toBeGreaterThan(300);
    for (const p of pairs) expect(p.en, p.key).toBeTruthy();
  });

  it('use the same placeholders in both languages', () => {
    for (const p of pairs) if (!PLACEHOLDER_EXCEPTIONS.has(p.key)) expect(placeholders(p.en), p.key).toEqual(placeholders(p.ko));
  });

  it('translate 이상/이하/초과/미만 with mathematically exact English', () => {
    const rules: [RegExp, RegExp][] = [
      [/이상/, /\bat least\b|\bor more\b/i],
      [/이하/, /\bat most\b|\bor less\b|\bor fewer\b/i],
      [/초과/, /\bmore than\b|\bexceed/i],
      [/미만/, /\bless than\b|\bfewer than\b/i]
    ];
    for (const p of pairs) for (const [ko, en] of rules) if (ko.test(p.ko)) expect(p.en, `${p.key}: ${p.ko}`).toMatch(en);
    for (const p of pairs) expect(p.en, p.key).not.toMatch(/\b(over|under|up to)\s+\d|\d+\+(?!\d)/i);
  });
});

describe('locale', () => {
  it('prefers the cookie, then Accept-Language order, then Korean', () => {
    expect(pickLocale('en', 'ko-KR')).toBe('en');
    expect(pickLocale(undefined, 'en-US,en;q=0.9,ko;q=0.8')).toBe('en');
    expect(pickLocale(undefined, 'ko-KR,ko;q=0.9,en;q=0.8')).toBe('ko');
    expect(pickLocale(undefined, 'ja-JP,en;q=0.5')).toBe('en');
    expect(pickLocale(undefined, 'fr-FR')).toBe('ko');
    expect(pickLocale('xx', null)).toBe('ko');
  });

  it('fills placeholders and uses the request locale on the server', () => {
    expect(translate('en', 'corp.own.shares', { count: '1,000' })).toBe('1,000 shares');
    expect(ts('corp.err.notFound')).toBe('기업을 찾을 수 없습니다');
    expect(runWithLocale('en', () => ts('corp.err.notFound'))).toBe('Company not found');
  });
});

describe('English formatting (Korean business-English conventions)', () => {
  it('formats KRW in trillions/billions without precision loss', () => {
    expect(krwShort('333,605,938,000,000', '원', 'en')?.text).toBe('KRW 333.61 tn');
    expect(krwShort('-52,000,000,000', '원', 'en')).toMatchObject({ text: '−KRW 52.0 bn', negative: true });
    expect(krwShort('1,250,000', '', 'en')?.text).toBe('1.3 mn');
    expect(krwShort('9,007,199,254,740,993', '원', 'en')?.full).toBe('KRW 9,007,199,254,740,993');
    // Korean output is unchanged.
    expect(krwShort('1,234,567,000,000')?.text).toBe('1조 2,345억원');
  });

  it('formats dates in ISO style with KST', () => {
    expect(date('20261018', 'en')).toBe('2026-10-18');
    expect(relDay('20261017', '20261018', 'en')).toBe('Yesterday');
    expect(kstDateTime(Date.UTC(2026, 9, 18, 15, 5), 'en')).toBe('2026-10-19 00:05 KST');
  });
});

describe('DART terms', () => {
  it('translates filing titles it knows and keeps the rest in Korean', () => {
    expect(reportName('사업보고서 (2025.12)', 'en')).toBe('Annual business report (2025.12)');
    expect(reportName('주요사항보고서(유상증자결정)', 'en')).toBe('Material event report: Paid-in capital increase');
    expect(reportName('주요사항보고서(자기주식취득결정)', 'en')).toBe('Material event report: Treasury share acquisition');
    expect(reportName('주식등의대량보유상황보고서(일반)', 'en')).toBe('Report on large shareholdings (5% rule), general');
    expect(reportName('임원ㆍ주요주주특정증권등소유상황보고서', 'en')).toBe('Report on shareholdings of executives and major shareholders');
    expect(reportName('알수없는보고서', 'en')).toBe('알수없는보고서');
    expect(reportName('사업보고서 (2025.12)', 'ko')).toBe('사업보고서 (2025.12)');
  });

  it('uses K-IFRS account names, fiscal periods and Korean corporate titles', () => {
    expect(accountName('법인세차감전 순이익', 'en')).toBe('Profit before income tax');
    expect(accountName('당기순이익(손실)', 'en')).toBe('Net income (loss)');
    expect(periodName('제 57 기', 'en')).toBe('57th fiscal year');
    expect(periodName('제 21 기 반기', 'en')).toBe('21st fiscal year, H1');
    expect(periodName('제 13 기', 'en')).toBe('13th fiscal year');
    expect(personTerm('대표이사', 'en')).toBe('Representative Director');
    expect(personTerm('최대주주의 특수관계인', 'en')).toBe('Related party of the largest shareholder');
  });
});
