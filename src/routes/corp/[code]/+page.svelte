<script lang="ts">
  import { enhance } from '$app/forms';
  import { navigating, page } from '$app/state';
  import FilingList from '$lib/components/FilingList.svelte';
  import Freshness from '$lib/components/Freshness.svelte';
  import { date, krwShort, MARKET, num, REPORTS } from '$lib/format';
  import { viewerUrl } from '$lib/normalize';

  let { data, form } = $props();

  type Row = Record<string, string | undefined>;

  const tabs = [
    { id: 'overview', label: '개요' },
    { id: 'filings', label: '공시' },
    { id: 'financials', label: '재무' },
    { id: 'ownership', label: '지분' },
    { id: 'events', label: '주요사항' }
  ];

  const name = $derived(data.company?.corp_name ?? data.corp?.corp_name ?? data.code);
  const cls = $derived(data.company?.corp_cls ?? data.corp?.corp_cls ?? null);
  const stock = $derived(data.company?.stock_code?.trim() || data.corp?.stock_code || '');
  let busy = $state(false);

  const submit = () => {
    busy = true;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      busy = false;
    };
  };

  // ── financials helpers ──
  let fsChoice = $state<'CFS' | 'OFS'>('CFS');
  const finRows = $derived<Row[]>(data.tab === 'financials' && data.fin ? (data.fin.rows as Row[]) : []);
  const hasCfs = $derived(finRows.some((r) => r.fs_div === 'CFS'));
  const fs = $derived(hasCfs ? fsChoice : 'OFS');
  const shown = $derived(finRows.filter((r) => r.fs_div === fs).sort((a, b) => Number(a.ord) - Number(b.ord)));
  const sections = $derived(
    Object.entries(
      shown.reduce<Record<string, Row[]>>((acc, r) => {
        (acc[r.sj_nm ?? r.sj_div ?? ''] ??= []).push(r);
        return acc;
      }, {})
    )
  );
  const reprtLabel = (c: string) => REPORTS.find((r) => r.code === c)?.label ?? c;

  function headlineOf(rows: Row[] | undefined) {
    if (!rows?.length) return [];
    const basis = rows.some((r) => r.fs_div === 'CFS') ? 'CFS' : 'OFS';
    const pick = (...names: string[]) => rows.find((r) => r.fs_div === basis && names.some((n) => r.account_nm?.replace(/\s/g, '').startsWith(n)));
    return [
      { label: '매출액', row: pick('매출액', '수익(매출액)', '영업수익') },
      { label: '영업이익', row: pick('영업이익') },
      { label: '당기순이익', row: pick('당기순이익') },
      { label: '자산총계', row: pick('자산총계') }
    ]
      .filter((k) => k.row)
      .map((k) => ({ ...k, basis: basis === 'CFS' ? '연결' : '별도' }));
  }

  // ── events ──
  let theme = $state<string | null>(null);
  const shownEvents = $derived(data.tab === 'events' ? data.events.filter((e) => !theme || e.theme === theme) : []);
  const eventSummary = (row: Row) =>
    [
      row.nstk_ostk_cnt && `신주(보통) ${num(row.nstk_ostk_cnt)}주`,
      row.aqpln_stk_ostk && `취득예정 ${num(row.aqpln_stk_ostk)}주`,
      row.dppln_stk_ostk && `처분예정 ${num(row.dppln_stk_ostk)}주`,
      row.bd_fta && `사채 ${krwShort(row.bd_fta)?.text ?? row.bd_fta}`,
      row.fdpp_fclt && `시설자금 ${krwShort(row.fdpp_fclt)?.text}`,
      row.fdpp_op && `운영자금 ${krwShort(row.fdpp_op)?.text}`,
      row.mg_mth && `합병방법 ${row.mg_mth}`,
      row.dv_mth && `분할방법 ${row.dv_mth}`,
      row.icnm && `사건 ${row.icnm}`
    ]
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ');
</script>

<svelte:head><title>{name} · MagicDART</title></svelte:head>

<header class="corp-head">
  <div class="title-row">
    <h1>{name}</h1>
    {#if cls && MARKET[cls]}<span class="chip {MARKET[cls].cls}">{MARKET[cls].label}</span>{/if}
    {#if stock}<span class="muted code">{stock}</span>{/if}
  </div>
  {#if data.company?.corp_name_eng}<p class="eng muted">{data.company.corp_name_eng}</p>{/if}
  <nav class="tabs" aria-label="기업 정보">
    {#each tabs as t}
      <a href="?tab={t.id}" aria-current={data.tab === t.id ? 'page' : undefined} data-sveltekit-noscroll>{t.label}</a>
    {/each}
  </nav>
</header>

{#if form?.message}<p class="banner info" role="status">{form.message}</p>{/if}
{#if navigating.to}<div class="skeleton bar" aria-hidden="true"></div>{/if}

{#if data.tab === 'overview'}
  <section class="grid">
    <div class="card">
      <h2>기업개황</h2>
      {#if data.company}
        <dl class="facts">
          <dt>대표자</dt><dd>{data.company.ceo_nm || '—'}</dd>
          <dt>설립일</dt><dd>{date(data.company.est_dt)}</dd>
          <dt>결산월</dt><dd>{data.company.acc_mt ? `${Number(data.company.acc_mt)}월` : '—'}</dd>
          <dt>업종코드</dt><dd>{data.company.induty_code || '—'}</dd>
          <dt>주소</dt><dd>{data.company.adres || '—'}</dd>
          <dt>홈페이지</dt>
          <dd>
            {#if data.company.hm_url}<a href={data.company.hm_url.startsWith('http') ? data.company.hm_url : `http://${data.company.hm_url}`} target="_blank" rel="noopener">{data.company.hm_url}</a>{:else}—{/if}
          </dd>
          <dt>전화</dt><dd>{data.company.phn_no || '—'}</dd>
        </dl>
      {:else}
        <p class="muted">기업개황이 아직 없습니다.</p>
      {/if}
      <div class="foot">
        <Freshness at={data.companyAt} error={data.companyError} />
        <form method="POST" action="?/refresh" use:enhance={submit}>
          <input type="hidden" name="what" value="company" />
          <button class="btn ghost small" disabled={busy}>새로 고침</button>
        </form>
      </div>
    </div>

    <div class="card">
      <h2>주요 재무 {#if data.headline}<span class="muted sub">{data.headline.bsns_year} 사업보고서</span>{/if}</h2>
      {#if headlineOf(data.headline?.rows as Row[]).length}
        <div class="kpis">
          {#each headlineOf(data.headline?.rows as Row[]) as k}
            {@const cur = krwShort(k.row?.thstrm_amount)}
            {@const prev = krwShort(k.row?.frmtrm_amount)}
            <div class="kpi">
              <span class="muted">{k.label}</span>
              <strong class="num" class:neg={cur?.negative} title={cur?.full} aria-label={cur?.full}>{cur?.text ?? '—'}</strong>
              {#if prev}<span class="muted small num">전기 {prev.text}</span>{/if}
            </div>
          {/each}
        </div>
        <p class="muted small">{headlineOf(data.headline?.rows as Row[])[0].basis} 기준 · <a href="?tab=financials">재무 자세히 →</a></p>
      {:else}
        <p class="muted">{data.headlineError?.message ?? '사업보고서 재무 데이터가 없습니다.'}</p>
      {/if}
    </div>
  </section>

  <section class="card">
    <h2>최근 공시</h2>
    <FilingList filings={data.filings} today={data.today} showCorp={false} />
    <p><a href="?tab=filings">전체 공시 보기 →</a></p>
  </section>
{:else if data.tab === 'filings'}
  <section class="card">
    <div class="foot">
      <Freshness at={data.filingsAt} error={data.filingsError} />
      <form method="POST" action="?/refresh" use:enhance={submit}>
        <input type="hidden" name="what" value="filings" />
        <button class="btn ghost small" disabled={busy}>새로 고침</button>
      </form>
    </div>
    <FilingList filings={data.filings} today={data.today} showCorp={false} />
    <p class="muted small">최근 1년 공시 (최대 200건)</p>
  </section>
{:else if data.tab === 'financials'}
  <form class="period card" method="GET">
    <input type="hidden" name="tab" value="financials" />
    <label>
      <span class="muted small">사업연도</span>
      <select name="year" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
        {#each Array.from({ length: data.maxYear - 2014 }, (_, i) => data.maxYear - i) as y}
          <option value={y} selected={y === data.year}>{y}</option>
        {/each}
      </select>
    </label>
    <fieldset class="seg">
      <legend class="muted small">보고서</legend>
      {#each REPORTS as r}
        <label class:on={r.code === data.reprt}>
          <input type="radio" name="reprt" value={r.code} checked={r.code === data.reprt} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
          {r.label}
        </label>
      {/each}
    </fieldset>
    <noscript><button class="btn small">보기</button></noscript>
  </form>

  <section class="card">
    <div class="foot">
      <div>
        <h2>{data.year} {reprtLabel(data.reprt)} · {fs === 'CFS' ? '연결' : '별도'}</h2>
        <Freshness at={data.finAt} error={data.finError} />
      </div>
      <div class="fs-toggle" role="group" aria-label="재무제표 기준">
        <button class="btn small" class:ghost={fs !== 'CFS'} disabled={!hasCfs} onclick={() => (fsChoice = 'CFS')}>연결</button>
        <button class="btn small" class:ghost={fs !== 'OFS'} onclick={() => (fsChoice = 'OFS')}>별도</button>
      </div>
    </div>
    {#if !hasCfs && finRows.length}<p class="muted small">연결재무제표가 없어 별도 기준으로 표시합니다.</p>{/if}

    {#if shown.length}
      {#each sections as [title, rows]}
        {@const isFlowQuarter = data.reprt !== '11011' && rows.some((r) => r.thstrm_add_amount)}
        <h3 class="sj">{title}</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">계정</th>
                <th scope="col" class="num">{rows[0].thstrm_nm ?? '당기'}{isFlowQuarter ? ' (3개월)' : ''}</th>
                {#if isFlowQuarter}<th scope="col" class="num">누적</th>{/if}
                <th scope="col" class="num hide-sm">{rows[0].frmtrm_nm ?? '전기'}</th>
                <th scope="col" class="num hide-md">{rows[0].bfefrmtrm_nm ?? '전전기'}</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as r}
                {@const a = krwShort(r.thstrm_amount, '')}
                {@const add = krwShort(r.thstrm_add_amount, '')}
                {@const b = krwShort(r.frmtrm_amount, '')}
                {@const c = krwShort(r.bfefrmtrm_amount, '')}
                <tr class:total={/총계|합계/.test(r.account_nm ?? '')}>
                  <th scope="row">{r.account_nm}</th>
                  <td class="num" class:neg={a?.negative} title={a?.full}>{a?.text ?? '—'}</td>
                  {#if isFlowQuarter}<td class="num" class:neg={add?.negative} title={add?.full}>{add?.text ?? '—'}</td>{/if}
                  <td class="num hide-sm" class:neg={b?.negative} title={b?.full}>{b?.text ?? '—'}</td>
                  <td class="num hide-md" class:neg={c?.negative} title={c?.full}>{c?.text ?? '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
      <p class="muted small">
        단위: {shown[0].currency || 'KRW'} · 출처: <a href={viewerUrl(shown[0].rcept_no ?? '')} target="_blank" rel="noopener">{data.year} {reprtLabel(data.reprt)} 원문</a>
      </p>
    {:else}
      <p class="empty muted">{name} · {data.year} {reprtLabel(data.reprt)} · 재무 데이터가 없습니다. 아직 제출 전이거나 해당 보고서가 없는 기간일 수 있습니다.</p>
    {/if}
    <form method="POST" action="?/refresh" use:enhance={submit}>
      <input type="hidden" name="what" value="financials" />
      <input type="hidden" name="year" value={data.year} />
      <input type="hidden" name="reprt" value={data.reprt} />
      <button class="btn ghost small" disabled={busy}>이 기간 새로 조회</button>
    </form>
  </section>
{:else if data.tab === 'ownership'}
  <div class="foot">
    <Freshness at={data.major.at} error={data.major.error ?? data.exec.error} />
    <form method="POST" action="?/refresh" use:enhance={submit}>
      <input type="hidden" name="what" value="ownership" />
      <button class="btn ghost small" disabled={busy}>새로 고침</button>
    </form>
  </div>

  <section class="card">
    <h2>대량보유 상황보고 <span class="muted sub">5% 보고 · {data.major.total}건</span></h2>
    <ul class="rows">
      {#each data.major.rows as r}
        <li>
          <div class="line"><strong>{r.repror}</strong><span class="muted small">{date(r.rcept_dt)}</span></div>
          <div class="line small">
            <span>보유 <b class="num">{num(r.stkrt)}%</b> <span class="muted">({String(r.stkrt_irds ?? '').startsWith('-') ? '' : '+'}{num(r.stkrt_irds)}%p)</span></span>
            <span class="muted num">{num(r.stkqy)}주</span>
          </div>
          {#if r.report_resn}<p class="muted small resn">{r.report_resn}</p>{/if}
          <a class="small" href={viewerUrl(r.rcept_no ?? '')} target="_blank" rel="noopener">원문</a>
        </li>
      {:else}
        <li class="muted">대량보유 보고가 없습니다.</li>
      {/each}
    </ul>
  </section>

  <section class="card">
    <h2>임원·주요주주 소유보고 <span class="muted sub">{data.exec.total}건{data.exec.total > data.exec.rows.length ? ` 중 최근 ${data.exec.rows.length}건` : ''}</span></h2>
    <ul class="rows">
      {#each data.exec.rows as r}
        <li>
          <div class="line"><strong>{r.repror}</strong><span class="muted small">{date(r.rcept_dt)}</span></div>
          <div class="line small">
            <span class="muted">{[r.isu_exctv_ofcps, r.isu_main_shrholdr].filter((v) => v && v !== '-').join(' · ') || '—'}</span>
            <span class="num">{num(r.sp_stock_lmp_cnt)}주 <span class="muted">({String(r.sp_stock_lmp_irds_cnt ?? '').startsWith('-') ? '' : '+'}{num(r.sp_stock_lmp_irds_cnt)})</span></span>
          </div>
        </li>
      {:else}
        <li class="muted">소유보고가 없습니다.</li>
      {/each}
    </ul>
  </section>
{:else if data.tab === 'events'}
  <section class="card">
    <div class="foot">
      <div>
        <h2>주요사항보고</h2>
        <p class="muted small fresh">
          {#if data.eventsAt}최근 1년 전체 유형 조회: <Freshness at={data.eventsAt} />{:else}전체 유형 조회 기록 없음 · 새 공시가 올라오면 자동으로 해당 유형만 가져옵니다{/if}
        </p>
      </div>
      <form method="POST" action="?/refresh" use:enhance={submit}>
        <input type="hidden" name="what" value="events" />
        <button class="btn small" disabled={busy} aria-describedby="ev-cost">{busy ? '조회 중…' : '36개 유형 조회'}</button>
      </form>
    </div>
    <p id="ev-cost" class="muted small">전체 조회는 OpenDART 요청 36건을 사용합니다.</p>

    <div class="themes" role="group" aria-label="유형 필터">
      <button class="chip" class:on={!theme} onclick={() => (theme = null)}>전체</button>
      {#each data.themes as t}
        <button class="chip" class:on={theme === t} onclick={() => (theme = t)}>{t}</button>
      {/each}
    </div>

    <ol class="timeline">
      {#each shownEvents as e (e.endpoint + e.rcept_no)}
        <li>
          <time class="muted small">{date(e.rcept_no.slice(0, 8))}</time>
          <div>
            <a href={viewerUrl(e.rcept_no)} target="_blank" rel="noopener"><strong>{e.title}</strong></a>
            <span class="chip">{e.theme}</span>
            {#if eventSummary(e.row as Row)}<p class="small muted">{eventSummary(e.row as Row)}</p>{/if}
          </div>
        </li>
      {:else}
        <li class="muted empty">{theme ? `${theme} 유형의 ` : ''}저장된 주요사항보고가 없습니다.</li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .corp-head {
    position: sticky;
    top: 57px;
    z-index: 10;
    background: var(--bg);
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  h1 {
    font-size: 24px;
  }
  .code {
    font-variant-numeric: tabular-nums;
  }
  .eng {
    margin: 0;
    font-size: 13px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin-top: 10px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs a {
    flex: none;
    padding: 8px 14px;
    border-radius: 999px;
    color: var(--muted);
    font-weight: 600;
    background: var(--surface-2);
  }
  .tabs a[aria-current='page'] {
    background: var(--ink);
    color: var(--sun);
  }
  @media (prefers-color-scheme: dark) {
    .tabs a[aria-current='page'] {
      background: var(--sun);
      color: var(--ink);
    }
  }
  .tabs a:hover {
    text-decoration: none;
  }
  .bar {
    height: 4px;
    margin-bottom: 12px;
  }
  h2 {
    font-size: 17px;
    margin-bottom: 8px;
  }
  .sub {
    font-size: 13px;
    font-weight: 500;
  }
  .grid {
    display: grid;
    gap: 12px;
    margin-bottom: 12px;
  }
  @media (min-width: 760px) {
    .grid {
      grid-template-columns: 1fr 1fr;
    }
  }
  section.card {
    margin-bottom: 12px;
  }
  .facts {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: 6px 10px;
    margin: 0;
    font-size: 14px;
  }
  .facts dt {
    color: var(--muted);
  }
  .facts dd {
    margin: 0;
  }
  .foot {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    margin-bottom: 8px;
  }
  .kpis {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .kpi {
    display: flex;
    flex-direction: column;
    background: var(--surface-2);
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 13px;
  }
  .kpi strong {
    font-size: 20px;
    text-align: left;
  }
  .neg {
    color: var(--down);
  }
  .small {
    font-size: 13px;
  }
  .period {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
    margin-bottom: 12px;
  }
  .period label {
    display: flex;
    flex-direction: column;
    min-width: 110px;
  }
  .seg {
    display: flex;
    gap: 4px;
    border: 0;
    padding: 0;
    margin: 0;
    flex-wrap: wrap;
  }
  .seg legend {
    padding: 0;
    margin-bottom: 2px;
  }
  .seg label {
    flex-direction: row;
    min-width: 0;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--surface-2);
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }
  .seg label.on {
    background: var(--btn);
    color: var(--btn-text);
  }
  .seg input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .seg label:focus-within {
    outline: 3px solid var(--tangerine);
  }
  .fs-toggle {
    display: flex;
    gap: 4px;
  }
  .sj {
    font-size: 15px;
    margin: 16px 0 6px;
  }
  .table-wrap {
    overflow-x: auto;
  }
  tbody th {
    font-weight: 500;
    color: var(--text);
    font-size: 14px;
  }
  tr.total th,
  tr.total td {
    font-weight: 700;
  }
  td {
    font-size: 14px;
  }
  @media (max-width: 560px) {
    .hide-sm {
      display: none;
    }
  }
  @media (max-width: 760px) {
    .hide-md {
      display: none;
    }
  }
  .empty {
    padding: 24px 0;
    text-align: center;
  }
  .rows {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .rows li {
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .rows li:last-child {
    border-bottom: 0;
  }
  .line {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .resn {
    margin: 2px 0;
  }
  .themes {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 8px 0 12px;
  }
  .themes .chip {
    border: 0;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 4px 10px;
    color: var(--text);
  }
  .themes .chip.on {
    background: var(--btn);
    color: var(--btn-text);
  }
  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .timeline li {
    display: grid;
    grid-template-columns: 84px 1fr;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .timeline li.empty {
    display: block;
  }
  .timeline p {
    margin: 2px 0 0;
  }
  .fresh {
    margin: 0;
  }
  .fresh :global(.fresh) {
    display: inline;
  }
</style>
