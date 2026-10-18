import { ENDPOINTS, type EndpointName } from 'magic-dart';

/** DS005 major-event endpoints, grouped by theme (guidelines/02). */
export const EVENT_THEMES: { label: string; endpoints: EndpointName[] }[] = [
  { label: '부실·법적 위험', endpoints: ['dfOcr', 'bsnSp', 'ctrcvsBgrq', 'dsRsOcr', 'bnkMngtPcbg', 'bnkMngtPcsp', 'lwstLg'] },
  { label: '자본 변동', endpoints: ['piicDecsn', 'fricDecsn', 'pifricDecsn', 'crDecsn'] },
  { label: '메자닌·채권 발행', endpoints: ['cvbdIsDecsn', 'bdwtIsDecsn', 'exbdIsDecsn', 'wdCocobdIsDecsn'] },
  { label: '자기주식', endpoints: ['tsstkAqDecsn', 'tsstkDpDecsn', 'tsstkAqTrctrCnsDecsn', 'tsstkAqTrctrCcDecsn'] },
  {
    label: '자산·영업 양수도',
    endpoints: [
      'astInhtrfEtcPtbkOpt',
      'bsnInhDecsn',
      'bsnTrfDecsn',
      'tgastInhDecsn',
      'tgastTrfDecsn',
      'otcprStkInvscrInhDecsn',
      'otcprStkInvscrTrfDecsn',
      'stkrtbdInhDecsn',
      'stkrtbdTrfDecsn'
    ]
  },
  { label: '합병·분할', endpoints: ['cmpMgDecsn', 'cmpDvDecsn', 'cmpDvmgDecsn', 'stkExtrDecsn'] },
  { label: '해외 상장', endpoints: ['ovLstDecsn', 'ovDlstDecsn', 'ovLst', 'ovDlst'] }
];

export const EVENT_ENDPOINTS: EndpointName[] = EVENT_THEMES.flatMap((t) => t.endpoints);

export const OWNERSHIP_KINDS = ['majorstock', 'elestock'] as const;
export type OwnershipKind = (typeof OWNERSHIP_KINDS)[number];

export function endpointTitle(name: string): string {
  return (ENDPOINTS as Record<string, { title: string }>)[name]?.title ?? name;
}

export function themeOf(endpoint: string): string {
  return EVENT_THEMES.find((t) => t.endpoints.includes(endpoint as EndpointName))?.label ?? '기타';
}

const squash = (s: string) => s.replace(/[\s·ㆍ・,]/g, '');

const EVENT_BY_TITLE = new Map(EVENT_ENDPOINTS.map((e) => [squash(endpointTitle(e)), e]));

/**
 * Which detail endpoint a new filing should trigger, judged from its report name.
 * e.g. "주요사항보고서(유상증자결정)" → piicDecsn, "임원ㆍ주요주주특정증권등소유상황보고서" → elestock.
 */
export function detailEndpointFor(reportNm: string): EndpointName | null {
  const name = squash(reportNm.replace(/^\[[^\]]*\]/, ''));
  if (name.includes('대량보유상황보고')) return 'majorstock';
  if (name.includes('특정증권등소유상황보고')) return 'elestock';
  if (!name.startsWith('주요사항보고서')) return null;
  const inner = /\(([^)]*)\)/.exec(name)?.[1];
  if (!inner) return null;
  return EVENT_BY_TITLE.get(inner) ?? null;
}

export const REPORT_LABELS: Record<string, string> = {
  '11013': '1분기',
  '11012': '반기',
  '11014': '3분기',
  '11011': '사업보고서'
};

export const CORP_CLS_LABELS: Record<string, string> = {
  Y: '유가증권',
  K: '코스닥',
  N: '코넥스',
  E: '기타'
};
