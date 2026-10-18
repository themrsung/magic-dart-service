/**
 * Mock OpenDART data: three FICTIONAL companies. Nothing here is real data.
 *
 * SNAPSHOT 2026-10-18. Field names follow the OpenDART responses as of that date. The values were
 * invented, not copied. If you are reading this much later, the real API may have changed: compare
 * against https://opendart.fss.or.kr/guide before trusting the shapes.
 */

export const SNAPSHOT_DATE = '20261018';

/** 8-digit corp codes starting with 99 and stock codes starting with 99 do not collide with real ones. */
export const CORPS = [
  {
    corp_code: '99000001',
    corp_name: '가상반도체',
    corp_eng_name: 'Gasang Semiconductor (MOCK)',
    stock_code: '990010',
    corp_cls: 'Y',
    modify_date: '20260302'
  },
  {
    corp_code: '99000002',
    corp_name: '모의바이오',
    corp_eng_name: 'Moui Bio (MOCK)',
    stock_code: '990020',
    corp_cls: 'K',
    modify_date: '20260415'
  },
  {
    corp_code: '99000003',
    corp_name: '예시물류',
    corp_eng_name: 'Yesi Logistics (MOCK)',
    stock_code: '',
    corp_cls: 'E',
    modify_date: '20251120'
  }
] as const;

export type CorpCode = (typeof CORPS)[number]['corp_code'];

/** company.json, without the status/message envelope. */
export const COMPANIES: Record<CorpCode, Record<string, string>> = {
  '99000001': {
    corp_code: '99000001',
    corp_name: '가상반도체(주)',
    corp_name_eng: 'GASANG SEMICONDUCTOR CO., LTD. (MOCK)',
    stock_name: '가상반도체',
    stock_code: '990010',
    ceo_nm: '김가상',
    corp_cls: 'Y',
    jurir_no: '9901110000001',
    bizr_no: '9900000001',
    adres: '경기도 가상시 모의구 예시로 1',
    hm_url: 'www.example.com/gasang',
    ir_url: '',
    phn_no: '031-000-0001',
    fax_no: '031-000-0002',
    induty_code: '264',
    est_dt: '19980301',
    acc_mt: '12'
  },
  '99000002': {
    corp_code: '99000002',
    corp_name: '모의바이오(주)',
    corp_name_eng: 'MOUI BIO INC. (MOCK)',
    stock_name: '모의바이오',
    stock_code: '990020',
    ceo_nm: '이모의',
    corp_cls: 'K',
    jurir_no: '9901110000002',
    bizr_no: '9900000002',
    adres: '서울특별시 예시구 테스트대로 22',
    hm_url: 'www.example.com/moui',
    ir_url: 'www.example.com/moui/ir',
    phn_no: '02-000-0022',
    fax_no: '',
    induty_code: '212',
    est_dt: '20110915',
    acc_mt: '12'
  },
  '99000003': {
    corp_code: '99000003',
    corp_name: '예시물류(주)',
    corp_name_eng: 'YESI LOGISTICS CO., LTD. (MOCK)',
    stock_name: '',
    stock_code: '',
    ceo_nm: '박예시',
    corp_cls: 'E',
    jurir_no: '9901110000003',
    bizr_no: '9900000003',
    adres: '인천광역시 모의구 항만로 333',
    hm_url: '',
    ir_url: '',
    phn_no: '032-000-0333',
    fax_no: '032-000-0334',
    induty_code: '529',
    est_dt: '20050601',
    acc_mt: '12'
  }
};

// ── Filings (list.json rows) ───────────────────────────────────────────
// rcept_no = filing date + "9" + 5 digits, a range real DART receipts don't use.

const corp = (code: CorpCode) => CORPS.find((c) => c.corp_code === code)!;
const filing = (rcept_no: string, code: CorpCode, report_nm: string, flr_nm: string, rm = '') => ({
  corp_code: code,
  corp_name: corp(code).corp_name,
  stock_code: corp(code).stock_code,
  corp_cls: corp(code).corp_cls,
  report_nm,
  rcept_no,
  flr_nm,
  rcept_dt: rcept_no.slice(0, 8),
  rm
});

export const FILINGS = [
  filing('20261018900001', '99000001', '주요사항보고서(자기주식취득결정)', '가상반도체', '유'),
  filing('20261018900002', '99000002', '임원ㆍ주요주주특정증권등소유상황보고서', '이모의'),
  filing('20261017900001', '99000002', '주식등의대량보유상황보고서(일반)', '모의투자파트너스'),
  filing('20261016900001', '99000003', '[기재정정]감사보고서 (2025.12)', '예시물류'),
  filing('20261002900001', '99000002', '주요사항보고서(유상증자결정)', '모의바이오', '코'),
  filing('20260814900001', '99000001', '반기보고서 (2026.06)', '가상반도체'),
  filing('20260814900002', '99000002', '반기보고서 (2026.06)', '모의바이오'),
  filing('20260515900001', '99000001', '분기보고서 (2026.03)', '가상반도체'),
  filing('20260515900002', '99000002', '분기보고서 (2026.03)', '모의바이오'),
  filing('20260410900001', '99000003', '감사보고서 (2025.12)', '예시물류'),
  filing('20260310900001', '99000001', '사업보고서 (2025.12)', '가상반도체', '연'),
  filing('20260318900001', '99000002', '사업보고서 (2025.12)', '모의바이오', '연'),
  filing('20251201900001', '99000001', '임원ㆍ주요주주특정증권등소유상황보고서', '김가상')
].sort((a, b) => b.rcept_no.localeCompare(a.rcept_no));

// ── Key accounts (fnlttSinglAcnt / fnlttMultiAcnt rows) ────────────────

/** Annual figures in KRW (CFS). Quarters and OFS are derived below. */
const BASE: Record<CorpCode, { listed: boolean; years: Record<number, Annual> }> = {
  '99000001': {
    listed: true,
    years: {
      2023: { ca: 820e9, nca: 1460e9, cl: 310e9, ncl: 240e9, cap: 50e9, re: 1310e9, rev: 1820e9, op: 151e9, pbt: 160e9, ni: 124e9, ci: 131e9 },
      2024: { ca: 905e9, nca: 1590e9, cl: 335e9, ncl: 228e9, cap: 50e9, re: 1452e9, rev: 2041e9, op: 212e9, pbt: 221e9, ni: 171e9, ci: 175e9 },
      2025: { ca: 1012e9, nca: 1702e9, cl: 361e9, ncl: 219e9, cap: 50e9, re: 1640e9, rev: 2390e9, op: 268e9, pbt: 279e9, ni: 214e9, ci: 222e9 },
      2026: { ca: 1080e9, nca: 1765e9, cl: 372e9, ncl: 211e9, cap: 50e9, re: 1748e9, rev: 2610e9, op: 301e9, pbt: 309e9, ni: 238e9, ci: 240e9 }
    }
  },
  '99000002': {
    listed: true,
    years: {
      // Loss-making biotech: negative operating income and net loss.
      2023: { ca: 96e9, nca: 74e9, cl: 21e9, ncl: 38e9, cap: 9e9, re: -42e9, rev: 18e9, op: -31e9, pbt: -33e9, ni: -33e9, ci: -32e9 },
      2024: { ca: 81e9, nca: 79e9, cl: 24e9, ncl: 41e9, cap: 9e9, re: -78e9, rev: 26e9, op: -35e9, pbt: -36e9, ni: -36e9, ci: -36e9 },
      2025: { ca: 63e9, nca: 85e9, cl: 30e9, ncl: 44e9, cap: 9e9, re: -110e9, rev: 41e9, op: -30e9, pbt: -32e9, ni: -32e9, ci: -31e9 },
      2026: { ca: 112e9, nca: 88e9, cl: 28e9, ncl: 43e9, cap: 11e9, re: -126e9, rev: 58e9, op: -16e9, pbt: -17e9, ni: -17e9, ci: -16e9 }
    }
  },
  '99000003': {
    // Unlisted: OpenDART has no key-account rows for it.
    listed: false,
    years: {}
  }
};

interface Annual {
  ca: number; // 유동자산
  nca: number; // 비유동자산
  cl: number; // 유동부채
  ncl: number; // 비유동부채
  cap: number; // 자본금
  re: number; // 이익잉여금
  rev: number; // 매출액
  op: number; // 영업이익
  pbt: number; // 법인세차감전 순이익
  ni: number; // 당기순이익(손실)
  ci: number; // 총포괄손익
}

export const REPORT_NAMES: Record<string, string> = { '11013': '1분기보고서', '11012': '반기보고서', '11014': '3분기보고서', '11011': '사업보고서' };

/** Reports filed on or before the snapshot (2026 Q3 is not due yet). */
const FILED: { year: number; reprt: string; rcept: Record<string, string> }[] = [];
for (const year of [2023, 2024, 2025]) {
  for (const reprt of ['11013', '11012', '11014', '11011']) {
    const rcept: Record<string, string> = {};
    for (const code of ['99000001', '99000002']) rcept[code] = mockReceipt(year, reprt, code);
    FILED.push({ year, reprt, rcept });
  }
}
for (const reprt of ['11013', '11012']) {
  FILED.push({ year: 2026, reprt, rcept: { '99000001': mockReceipt(2026, reprt, '99000001'), '99000002': mockReceipt(2026, reprt, '99000002') } });
}

function mockReceipt(year: number, reprt: string, code: string): string {
  const due: Record<string, string> = { '11013': `${year}0515`, '11012': `${year}0814`, '11014': `${year}1114`, '11011': `${year + 1}0310` };
  return `${due[reprt]}9${code.slice(-1)}${reprt.slice(-4)}`;
}

/** Share of the annual flow figure earned by the end of each quarter (cumulative). */
const CUMULATIVE: Record<string, number> = { '11013': 0.23, '11012': 0.48, '11014': 0.73, '11011': 1 };
const QUARTER: Record<string, number> = { '11013': 0.23, '11012': 0.25, '11014': 0.25, '11011': 0.27 };
const OFS_SHARE = 0.82;

const fmt = (n: number) => {
  const r = Math.round(n / 1e6) * 1e6;
  return (r < 0 ? '-' : '') + Math.abs(r).toLocaleString('en-US');
};

function periodDates(year: number, reprt: string, stock: boolean, back: number): string {
  const y = year - back;
  const end: Record<string, string> = { '11013': '03.31', '11012': '06.30', '11014': '09.30', '11011': '12.31' };
  if (stock) return `${y}.${back === 0 ? end[reprt] : '12.31'} 현재`;
  return `${y}.01.01 ~ ${y}.${end[reprt]}`;
}

const ACCOUNTS: { nm: string; sj: 'BS' | 'IS'; key: keyof Annual | 'assets' | 'liab' | 'equity'; ord: number }[] = [
  { nm: '유동자산', sj: 'BS', key: 'ca', ord: 1 },
  { nm: '비유동자산', sj: 'BS', key: 'nca', ord: 3 },
  { nm: '자산총계', sj: 'BS', key: 'assets', ord: 5 },
  { nm: '유동부채', sj: 'BS', key: 'cl', ord: 7 },
  { nm: '비유동부채', sj: 'BS', key: 'ncl', ord: 9 },
  { nm: '부채총계', sj: 'BS', key: 'liab', ord: 11 },
  { nm: '자본금', sj: 'BS', key: 'cap', ord: 13 },
  { nm: '이익잉여금', sj: 'BS', key: 're', ord: 17 },
  { nm: '자본총계', sj: 'BS', key: 'equity', ord: 21 },
  { nm: '매출액', sj: 'IS', key: 'rev', ord: 23 },
  { nm: '영업이익', sj: 'IS', key: 'op', ord: 25 },
  { nm: '법인세차감전 순이익', sj: 'IS', key: 'pbt', ord: 27 },
  { nm: '당기순이익(손실)', sj: 'IS', key: 'ni', ord: 29 },
  { nm: '총포괄손익', sj: 'IS', key: 'ci', ord: 63 }
];

function value(a: Annual, key: (typeof ACCOUNTS)[number]['key']): number {
  if (key === 'assets') return a.ca + a.nca;
  if (key === 'liab') return a.cl + a.ncl;
  // Equity = assets − liabilities (자본금 and 이익잉여금 are shown, other reserves absorb the rest).
  if (key === 'equity') return a.ca + a.nca - a.cl - a.ncl;
  return a[key];
}

/** Rows for one company and period in fnlttSinglAcnt shape, or [] when nothing was filed. */
export function keyAccounts(code: string, year: number, reprt: string): Record<string, string>[] {
  const base = BASE[code as CorpCode];
  const filed = FILED.find((f) => f.year === year && f.reprt === reprt);
  if (!base?.listed || !filed || !base.years[year]) return [];
  const c = corp(code as CorpCode);
  const annual = reprt === '11011';
  const rows: Record<string, string>[] = [];
  for (const [fs_div, fs_nm, share, ordShift] of [
    ['CFS', '연결재무제표', 1, 0],
    ['OFS', '재무제표', OFS_SHARE, 1]
  ] as const) {
    for (const acc of ACCOUNTS) {
      const at = (y: number) => {
        const a = base.years[y];
        if (!a) return '';
        const v = value(a, acc.key) * share;
        // Balance sheet items scale toward the year-end level; flows are cumulative or quarterly.
        if (acc.sj === 'BS') return fmt(y === year ? v * (0.94 + 0.06 * CUMULATIVE[reprt]) : v);
        return fmt(v * (annual ? 1 : QUARTER[reprt]));
      };
      const row: Record<string, string> = {
        rcept_no: filed.rcept[code],
        reprt_code: reprt,
        bsns_year: String(year),
        corp_code: code,
        stock_code: c.stock_code,
        fs_div,
        fs_nm,
        sj_div: acc.sj,
        sj_nm: acc.sj === 'BS' ? '재무상태표' : '손익계산서',
        account_nm: acc.nm,
        thstrm_nm: `제 ${year - 1997} 기${annual ? '' : ` ${REPORT_NAMES[reprt].replace('보고서', '')}`}`,
        thstrm_dt: periodDates(year, reprt, acc.sj === 'BS', 0),
        thstrm_amount: at(year),
        frmtrm_nm: `제 ${year - 1998} 기`,
        frmtrm_dt: periodDates(year, reprt, acc.sj === 'BS', 1),
        frmtrm_amount: acc.sj === 'IS' && !annual ? '' : at(year - 1),
        ord: String(acc.ord + ordShift),
        currency: 'KRW'
      };
      if (annual) {
        row.bfefrmtrm_nm = `제 ${year - 1999} 기`;
        row.bfefrmtrm_dt = periodDates(year, reprt, acc.sj === 'BS', 2);
        row.bfefrmtrm_amount = at(year - 2);
      } else if (acc.sj === 'IS') {
        // Interim income statements: 3-month figure in thstrm_amount, year-to-date in thstrm_add_amount.
        const a = base.years[year];
        const prev = base.years[year - 1];
        row.thstrm_add_amount = fmt(value(a, acc.key) * share * CUMULATIVE[reprt]);
        row.frmtrm_q_nm = `제 ${year - 1998} 기 ${REPORT_NAMES[reprt].replace('보고서', '')}`;
        row.frmtrm_q_amount = prev ? fmt(value(prev, acc.key) * share * QUARTER[reprt]) : '';
        row.frmtrm_add_amount = prev ? fmt(value(prev, acc.key) * share * CUMULATIVE[reprt]) : '';
      }
      rows.push(row);
    }
  }
  return rows;
}

// ── Ownership (DS004) ──────────────────────────────────────────────────

export const MAJORSTOCK: Record<string, Record<string, string>[]> = {
  '99000001': [
    {
      rcept_no: '20260702900001',
      rcept_dt: '2026-07-02',
      corp_code: '99000001',
      corp_name: '가상반도체',
      report_tp: '일반',
      repror: '가상홀딩스',
      stkqy: '3,120,000',
      stkqy_irds: '0',
      stkrt: '31.20',
      stkrt_irds: '0.00',
      ctr_stkqy: '0',
      ctr_stkrt: '0.00',
      report_resn: '- 보유주식등에 관한 계약의 변경'
    }
  ],
  '99000002': [
    {
      rcept_no: '20261017900001',
      rcept_dt: '2026-10-17',
      corp_code: '99000002',
      corp_name: '모의바이오',
      report_tp: '일반',
      repror: '모의투자파트너스',
      stkqy: '1,045,000',
      stkqy_irds: '210,000',
      stkrt: '5.81',
      stkrt_irds: '1.17',
      ctr_stkqy: '0',
      ctr_stkrt: '0.00',
      report_resn: '- 보유주식수 변동\n- 유상증자 참여'
    }
  ]
};

export const ELESTOCK: Record<string, Record<string, string>[]> = {
  '99000001': [
    {
      rcept_no: '20251201900001',
      rcept_dt: '2025-12-01',
      corp_code: '99000001',
      corp_name: '가상반도체',
      repror: '김가상',
      isu_exctv_rgist_at: '등기임원',
      isu_exctv_ofcps: '대표이사',
      isu_main_shrholdr: '최대주주의 특수관계인',
      sp_stock_lmp_cnt: '412,000',
      sp_stock_lmp_irds_cnt: '12,000',
      sp_stock_lmp_rate: '4.12',
      sp_stock_lmp_irds_rate: '0.12'
    }
  ],
  '99000002': [
    {
      rcept_no: '20261018900002',
      rcept_dt: '2026-10-18',
      corp_code: '99000002',
      corp_name: '모의바이오',
      repror: '이모의',
      isu_exctv_rgist_at: '등기임원',
      isu_exctv_ofcps: '대표이사',
      isu_main_shrholdr: '최대주주',
      sp_stock_lmp_cnt: '2,310,500',
      sp_stock_lmp_irds_cnt: '-15,000',
      sp_stock_lmp_rate: '12.84',
      sp_stock_lmp_irds_rate: '-0.08'
    }
  ]
};

// ── Major events (DS005), keyed by endpoint ────────────────────────────

export const EVENTS: Record<string, Record<string, string>[]> = {
  piicDecsn: [
    {
      rcept_no: '20261002900001',
      corp_cls: 'K',
      corp_code: '99000002',
      corp_name: '모의바이오',
      nstk_ostk_cnt: '2,000,000',
      nstk_estk_cnt: '-',
      fv_ps: '500',
      bfic_tisstk_ostk: '18,000,000',
      bfic_tisstk_estk: '-',
      fdpp_fclt: '-',
      fdpp_bsninh: '-',
      fdpp_op: '18,000,000,000',
      fdpp_dtrp: '-',
      fdpp_ocsa: '-',
      fdpp_etc: '6,000,000,000',
      ic_mthn: '제3자배정증자',
      ssl_at: '아니오',
      ssl_bgd: '-',
      ssl_edd: '-'
    }
  ],
  tsstkAqDecsn: [
    {
      rcept_no: '20261018900001',
      corp_cls: 'Y',
      corp_code: '99000001',
      corp_name: '가상반도체',
      aqpln_stk_ostk: '100,000',
      aqpln_stk_estk: '-',
      aqpln_prc_ostk: '12,300,000,000',
      aqpln_prc_estk: '-',
      aqexpd_bgd: '2026년 10월 19일',
      aqexpd_edd: '2027년 01월 18일',
      hdexpd_bgd: '-',
      hdexpd_edd: '-',
      aq_pp: '주주가치 제고',
      aq_mth: '유가증권시장을 통한 장내 직접 취득',
      cs_iv_bk: '모의증권',
      aq_dd: '2026년 10월 18일'
    }
  ]
};
