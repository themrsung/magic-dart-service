/**
 * English renderings of DART / Korean capital-market terms that appear in OpenDART data (market
 * classes, report types, major-event types, key account names, fiscal periods, executive titles).
 *
 * Conventions follow Korean business English as used in K-IFRS English financial statements,
 * KRX/FSS English materials and Korean companies' English IR:
 * - 연결/별도 → Consolidated / Separate (K-IFRS "separate financial statements", not "standalone")
 * - 유상증자 → paid-in capital increase; 무상증자 → bonus issue
 * - 자기주식 → treasury shares; 대표이사 → Representative Director (Korean Commercial Act title)
 * - 사업보고서 → annual business report; amounts in trillion/billion KRW
 * - 이상 ≥ "at least", 이하 ≤ "at most", 초과 > "more than", 미만 < "less than" (never "over"/"under"/"+")
 *
 * Every map is English-only: Korean output is always the original string. Unknown values stay in
 * Korean rather than being guessed.
 */
import type { Locale } from './index.ts';

const squash = (s: string) => s.replace(/[\s·ㆍ・,]/g, '');

function lookup(map: Record<string, string>, ko: string | null | undefined, locale: Locale): string {
  if (!ko) return '';
  if (locale === 'ko') return ko;
  return map[ko] ?? map[squash(ko)] ?? ko;
}

// ── Markets (corp_cls) and remark flags (rm) ───────────────────────────

export const MARKETS_EN: Record<string, string> = {
  Y: 'KOSPI',
  K: 'KOSDAQ',
  N: 'KONEX',
  E: 'Other'
};
const MARKETS_KO: Record<string, string> = { Y: '유가증권', K: '코스닥', N: '코넥스', E: '기타' };

export function marketLabel(cls: string | null | undefined, locale: Locale): string {
  if (!cls) return '';
  return (locale === 'en' ? MARKETS_EN : MARKETS_KO)[cls] ?? cls;
}

/** list.json `rm` flags. */
export const RM_EN: Record<string, string> = {
  유: 'KOSPI',
  코: 'KOSDAQ',
  채: 'Bond listing',
  넥: 'KONEX',
  공: 'FTC filing',
  연: 'Incl. consolidated',
  정: 'Later amended',
  철: 'Withdrawn'
};

// ── Periodic report codes ──────────────────────────────────────────────

const REPORT_CODES_EN: Record<string, string> = { '11011': 'Annual report', '11014': 'Q3', '11012': 'Half-year', '11013': 'Q1' };
const REPORT_CODES_KO: Record<string, string> = { '11011': '사업보고서', '11014': '3분기', '11012': '반기', '11013': '1분기' };

export function reportCodeLabel(code: string, locale: Locale): string {
  return (locale === 'en' ? REPORT_CODES_EN : REPORT_CODES_KO)[code] ?? code;
}

// ── DS005 major-event types (주요사항보고서) ─────────────────────────────

export const EVENT_TITLES_EN: Record<string, string> = {
  astInhtrfEtcPtbkOpt: 'Asset transfer (other) / put-back option',
  dfOcr: 'Default (dishonoured bills)',
  bsnSp: 'Suspension of business',
  ctrcvsBgrq: 'Filing for rehabilitation proceedings',
  dsRsOcr: 'Cause for dissolution',
  bnkMngtPcbg: 'Creditor bank management procedure started',
  bnkMngtPcsp: 'Creditor bank management procedure suspended',
  lwstLg: 'Lawsuit filed',
  piicDecsn: 'Paid-in capital increase',
  fricDecsn: 'Bonus issue (free capital increase)',
  pifricDecsn: 'Paid-in capital increase with bonus issue',
  crDecsn: 'Capital reduction',
  cvbdIsDecsn: 'Convertible bond (CB) issuance',
  bdwtIsDecsn: 'Bond with warrants (BW) issuance',
  exbdIsDecsn: 'Exchangeable bond (EB) issuance',
  wdCocobdIsDecsn: 'Write-down contingent capital securities issuance',
  tsstkAqDecsn: 'Treasury share acquisition',
  tsstkDpDecsn: 'Treasury share disposal',
  tsstkAqTrctrCnsDecsn: 'Treasury share trust contract signed',
  tsstkAqTrctrCcDecsn: 'Treasury share trust contract terminated',
  bsnInhDecsn: 'Business acquisition',
  bsnTrfDecsn: 'Business transfer',
  tgastInhDecsn: 'Acquisition of tangible assets',
  tgastTrfDecsn: 'Disposal of tangible assets',
  otcprStkInvscrInhDecsn: 'Acquisition of shares in another company',
  otcprStkInvscrTrfDecsn: 'Disposal of shares in another company',
  stkrtbdInhDecsn: 'Acquisition of equity-linked bonds',
  stkrtbdTrfDecsn: 'Disposal of equity-linked bonds',
  cmpMgDecsn: 'Merger',
  cmpDvDecsn: 'Corporate split (spin-off)',
  cmpDvmgDecsn: 'Split-merger',
  stkExtrDecsn: 'Comprehensive share exchange / transfer',
  ovLstDecsn: 'Decision to list on an overseas exchange',
  ovDlstDecsn: 'Decision to delist from an overseas exchange',
  ovLst: 'Listed on an overseas exchange',
  ovDlst: 'Delisted from an overseas exchange'
};

/** `ko` is the server-provided Korean title (from magic-dart's endpoint table). */
export function eventTitle(endpoint: string, ko: string, locale: Locale): string {
  return locale === 'en' ? (EVENT_TITLES_EN[endpoint] ?? ko) : ko;
}

/** Theme labels from catalog.ts EVENT_THEMES, keyed by their Korean label. */
export const EVENT_THEMES_EN: Record<string, string> = {
  '부실·법적 위험': 'Distress & legal risk',
  '자본 변동': 'Capital changes',
  '메자닌·채권 발행': 'Mezzanine & bond issuance',
  자기주식: 'Treasury shares',
  '자산·영업 양수도': 'Asset & business transfers',
  '합병·분할': 'Mergers & splits',
  '해외 상장': 'Overseas listings',
  기타: 'Other'
};

export function themeLabel(ko: string, locale: Locale): string {
  return locale === 'en' ? (EVENT_THEMES_EN[ko] ?? ko) : ko;
}

// ── Filing titles (report_nm) ──────────────────────────────────────────

/** Bracketed prefixes on report names, e.g. "[기재정정]". */
export const AMEND_CHIPS_EN: Record<string, string> = {
  기재정정: 'Amended',
  첨부정정: 'Attachment amended',
  첨부추가: 'Attachment added',
  변경등록: 'Registration changed',
  연장결정: 'Extended',
  발행조건확정: 'Terms finalised',
  정정명령부과: 'Correction ordered',
  정정제출요구: 'Correction requested'
};

export function amendChip(ko: string, locale: Locale): string {
  return locale === 'en' ? (AMEND_CHIPS_EN[ko] ?? ko) : ko;
}

/** Common filing types by their Korean name with spaces and middle dots removed. */
export const REPORT_TYPES_EN: Record<string, string> = {
  사업보고서: 'Annual business report',
  반기보고서: 'Half-year report',
  분기보고서: 'Quarterly report',
  감사보고서: 'Audit report',
  연결감사보고서: 'Consolidated audit report',
  주식등의대량보유상황보고서: 'Report on large shareholdings (5% rule)',
  임원주요주주특정증권등소유상황보고서: 'Report on shareholdings of executives and major shareholders',
  최대주주등소유주식변동신고서: 'Change in shares held by the largest shareholder',
  기업설명회IR개최: 'IR session',
  '기업설명회(IR)개최': 'IR session',
  현금ㆍ현물배당결정: 'Cash / in-kind dividend decision',
  현금현물배당결정: 'Cash / in-kind dividend decision',
  주주총회소집결의: 'Resolution to convene a shareholders’ meeting',
  주주총회소집공고: 'Notice of shareholders’ meeting',
  정기주주총회결과: 'Results of the annual general meeting',
  영업실적등에대한전망공정공시: 'Earnings guidance (fair disclosure)',
  연결재무제표기준영업잠정실적공정공시: 'Preliminary consolidated earnings (fair disclosure)',
  '매출액또는손익구조30%미만변경': 'Change in revenue or profit structure (less than 30%)',
  '매출액또는손익구조30%(대규모법인은15%)이상변경': 'Change in revenue or profit structure (at least 30%; at least 15% for large companies)',
  단일판매ㆍ공급계약체결: 'Single sales / supply contract',
  단일판매공급계약체결: 'Single sales / supply contract',
  타법인주식및출자증권취득결정: 'Acquisition of shares in another company',
  증권신고서지분증권: 'Securities registration statement (equity)',
  '증권신고서(지분증권)': 'Securities registration statement (equity)',
  '증권신고서(채무증권)': 'Securities registration statement (debt)',
  투자설명서: 'Prospectus',
  주요사항보고서: 'Material event report',
  조회공시요구: 'Inquiry disclosure request',
  풍문또는보도에대한해명: 'Clarification of rumours or reports'
};

const EVENT_BY_KO_TITLE: Record<string, string> = {
  유상증자결정: 'piicDecsn',
  무상증자결정: 'fricDecsn',
  유무상증자결정: 'pifricDecsn',
  감자결정: 'crDecsn',
  전환사채권발행결정: 'cvbdIsDecsn',
  신주인수권부사채권발행결정: 'bdwtIsDecsn',
  교환사채권발행결정: 'exbdIsDecsn',
  상각형조건부자본증권발행결정: 'wdCocobdIsDecsn',
  자기주식취득결정: 'tsstkAqDecsn',
  자기주식처분결정: 'tsstkDpDecsn',
  자기주식취득신탁계약체결결정: 'tsstkAqTrctrCnsDecsn',
  자기주식취득신탁계약해지결정: 'tsstkAqTrctrCcDecsn',
  영업양수결정: 'bsnInhDecsn',
  영업양도결정: 'bsnTrfDecsn',
  유형자산양수결정: 'tgastInhDecsn',
  유형자산양도결정: 'tgastTrfDecsn',
  타법인주식및출자증권양수결정: 'otcprStkInvscrInhDecsn',
  타법인주식및출자증권양도결정: 'otcprStkInvscrTrfDecsn',
  주권관련사채권양수결정: 'stkrtbdInhDecsn',
  주권관련사채권양도결정: 'stkrtbdTrfDecsn',
  회사합병결정: 'cmpMgDecsn',
  회사분할결정: 'cmpDvDecsn',
  회사분할합병결정: 'cmpDvmgDecsn',
  주식교환이전결정: 'stkExtrDecsn',
  부도발생: 'dfOcr',
  영업정지: 'bsnSp',
  회생절차개시신청: 'ctrcvsBgrq',
  해산사유발생: 'dsRsOcr',
  소송등의제기: 'lwstLg'
};

/**
 * "사업보고서 (2025.12)" → "Annual business report (2025.12)",
 * "주요사항보고서(유상증자결정)" → "Material event report: Paid-in capital increase".
 * Titles it doesn't recognise are returned unchanged (in Korean).
 */
export function reportName(ko: string, locale: Locale): string {
  if (locale === 'ko' || !ko) return ko;
  const m = /^(.*?)\s*(\(([^()]*)\))?\s*$/.exec(ko);
  const base = squash(m?.[1] ?? ko);
  const paren = m?.[3];
  if (base === '주요사항보고서' && paren) {
    const ep = EVENT_BY_KO_TITLE[squash(paren)];
    return ep ? `Material event report: ${EVENT_TITLES_EN[ep]}` : ko;
  }
  if (base === '주식등의대량보유상황보고서' && paren) {
    const kind: Record<string, string> = { 일반: 'general', 약식: 'short form' };
    return `${REPORT_TYPES_EN[base]}${kind[paren] ? `, ${kind[paren]}` : ` (${paren})`}`;
  }
  const exact = REPORT_TYPES_EN[squash(ko)] ?? REPORT_TYPES_EN[base];
  if (!exact) return ko;
  // Keep a trailing period like "(2025.12)" as is.
  return paren && REPORT_TYPES_EN[base] && /^[\d.]+$/.test(paren) ? `${exact} (${paren})` : exact;
}

// ── Key accounts (fnlttSinglAcnt / fnlttMultiAcnt) ─────────────────────

export const ACCOUNTS_EN: Record<string, string> = {
  유동자산: 'Current assets',
  비유동자산: 'Non-current assets',
  자산총계: 'Total assets',
  유동부채: 'Current liabilities',
  비유동부채: 'Non-current liabilities',
  부채총계: 'Total liabilities',
  자본금: 'Share capital',
  이익잉여금: 'Retained earnings',
  자본총계: 'Total equity',
  매출액: 'Revenue',
  '수익(매출액)': 'Revenue',
  영업수익: 'Operating revenue',
  영업이익: 'Operating profit',
  '영업이익(손실)': 'Operating profit (loss)',
  법인세차감전순이익: 'Profit before income tax',
  '법인세차감전순이익(손실)': 'Profit (loss) before income tax',
  당기순이익: 'Net income',
  '당기순이익(손실)': 'Net income (loss)',
  '반기순이익(손실)': 'Net income (loss) for the half-year',
  '분기순이익(손실)': 'Net income (loss) for the quarter',
  총포괄손익: 'Total comprehensive income'
};

export function accountName(ko: string | null | undefined, locale: Locale): string {
  return lookup(ACCOUNTS_EN, ko, locale);
}

export const STATEMENTS_EN: Record<string, string> = {
  재무상태표: 'Statement of financial position',
  손익계산서: 'Income statement',
  포괄손익계산서: 'Statement of comprehensive income',
  현금흐름표: 'Statement of cash flows',
  자본변동표: 'Statement of changes in equity'
};

export function statementName(ko: string | null | undefined, locale: Locale): string {
  return lookup(STATEMENTS_EN, ko, locale);
}

const ORDINAL = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** "제 57 기" → "57th fiscal year"; "제 29 기 반기" → "29th fiscal year, H1". */
export function periodName(ko: string | null | undefined, locale: Locale): string {
  if (!ko || locale === 'ko') return ko ?? '';
  const m = /^제\s*(\d+)\s*기\s*(.*)$/.exec(ko.trim());
  if (!m) return ko;
  const part: Record<string, string> = { '1분기': 'Q1', 반기: 'H1', '3분기': 'Q3', 분기: 'quarter' };
  const suffix = m[2] ? (part[m[2].trim()] ?? m[2].trim()) : '';
  return `${ORDINAL(Number(m[1]))} fiscal year${suffix ? `, ${suffix}` : ''}`;
}

// ── People (elestock / majorstock) ─────────────────────────────────────

export const TITLES_EN: Record<string, string> = {
  대표이사: 'Representative Director',
  '대표이사 사장': 'Representative Director & President',
  대표이사회장: 'Representative Director & Chairman',
  회장: 'Chairman',
  부회장: 'Vice Chairman',
  사장: 'President',
  부사장: 'Executive Vice President',
  전무: 'Senior Vice President',
  상무: 'Vice President',
  이사: 'Director',
  사내이사: 'Inside Director',
  사외이사: 'Outside Director',
  기타비상무이사: 'Other Non-executive Director',
  감사: 'Statutory Auditor',
  감사위원: 'Audit Committee Member',
  등기임원: 'Registered executive',
  비등기임원: 'Non-registered executive',
  최대주주: 'Largest shareholder',
  '최대주주의 특수관계인': 'Related party of the largest shareholder',
  최대주주의특수관계인: 'Related party of the largest shareholder',
  주요주주: 'Major shareholder',
  사실상지배주주: 'De facto controlling shareholder',
  '10%이상주주': 'Shareholder with at least 10%',
  일반: 'General',
  약식: 'Short form'
};

export function personTerm(ko: string | null | undefined, locale: Locale): string {
  return lookup(TITLES_EN, ko, locale);
}

/** Every English mapping in this file, for the translation review report. */
export const TERM_TABLES = {
  'Markets (corp_cls)': Object.fromEntries(Object.entries(MARKETS_EN).map(([k, v]) => [`${k} ${MARKETS_KO[k]}`, v])),
  'Remark flags (rm)': RM_EN,
  'Periodic report codes': Object.fromEntries(Object.entries(REPORT_CODES_EN).map(([k, v]) => [`${k} ${REPORT_CODES_KO[k]}`, v])),
  'Major-event types (DS005)': EVENT_TITLES_EN,
  'Major-event themes': EVENT_THEMES_EN,
  'Filing title prefixes': AMEND_CHIPS_EN,
  'Filing types (report_nm)': REPORT_TYPES_EN,
  'Key accounts': ACCOUNTS_EN,
  'Financial statements': STATEMENTS_EN,
  'Titles and shareholder types': TITLES_EN
} as const;
