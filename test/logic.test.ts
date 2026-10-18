import { describe, expect, it } from 'vitest';
import { detailEndpointFor } from '../src/lib/server/catalog';
import { latestDuePeriod, periodsBack, previousPeriod } from '../src/lib/server/jobs/periods';
import { krwShort, splitReportName } from '../src/lib/format';
import { redact, isPlausibleApiKey } from '../src/lib/server/settings';
import { addDays, kstDate } from '../src/lib/server/time';

describe('detailEndpointFor', () => {
  it.each([
    ['주요사항보고서(유상증자결정)', 'piicDecsn'],
    ['[기재정정]주요사항보고서(자기주식취득결정)', 'tsstkAqDecsn'],
    ['주요사항보고서(타법인주식및출자증권양수결정)', 'otcprStkInvscrInhDecsn'],
    ['주요사항보고서(전환사채권발행결정)', 'cvbdIsDecsn'],
    ['주요사항보고서(주식교환ㆍ이전결정)', 'stkExtrDecsn'],
    ['임원ㆍ주요주주특정증권등소유상황보고서', 'elestock'],
    ['주식등의대량보유상황보고서(일반)', 'majorstock'],
    ['사업보고서 (2025.12)', null],
    ['주요사항보고서(알수없는유형)', null]
  ])('%s → %s', (name, ep) => expect(detailEndpointFor(name)).toBe(ep));
});

describe('periods', () => {
  it('picks the latest period past its deadline', () => {
    expect(latestDuePeriod('20261018')).toEqual({ year: 2026, reprt: '11012' });
    expect(latestDuePeriod('20261120')).toEqual({ year: 2026, reprt: '11014' });
    expect(latestDuePeriod('20260215')).toEqual({ year: 2025, reprt: '11014' });
    expect(latestDuePeriod('20260401')).toEqual({ year: 2025, reprt: '11011' });
    expect(latestDuePeriod('20260520')).toEqual({ year: 2026, reprt: '11013' });
  });
  it('walks back to 2015 Q1', () => {
    expect(previousPeriod({ year: 2026, reprt: '11013' })).toEqual({ year: 2025, reprt: '11011' });
    const all = periodsBack({ year: 2016, reprt: '11011' });
    expect(all).toHaveLength(8);
    expect(all.at(-1)).toEqual({ year: 2015, reprt: '11013' });
  });
});

describe('format', () => {
  it('formats KRW in 조/억 without precision loss', () => {
    expect(krwShort('1,234,567,000,000')?.text).toBe('1조 2,345억원');
    expect(krwShort('300,870,903,000,000')?.text).toBe('300조 8,709억원');
    expect(krwShort('-52,000,000,000')).toMatchObject({ text: '−520억원', negative: true });
    expect(krwShort('9,007,199,254,740,993')?.full).toBe('9,007,199,254,740,993원');
    expect(krwShort('-')).toBeNull();
    expect(krwShort('0')?.text).toBe('0원');
  });
  it('splits amendment prefixes into chips', () => {
    expect(splitReportName('[기재정정][첨부추가]사업보고서 (2025.12)')).toEqual({ chips: ['기재정정', '첨부추가'], title: '사업보고서 (2025.12)' });
  });
});

describe('key hygiene', () => {
  it('redacts keys in URLs and bare hex', () => {
    const key = 'a'.repeat(20) + '0123456789abcdef0123';
    expect(redact(`GET https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&x=1`)).not.toContain(key);
    expect(redact(`key ${key} failed`)).toBe('key *** failed');
  });
  it('accepts only 40-char alphanumerics', () => {
    expect(isPlausibleApiKey('a'.repeat(40))).toBe(true);
    expect(isPlausibleApiKey('a'.repeat(39))).toBe(false);
    expect(isPlausibleApiKey('a'.repeat(39) + '!')).toBe(false);
  });
});

describe('time', () => {
  it('uses KST calendar days', () => {
    expect(kstDate(Date.UTC(2026, 9, 18, 15, 30))).toBe('20261019'); // 00:30 KST next day
    expect(addDays('20260301', -1)).toBe('20260228');
  });
});
