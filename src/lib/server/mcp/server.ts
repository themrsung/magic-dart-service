import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { viewerUrl, type ReportCode } from 'magic-dart';
import { z } from 'zod';
import * as cache from '../cache';
import { CORP_CLS_LABELS, endpointTitle, REPORT_LABELS, themeOf } from '../catalog';
import { usageToday } from '../dart';
import { AUTO_DAILY_BUDGET, TOTAL_DAILY_CAP } from '../settings';
import { queryFilings, searchCorps } from '../store';

const REPORTS = { annual: '11011', q1: '11013', half: '11012', q3: '11014' } as const satisfies Record<string, ReportCode>;

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

const corpCode = z.string().regex(/^\d{8}$/).describe('8자리 DART 고유번호 (search_companies로 조회)');

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'magic-dart', version: '0.1.0' },
    {
      instructions:
        'OpenDART(금융감독원 전자공시) 데이터의 로컬 캐시입니다. 기업은 먼저 search_companies로 corp_code를 찾으세요. ' +
        '금액은 원문 문자열 그대로이며 단위·기간(당기/전기, 연결/별도)을 함께 확인해야 합니다. 원문은 viewer_url로 확인할 수 있습니다.'
    }
  );

  server.registerTool(
    'search_companies',
    {
      title: '기업 검색',
      description: '회사명(한글/영문) 또는 6자리 종목코드로 기업을 검색합니다. 상장사가 먼저 나옵니다.',
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).default(10), listed_only: z.boolean().default(false) },
      annotations: { readOnlyHint: true }
    },
    async ({ query, limit, listed_only }) =>
      json(
        searchCorps(query, limit, listed_only).map((c) => ({
          corp_code: c.corp_code,
          corp_name: c.corp_name,
          corp_eng_name: c.corp_eng_name || undefined,
          stock_code: c.stock_code || undefined,
          market: c.corp_cls ? CORP_CLS_LABELS[c.corp_cls] : undefined
        }))
      )
  );

  server.registerTool(
    'get_company',
    {
      title: '기업개황',
      description: '기업개황(대표자, 업종, 주소, 결산월 등)을 반환합니다.',
      inputSchema: { corp_code: corpCode },
      annotations: { readOnlyHint: true }
    },
    async ({ corp_code }) => {
      const r = await cache.company(corp_code, 'mcp');
      if (!r.data) return fail(r.error?.message ?? '기업을 찾을 수 없습니다');
      return json({ ...r.data, fetched_at: r.fetchedAt && new Date(r.fetchedAt).toISOString(), warning: r.error?.message });
    }
  );

  server.registerTool(
    'list_filings',
    {
      title: '공시 목록',
      description:
        'corp_code가 있으면 해당 기업의 최근 1년 공시를, 없으면 전체 공시 피드(캐시)를 최신순으로 반환합니다. before에 rcept_no를 넣으면 다음 페이지입니다.',
      inputSchema: {
        corp_code: corpCode.optional(),
        query: z.string().optional().describe('보고서명/회사명 키워드'),
        limit: z.number().int().min(1).max(100).default(30),
        before: z.string().regex(/^\d{14}$/).optional()
      },
      annotations: { readOnlyHint: true }
    },
    async ({ corp_code, query, limit, before }) => {
      let warning: string | undefined;
      if (corp_code && !before) warning = (await cache.corpFilings(corp_code, 'mcp')).error?.message;
      const rows = queryFilings({ corp_code, q: query, limit, before });
      return json({ filings: rows.map((f) => ({ ...f, viewer_url: viewerUrl(f.rcept_no) })), warning });
    }
  );

  server.registerTool(
    'get_financials',
    {
      title: '주요 재무계정',
      description: '단일회사 주요계정(재무상태표·손익계산서). 연결(CFS)과 별도(OFS)가 fs_div로 구분됩니다. 반기/분기 손익은 thstrm_amount가 3개월, thstrm_add_amount가 누적입니다.',
      inputSchema: {
        corp_code: corpCode,
        year: z.number().int().min(2015),
        report: z.enum(['annual', 'q1', 'half', 'q3']).default('annual')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ corp_code, year, report }) => {
      const r = await cache.financials(corp_code, year, REPORTS[report], 'mcp');
      if (!r.data) return fail(r.error?.message ?? '데이터가 없습니다');
      return json({
        period: `${year} ${REPORT_LABELS[REPORTS[report]]}`,
        rows: r.data.rows,
        fetched_at: r.fetchedAt && new Date(r.fetchedAt).toISOString(),
        warning: r.error?.message
      });
    }
  );

  server.registerTool(
    'get_ownership',
    {
      title: '지분 공시',
      description: 'majorstock: 주식등의 대량보유상황보고(5% 보고), elestock: 임원·주요주주 소유보고.',
      inputSchema: { corp_code: corpCode, kind: z.enum(['majorstock', 'elestock']), limit: z.number().int().min(1).max(500).default(50) },
      annotations: { readOnlyHint: true }
    },
    async ({ corp_code, kind, limit }) => {
      const r = await cache.ownership(corp_code, kind, 'mcp');
      const rows = [...r.data].sort((a, b) => String(b.rcept_no ?? '').localeCompare(String(a.rcept_no ?? ''))).slice(0, limit);
      return json({ total: r.data.length, rows, fetched_at: r.fetchedAt && new Date(r.fetchedAt).toISOString(), warning: r.error?.message });
    }
  );

  server.registerTool(
    'get_major_events',
    {
      title: '주요사항보고',
      description: '유상증자, 자기주식, 합병 등 주요사항보고서(36개 유형)를 캐시에서 반환합니다. refresh=true면 최근 1년을 다시 조회합니다(요청 36건 사용).',
      inputSchema: { corp_code: corpCode, refresh: z.boolean().default(false) },
      annotations: { readOnlyHint: true }
    },
    async ({ corp_code, refresh }) => {
      const r = await cache.events(corp_code, 'mcp', refresh);
      return json({
        events: r.data.map((e) => ({ type: endpointTitle(e.endpoint), theme: themeOf(e.endpoint), rcept_no: e.rcept_no, viewer_url: viewerUrl(e.rcept_no), ...e.row })),
        last_sweep: r.fetchedAt && new Date(r.fetchedAt).toISOString(),
        failed_types: r.failed?.map(endpointTitle),
        warning: r.error?.message
      });
    }
  );

  server.registerTool(
    'get_filing_document_url',
    {
      title: '공시 원문 링크',
      description: '접수번호(rcept_no)로 DART 뷰어 URL을 반환합니다.',
      inputSchema: { rcept_no: z.string().regex(/^\d{14}$/) },
      annotations: { readOnlyHint: true }
    },
    async ({ rcept_no }) => json({ viewer_url: viewerUrl(rcept_no) })
  );

  server.registerTool(
    'get_usage',
    {
      title: '오늘 요청 사용량',
      description: '오늘(KST) OpenDART 요청 사용량과 한도.',
      inputSchema: {},
      annotations: { readOnlyHint: true }
    },
    async () =>
      json({
        total: usageToday(),
        total_cap: TOTAL_DAILY_CAP,
        automatic: usageToday('cron'),
        automatic_budget: AUTO_DAILY_BUDGET,
        mcp: usageToday('mcp'),
        ui: usageToday('ui')
      })
  );

  return server;
}

/** Stateless Streamable HTTP: a fresh server + transport per request. */
export async function handleMcp(request: Request): Promise<Response> {
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Responses are fully buffered (enableJsonResponse), so it is safe to tear down now.
    void transport.close();
    void server.close();
  }
}
