/**
 * Shared UI: layout, navigation, language switch, errors, data freshness.
 *
 * GLOSSARY (keep English consistent across all namespaces):
 * - 공시 → filing(s) (a single disclosure document); 전자공시 → electronic disclosure
 * - OpenDART API 키 / 인증키 → OpenDART API key
 * - 기업 → company; 상장사 → listed companies; 고유번호 → DART corp code
 * - 기업개황 → company profile; 대표자 → CEO; 결산월 → fiscal year-end
 * - 재무 → financials; 연결 → consolidated; 별도 → separate (K-IFRS term, not "standalone")
 * - 사업보고서 → annual business report; 반기 → half-year; 1분기/3분기 → Q1/Q3
 * - 지분 → ownership; 대량보유 → large shareholdings (5% rule); 임원·주요주주 → executives and major shareholders
 * - 주요사항보고(서) → material event report(s)
 * - 원 amounts → KRW, trillions as "tn", billions as "bn" (Korean business-English convention)
 * - 관리 → Admin; 계정 → Account; 승인 → approve; 연결 해제 → disconnect
 * - 2단계 인증 → two-step verification; 패스키 → passkey; 인증 앱 → authenticator app; 복구 코드 → recovery code
 * - Comparisons must stay mathematically exact: 이상 (≥) → "at least X" / "X or more"; 이하 (≤) → "at most X" /
 *   "X or less"; 초과 (>) → "more than X"; 미만 (<) → "less than X". Never "over", "under", "up to" or "X+".
 * - 새로 고침 → refresh; 수집 작업 → data jobs; 요청 → (API) requests; 한도 → cap / budget
 */
export const ko = {
  'common.appName': 'MagicDART',
  'common.home': 'MagicDART 홈',
  'common.nav.main': '주 메뉴',
  'common.nav.bottom': '하단 메뉴',
  'common.nav.filings': '공시',
  'common.nav.companies': '기업',
  'common.nav.account': '계정',
  'common.nav.admin': '관리',
  'common.lang.switch': '언어를 바꿉니다',
  'common.banner.noKeyAdmin': 'OpenDART API 키가 아직 없습니다. 저장된 데이터만 보여줍니다.',
  'common.banner.noKeyAdminLink': '관리에서 키 등록 →',
  'common.banner.noKeyUser': 'OpenDART API 키가 아직 등록되지 않아 저장된 데이터만 보여줍니다. 관리자에게 문의하세요.',
  'common.error.notFound': '찾을 수 없습니다',
  'common.error.generic': '문제가 발생했습니다',
  'common.error.home': '처음으로',
  'common.fresh.asOf': '기준',
  'common.fresh.never': '아직 조회된 적 없음',
  'common.fresh.failed': '새로 고침 실패: {message}',
  'common.fresh.adminLink': '관리자 설정',
  'common.dash': '—',
  'common.footer.madeBy': '미래 리서치 제공',
  'common.footer.notice': '본 서비스를 통해 제공되는 자료는 본 소프트웨어의 개발사 또는 공동개발자의 입장과 무관하며, 금융감독원의 자료를 원문 그대로 표시하고 있습니다.',
  // English only: empty in Korean, and the footer skips empty lines.
  'common.footer.standards': ''
} as const;

export const en: { [K in keyof typeof ko]: string } = {
  'common.appName': 'MagicDART',
  'common.home': 'MagicDART home',
  'common.nav.main': 'Main menu',
  'common.nav.bottom': 'Bottom menu',
  'common.nav.filings': 'Filings',
  'common.nav.companies': 'Companies',
  'common.nav.account': 'Account',
  'common.nav.admin': 'Admin',
  'common.lang.switch': 'Change language',
  'common.banner.noKeyAdmin': 'No OpenDART API key yet. Only stored data is shown.',
  'common.banner.noKeyAdminLink': 'Add a key in Admin →',
  'common.banner.noKeyUser': 'No OpenDART API key has been added yet, so only stored data is shown. Please contact your administrator.',
  'common.error.notFound': 'Not found',
  'common.error.generic': 'Something went wrong',
  'common.error.home': 'Back to start',
  'common.fresh.asOf': 'Updated',
  'common.fresh.never': 'Not fetched yet',
  'common.fresh.failed': 'Refresh failed: {message}',
  'common.fresh.adminLink': 'admin settings',
  'common.dash': '—',
  'common.footer.madeBy': 'Made by Mirae Research',
  // Wording supplied by the project owner; each \n is a separate line in the footer.
  'common.footer.notice':
    'English translations have not been audited by outside entities. Verify before trusting.\nMirae Research and the contributors of this software are not responsible for the content provided by this service.',
  'common.footer.standards':
    'Financial data is presented under K-IFRS or K-GAAP as filed, and may differ from figures prepared under other accounting standards, such as US GAAP.'
};
