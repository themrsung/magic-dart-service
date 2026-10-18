# Mock OpenDART API

> **Snapshot: 2026-10-18.** The response shapes match OpenDART as of that date. If you're reading this much later, assume they're **stale**: check them against the [OpenDART developer guide](https://opendart.fss.or.kr/guide) before relying on them. The CLI and `npm run dev:mock` warn when the snapshot is more than 6 months old.

A small local stand-in for `https://opendart.fss.or.kr/api`, so you can develop and test without an API key, an allowlisted IP or the daily quota. All data is **fictional**:

| corp_code | Name | Market | Notes |
| --- | --- | --- | --- |
| `99000001` | 가상반도체 (Gasang Semiconductor) | KOSPI `990010` | Profitable. Has a treasury-share buyback (자기주식 취득 결정) |
| `99000002` | 모의바이오 (Moui Bio) | KOSDAQ `990020` | Loss-making. Has a rights offering (유상증자 결정) and a 5% holder report |
| `99000003` | 예시물류 (Yesi Logistics) | Unlisted | Profile and filings only. No key accounts, like real unlisted companies |

Corp codes and stock codes start with `99`, and receipt numbers use a `YYYYMMDD9xxxxx` range, so none of them collide with real DART identifiers.

## Endpoints

| Endpoint | Behaviour |
| --- | --- |
| `corpCode.xml` | ZIP containing `CORPCODE.xml` with the three companies |
| `company.json` | Company profile; `013` for unknown codes |
| `list.json` | Filings, filtered by `corp_code`, `bgn_de`/`end_de` (3-month default window without `corp_code`), `corp_cls`, with paging and `sort_mth` |
| `fnlttSinglAcnt.json`, `fnlttMultiAcnt.json` | Key accounts (CFS and OFS) for 2023–2025 (all quarters) and 2026 Q1/half. Later periods return `013`. Totals add up. Interim income statements carry 3-month and year-to-date amounts |
| `majorstock.json`, `elestock.json` | Ownership reports |
| 36 DS005 endpoints (`piicDecsn`, `tsstkAqDecsn`, …) | Major-event rows filtered by `bgn_de`/`end_de` |
| anything else | `013` (no data) |

- **Keys:** any 40-character alphanumeric `crtfc_key` is accepted, e.g. `mockopendartkey0000000000000000000000000`. The all-zeros key answers `010` (unregistered key), for testing error handling.
- **Dates:** with `shiftDates` / `MOCK_SHIFT_DATES=1`, every filing, ownership and event date moves forward by the number of days since the snapshot. Date-filtered queries like "today's filings" then return data. Financial periods don't move.
- **Snapshot header:** every response carries `x-mock-opendart-snapshot: 20261018`.

## Use

```sh
npm run dev:mock          # mock + vite dev wired to it, with the dev login bypass (see the main README)
npm run mock:opendart     # just the mock, on http://127.0.0.1:8790/api (MOCK_OPENDART_PORT)
```

Point anything at it with `OPENDART_BASE_URL=http://localhost:8790/api`, or in code:

```ts
import { startMockOpenDart, MOCK_API_KEY } from './test/mock-opendart/server.ts';
const mock = await startMockOpenDart(0, { shiftDates: true });
const client = new OpenDartClient({ apiKey: MOCK_API_KEY, baseUrl: mock.baseUrl });
```

`test/mock-opendart.test.ts` runs the app's own client, scheduled jobs, page cache and MCP tools against it.

## Updating

The data lives in `data.ts`. When you refresh shapes against the real API, update `SNAPSHOT_DATE` there and the date at the top of this file, and keep the values fictional.
