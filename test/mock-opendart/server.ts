/**
 * A mock of the OpenDART HTTP API (https://opendart.fss.or.kr/api) serving three fictional
 * companies, for local development and tests. Snapshot 2026-10-18 (see data.ts).
 *
 * Implemented: corpCode.xml, company.json, list.json, fnlttSinglAcnt.json, fnlttMultiAcnt.json,
 * majorstock.json, elestock.json and the 36 DS005 major-event endpoints. Any other endpoint answers
 * status 013 (no data), as OpenDART does for companies without such filings.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { crc32 } from 'node:zlib';
import { COMPANIES, CORPS, ELESTOCK, EVENTS, FILINGS, keyAccounts, MAJORSTOCK, SNAPSHOT_DATE } from './data.ts';

/** A well-formed key the mock accepts. Any 40-character alphanumeric key works except REJECTED_KEY. */
export const MOCK_API_KEY = 'mockopendartkey'.padEnd(40, '0');
/** Answers status 010 (unregistered key), for testing error handling. */
export const REJECTED_KEY = '0'.repeat(40);

/** DS005 endpoints (same request and row shape). */
const EVENT_ENDPOINTS = new Set([
  'astInhtrfEtcPtbkOpt', 'dfOcr', 'bsnSp', 'ctrcvsBgrq', 'dsRsOcr', 'bnkMngtPcbg', 'bnkMngtPcsp', 'lwstLg', 'piicDecsn',
  'fricDecsn', 'pifricDecsn', 'crDecsn', 'cvbdIsDecsn', 'bdwtIsDecsn', 'exbdIsDecsn', 'wdCocobdIsDecsn', 'tsstkAqDecsn',
  'tsstkDpDecsn', 'tsstkAqTrctrCnsDecsn', 'tsstkAqTrctrCcDecsn', 'bsnInhDecsn', 'bsnTrfDecsn', 'tgastInhDecsn', 'tgastTrfDecsn',
  'otcprStkInvscrInhDecsn', 'otcprStkInvscrTrfDecsn', 'stkrtbdInhDecsn', 'stkrtbdTrfDecsn', 'cmpMgDecsn', 'cmpDvDecsn',
  'cmpDvmgDecsn', 'stkExtrDecsn', 'ovLstDecsn', 'ovDlstDecsn', 'ovLst', 'ovDlst'
]);

export interface MockOptions {
  /**
   * Move every filing, ownership and event date forward by the days between the snapshot and today,
   * so date-filtered queries such as "today's filings" return data. Financial periods don't move.
   */
  shiftDates?: boolean;
  /** For tests: the date treated as today (YYYYMMDD). */
  today?: string;
  /** Called for every request (path and status), e.g. for logging. */
  onRequest?: (path: string, status: string) => void;
}

export interface MockOpenDart {
  /** Base URL to pass as OPENDART_BASE_URL / OpenDartClient `baseUrl`, ending in /api. */
  baseUrl: string;
  server: Server;
  /** Requests served so far, by endpoint path. */
  hits: Map<string, number>;
  close(): Promise<void>;
}

// ── Dates ──────────────────────────────────────────────────────────────

const toUtc = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');
const kstToday = () => fromUtc(Date.now() + 9 * 3600_000);
const addDays = (ymd: string, days: number) => fromUtc(toUtc(ymd) + days * 86400_000);

/** Days between the snapshot and `today`, used when shiftDates is on. */
function shiftFor(opts: MockOptions): number {
  return opts.shiftDates ? Math.round((toUtc(opts.today ?? kstToday()) - toUtc(SNAPSHOT_DATE)) / 86400_000) : 0;
}

/** Shifts YYYYMMDD prefixes of rcept_no/rcept_dt (both "20261018" and "2026-10-18" forms). */
function shiftRow<T extends Record<string, string>>(row: T, days: number): T {
  if (!days) return row;
  const out: Record<string, string> = { ...row };
  if (out.rcept_no) out.rcept_no = addDays(out.rcept_no.slice(0, 8), days) + out.rcept_no.slice(8);
  if (out.rcept_dt) {
    const dashed = out.rcept_dt.includes('-');
    const d = addDays(out.rcept_dt.replaceAll('-', ''), days);
    out.rcept_dt = dashed ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
  }
  return out as T;
}

// ── corpCode.xml (a ZIP holding CORPCODE.xml) ───────────────────────────

/** Minimal store-only ZIP with one entry. */
function zipOne(name: string, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 name
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42); // local header offset
  const localPart = Buffer.concat([local, nameBuf, data]);
  const centralPart = Buffer.concat([central, nameBuf]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, end]);
}

function corpCodeZip(): Buffer {
  const items = CORPS.map(
    (c) =>
      `<list>\n<corp_code>${c.corp_code}</corp_code>\n<corp_name>${c.corp_name}</corp_name>\n<corp_eng_name>${c.corp_eng_name}</corp_eng_name>\n<stock_code>${c.stock_code || ' '}</stock_code>\n<modify_date>${c.modify_date}</modify_date>\n</list>`
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<result>\n${items.join('\n')}\n</result>\n`;
  return zipOne('CORPCODE.xml', Buffer.from(xml, 'utf8'));
}

// ── Request handling ───────────────────────────────────────────────────

type Reply = { status: string; body: Record<string, unknown> | Buffer };

const ok = (body: Record<string, unknown>): Reply => ({ status: '000', body: { status: '000', message: '정상', ...body } });
const status = (code: string, message: string): Reply => ({ status: code, body: { status: code, message } });
const noData = () => status('013', '조회된 데이타가 없습니다.');

function corpCodes(raw: string | null): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function inRange(rceptNo: string, bgn: string | null, end: string | null): boolean {
  const d = rceptNo.slice(0, 8);
  return (!bgn || d >= bgn) && (!end || d <= end);
}

function handle(endpoint: string, q: URLSearchParams, opts: MockOptions): Reply {
  const key = q.get('crtfc_key') ?? '';
  if (!/^[0-9a-zA-Z]{40}$/.test(key) || key === REJECTED_KEY) return status('010', '등록되지 않은 키입니다.');
  const shift = shiftFor(opts);
  const today = opts.today ?? kstToday();

  if (endpoint === 'corpCode') return { status: '000', body: corpCodeZip() };

  if (endpoint === 'company') {
    const c = COMPANIES[q.get('corp_code') as keyof typeof COMPANIES];
    return c ? ok(c) : noData();
  }

  if (endpoint === 'list') {
    const code = q.get('corp_code');
    const end = q.get('end_de') ?? today;
    // Without corp_code OpenDART only searches a 3-month window.
    const bgn = q.get('bgn_de') ?? (code ? '19990101' : addDays(end, -90));
    const cls = q.get('corp_cls');
    const rows = FILINGS.map((f) => shiftRow(f, shift)).filter(
      (f) => (!code || f.corp_code === code) && (!cls || f.corp_cls === cls) && inRange(f.rcept_no, bgn, end)
    );
    if (q.get('sort_mth') === 'asc') rows.reverse();
    const pageNo = Math.max(1, Number(q.get('page_no') ?? 1));
    const pageCount = Math.min(100, Math.max(1, Number(q.get('page_count') ?? 10)));
    if (rows.length === 0) return noData();
    return ok({
      page_no: pageNo,
      page_count: pageCount,
      total_count: rows.length,
      total_page: Math.ceil(rows.length / pageCount),
      list: rows.slice((pageNo - 1) * pageCount, pageNo * pageCount)
    });
  }

  if (endpoint === 'fnlttSinglAcnt' || endpoint === 'fnlttMultiAcnt') {
    const codes = corpCodes(q.get('corp_code'));
    if (endpoint === 'fnlttMultiAcnt' && codes.length > 100) return status('021', '조회 가능한 회사 개수가 초과하였습니다.(최대 100건)');
    const rows = codes.flatMap((c) => keyAccounts(c, Number(q.get('bsns_year')), q.get('reprt_code') ?? ''));
    return rows.length ? ok({ list: rows }) : noData();
  }

  if (endpoint === 'majorstock' || endpoint === 'elestock') {
    const rows = (endpoint === 'majorstock' ? MAJORSTOCK : ELESTOCK)[q.get('corp_code') ?? ''] ?? [];
    return rows.length ? ok({ list: rows.map((r) => shiftRow(r, shift)) }) : noData();
  }

  if (EVENT_ENDPOINTS.has(endpoint)) {
    const code = q.get('corp_code');
    const rows = (EVENTS[endpoint] ?? [])
      .map((r) => shiftRow(r, shift))
      .filter((r) => r.corp_code === code && inRange(r.rcept_no, q.get('bgn_de'), q.get('end_de')));
    return rows.length ? ok({ list: rows }) : noData();
  }

  return noData();
}

function respond(req: IncomingMessage, res: ServerResponse, opts: MockOptions, hits: Map<string, number>): void {
  const url = new URL(req.url ?? '/', 'http://mock');
  const m = /^\/api\/([A-Za-z0-9]+)\.(json|xml)$/.exec(url.pathname);
  res.setHeader('x-mock-opendart-snapshot', SNAPSHOT_DATE);
  if (!m) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('mock OpenDART: unknown path\n');
    return;
  }
  const [, endpoint, ext] = m;
  hits.set(endpoint, (hits.get(endpoint) ?? 0) + 1);
  const reply = handle(endpoint, url.searchParams, opts);
  opts.onRequest?.(`${endpoint}.${ext}`, reply.status);
  if (Buffer.isBuffer(reply.body)) {
    res.writeHead(200, { 'content-type': 'application/x-msdownload' }).end(reply.body);
  } else if (ext === 'xml') {
    // ZIP endpoints answer errors as XML.
    const b = reply.body as { status: string; message: string };
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' }).end(`<?xml version="1.0" encoding="UTF-8"?><result><status>${b.status}</status><message>${b.message}</message></result>`);
  } else {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(reply.body));
  }
}

/** Starts the mock on `port` (0 = any free port) and 127.0.0.1. */
export function startMockOpenDart(port = 0, opts: MockOptions = {}): Promise<MockOpenDart> {
  const hits = new Map<string, number>();
  const server = createServer((req, res) => respond(req, res, opts, hits));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const p = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        baseUrl: `http://127.0.0.1:${p}/api`,
        server,
        hits,
        close: () => new Promise((r) => server.close(() => r()))
      });
    });
  });
}

/** Days since the snapshot; the CLI warns when the data is getting old. */
export function snapshotAgeDays(today = kstToday()): number {
  return Math.round((toUtc(today) - toUtc(SNAPSHOT_DATE)) / 86400_000);
}
