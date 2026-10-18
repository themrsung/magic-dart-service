<script lang="ts">
  import { enhance } from '$app/forms';
  import { navigating, page } from '$app/state';
  import FilingList from '$lib/components/FilingList.svelte';
  import Freshness from '$lib/components/Freshness.svelte';
  import { date, krwShort, MARKET, num, REPORTS } from '$lib/format';
  import { translator } from '$lib/i18n';
  import { accountName, eventTitle, marketLabel, periodName, personTerm, reportCodeLabel, statementName, themeLabel } from '$lib/i18n/dart-terms';
  import { viewerUrl } from '$lib/normalize';

  let { data, form } = $props();
  const locale = $derived(data.locale);
  const t = $derived(translator(locale));

  type Row = Record<string, string | undefined>;

  const tabs = $derived([
    { id: 'overview', label: t('corp.tab.overview') },
    { id: 'filings', label: t('corp.tab.filings') },
    { id: 'financials', label: t('corp.tab.financials') },
    { id: 'ownership', label: t('corp.tab.ownership') },
    { id: 'events', label: t('corp.tab.events') }
  ]);

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
  const reprtLabel = (c: string) => reportCodeLabel(c, locale);
  const basisLabel = (b: string) => (b === 'CFS' ? t('corp.fin.consolidated') : t('corp.fin.separate'));
  const monthName = (m: number) => new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, m - 1, 1));
  const krw = (raw: string | undefined, unit = '원') => krwShort(raw, unit, locale);

  function headlineOf(rows: Row[] | undefined) {
    if (!rows?.length) return [];
    const basis = rows.some((r) => r.fs_div === 'CFS') ? 'CFS' : 'OFS';
    const pick = (...names: string[]) => rows.find((r) => r.fs_div === basis && names.some((n) => r.account_nm?.replace(/\s/g, '').startsWith(n)));
    return [
      { label: accountName('매출액', locale), row: pick('매출액', '수익(매출액)', '영업수익') },
      { label: accountName('영업이익', locale), row: pick('영업이익') },
      { label: accountName('당기순이익', locale), row: pick('당기순이익') },
      { label: accountName('자산총계', locale), row: pick('자산총계') }
    ]
      .filter((k) => k.row)
      .map((k) => ({ ...k, basis: basisLabel(basis) }));
  }

  // ── events ──
  let theme = $state<string | null>(null);
  const shownEvents = $derived(data.tab === 'events' ? data.events.filter((e) => !theme || e.theme === theme) : []);
  const eventSummary = (row: Row) =>
    [
      row.nstk_ostk_cnt && t('corp.ev.newShares', { count: num(row.nstk_ostk_cnt, locale) }),
      row.aqpln_stk_ostk && t('corp.ev.planAcquire', { count: num(row.aqpln_stk_ostk, locale) }),
      row.dppln_stk_ostk && t('corp.ev.planDispose', { count: num(row.dppln_stk_ostk, locale) }),
      row.bd_fta && t('corp.ev.bonds', { amount: krw(row.bd_fta)?.text ?? row.bd_fta }),
      row.fdpp_fclt && t('corp.ev.facilityFunds', { amount: krw(row.fdpp_fclt)?.text }),
      row.fdpp_op && t('corp.ev.workingCapital', { amount: krw(row.fdpp_op)?.text }),
      row.mg_mth && t('corp.ev.mergerMethod', { value: row.mg_mth }),
      row.dv_mth && t('corp.ev.splitMethod', { value: row.dv_mth }),
      row.icnm && t('corp.ev.case', { value: row.icnm })
    ]
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ');
</script>

<svelte:head><title>{name} · MagicDART</title></svelte:head>

<header class="corp-head">
  <div class="title-row">
    <h1>{name}</h1>
    {#if cls && MARKET[cls]}<span class="chip {MARKET[cls].cls}">{marketLabel(cls, locale)}</span>{/if}
    {#if stock}<span class="muted code">{stock}</span>{/if}
  </div>
  {#if data.company?.corp_name_eng}<p class="eng muted">{data.company.corp_name_eng}</p>{/if}
  <nav class="tabs" aria-label={t('corp.tab.nav')}>
    {#each tabs as tab}
      <a href="?tab={tab.id}" aria-current={data.tab === tab.id ? 'page' : undefined} data-sveltekit-noscroll>{tab.label}</a>
    {/each}
  </nav>
</header>

{#if form?.message}<p class="banner info" role="status">{form.message}</p>{/if}
{#if navigating.to}<div class="skeleton bar" aria-hidden="true"></div>{/if}

{#if data.tab === 'overview'}
  <section class="grid">
    <div class="card">
      <h2>{t('corp.profile.title')}</h2>
      {#if data.company}
        <dl class="facts">
          <dt>{t('corp.profile.ceo')}</dt><dd>{data.company.ceo_nm || '—'}</dd>
          <dt>{t('corp.profile.founded')}</dt><dd>{date(data.company.est_dt, locale)}</dd>
          <dt>{t('corp.profile.fiscalYearEnd')}</dt><dd>{data.company.acc_mt ? t('corp.profile.fiscalMonth', { month: Number(data.company.acc_mt), monthName: monthName(Number(data.company.acc_mt)) }) : '—'}</dd>
          <dt>{t('corp.profile.industry')}</dt><dd>{data.company.induty_code || '—'}</dd>
          <dt>{t('corp.profile.address')}</dt><dd>{data.company.adres || '—'}</dd>
          <dt>{t('corp.profile.website')}</dt>
          <dd>
            {#if data.company.hm_url}<a href={data.company.hm_url.startsWith('http') ? data.company.hm_url : `http://${data.company.hm_url}`} target="_blank" rel="noopener">{data.company.hm_url}</a>{:else}—{/if}
          </dd>
          <dt>{t('corp.profile.phone')}</dt><dd>{data.company.phn_no || '—'}</dd>
        </dl>
      {:else}
        <p class="muted">{t('corp.profile.none')}</p>
      {/if}
      <div class="foot">
        <Freshness at={data.companyAt} error={data.companyError} />
        <form method="POST" action="?/refresh" use:enhance={submit}>
          <input type="hidden" name="what" value="company" />
          <button class="btn ghost small" disabled={busy}>{t('corp.refresh')}</button>
        </form>
      </div>
    </div>

    <div class="card">
      <h2>{t('corp.kpi.title')} {#if data.headline}<span class="muted sub">{t('corp.kpi.period', { year: data.headline.bsns_year })}</span>{/if}</h2>
      {#if headlineOf(data.headline?.rows as Row[]).length}
        <div class="kpis">
          {#each headlineOf(data.headline?.rows as Row[]) as k}
            {@const cur = krw(k.row?.thstrm_amount)}
            {@const prev = krw(k.row?.frmtrm_amount)}
            <div class="kpi">
              <span class="muted">{k.label}</span>
              <strong class="num" class:neg={cur?.negative} title={cur?.full} aria-label={cur?.full}>{cur?.text ?? '—'}</strong>
              {#if prev}<span class="muted small num">{t('corp.kpi.prior', { amount: prev.text })}</span>{/if}
            </div>
          {/each}
        </div>
        <p class="muted small">{t('corp.kpi.basis', { basis: headlineOf(data.headline?.rows as Row[])[0].basis })} · <a href="?tab=financials">{t('corp.kpi.details')}</a></p>
      {:else}
        <p class="muted">{data.headlineError?.message ?? t('corp.kpi.none')}</p>
      {/if}
    </div>
  </section>

  <section class="card">
    <h2>{t('corp.recent.title')}</h2>
    <FilingList filings={data.filings} today={data.today} showCorp={false} />
    <p><a href="?tab=filings">{t('corp.recent.all')}</a></p>
  </section>
{:else if data.tab === 'filings'}
  <section class="card">
    <div class="foot">
      <Freshness at={data.filingsAt} error={data.filingsError} />
      <form method="POST" action="?/refresh" use:enhance={submit}>
        <input type="hidden" name="what" value="filings" />
        <button class="btn ghost small" disabled={busy}>{t('corp.refresh')}</button>
      </form>
    </div>
    <FilingList filings={data.filings} today={data.today} showCorp={false} />
    <p class="muted small">{t('corp.filings.note')}</p>
  </section>
{:else if data.tab === 'financials'}
  <form class="period card" method="GET">
    <input type="hidden" name="tab" value="financials" />
    <label>
      <span class="muted small">{t('corp.fin.year')}</span>
      <select name="year" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
        {#each Array.from({ length: data.maxYear - 2014 }, (_, i) => data.maxYear - i) as y}
          <option value={y} selected={y === data.year}>{y}</option>
        {/each}
      </select>
    </label>
    <fieldset class="seg">
      <legend class="muted small">{t('corp.fin.report')}</legend>
      {#each REPORTS as r}
        <label class:on={r.code === data.reprt}>
          <input type="radio" name="reprt" value={r.code} checked={r.code === data.reprt} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
          {reportCodeLabel(r.code, locale)}
        </label>
      {/each}
    </fieldset>
    <noscript><button class="btn small">{t('corp.fin.show')}</button></noscript>
  </form>

  <section class="card">
    <div class="foot">
      <div>
        <h2>{t('corp.fin.heading', { year: data.year, report: reprtLabel(data.reprt), basis: basisLabel(fs) })}</h2>
        <Freshness at={data.finAt} error={data.finError} />
      </div>
      <div class="fs-toggle" role="group" aria-label={t('corp.fin.basisGroup')}>
        <button class="btn small" class:ghost={fs !== 'CFS'} disabled={!hasCfs} onclick={() => (fsChoice = 'CFS')}>{t('corp.fin.consolidated')}</button>
        <button class="btn small" class:ghost={fs !== 'OFS'} onclick={() => (fsChoice = 'OFS')}>{t('corp.fin.separate')}</button>
      </div>
    </div>
    {#if !hasCfs && finRows.length}<p class="muted small">{t('corp.fin.noConsolidated')}</p>{/if}

    {#if shown.length}
      {#each sections as [title, rows]}
        {@const isFlowQuarter = data.reprt !== '11011' && rows.some((r) => r.thstrm_add_amount)}
        {@const cur = rows[0].thstrm_nm ? periodName(rows[0].thstrm_nm, locale) : t('corp.fin.current')}
        <h3 class="sj" title={locale === 'en' ? title : undefined}>{statementName(title, locale)}</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('corp.fin.account')}</th>
                <th scope="col" class="num">{isFlowQuarter ? t('corp.fin.threeMonths', { period: cur }) : cur}</th>
                {#if isFlowQuarter}<th scope="col" class="num">{t('corp.fin.cumulative')}</th>{/if}
                <th scope="col" class="num hide-sm">{rows[0].frmtrm_nm ? periodName(rows[0].frmtrm_nm, locale) : t('corp.fin.prior')}</th>
                <th scope="col" class="num hide-md">{rows[0].bfefrmtrm_nm ? periodName(rows[0].bfefrmtrm_nm, locale) : t('corp.fin.priorPrior')}</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as r}
                {@const a = krw(r.thstrm_amount, '')}
                {@const add = krw(r.thstrm_add_amount, '')}
                {@const b = krw(r.frmtrm_amount, '')}
                {@const c = krw(r.bfefrmtrm_amount, '')}
                <tr class:total={/총계|합계/.test(r.account_nm ?? '')}>
                  <th scope="row" title={locale === 'en' ? r.account_nm : undefined}>{accountName(r.account_nm, locale)}</th>
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
        {t('corp.fin.source', { currency: shown[0].currency || 'KRW' })} <a href={viewerUrl(shown[0].rcept_no ?? '')} target="_blank" rel="noopener">{t('corp.fin.sourceLink', { year: data.year, report: reprtLabel(data.reprt) })}</a>
      </p>
    {:else}
      <p class="empty muted">{t('corp.fin.empty', { name, year: data.year, report: reprtLabel(data.reprt) })}</p>
    {/if}
    <form method="POST" action="?/refresh" use:enhance={submit}>
      <input type="hidden" name="what" value="financials" />
      <input type="hidden" name="year" value={data.year} />
      <input type="hidden" name="reprt" value={data.reprt} />
      <button class="btn ghost small" disabled={busy}>{t('corp.fin.refetch')}</button>
    </form>
  </section>
{:else if data.tab === 'ownership'}
  <div class="foot">
    <Freshness at={data.major.at} error={data.major.error ?? data.exec.error} />
    <form method="POST" action="?/refresh" use:enhance={submit}>
      <input type="hidden" name="what" value="ownership" />
      <button class="btn ghost small" disabled={busy}>{t('corp.refresh')}</button>
    </form>
  </div>

  <section class="card">
    <h2>{t('corp.own.major')} <span class="muted sub">{t('corp.own.majorSub', { count: data.major.total })}</span></h2>
    <ul class="rows">
      {#each data.major.rows as r}
        <li>
          <div class="line"><strong>{r.repror}</strong><span class="muted small">{date(r.rcept_dt, locale)}</span></div>
          <div class="line small">
            <span>{t('corp.own.holding')} <b class="num">{num(r.stkrt, locale)}%</b> <span class="muted">({t('corp.own.pctChange', { sign: String(r.stkrt_irds ?? '').startsWith('-') ? '' : '+', change: num(r.stkrt_irds, locale) })})</span></span>
            <span class="muted num">{t('corp.own.shares', { count: num(r.stkqy, locale) })}</span>
          </div>
          {#if r.report_resn}<p class="muted small resn">{r.report_resn}</p>{/if}
          <a class="small" href={viewerUrl(r.rcept_no ?? '')} target="_blank" rel="noopener">{t('corp.original')}</a>
        </li>
      {:else}
        <li class="muted">{t('corp.own.majorNone')}</li>
      {/each}
    </ul>
  </section>

  <section class="card">
    <h2>{t('corp.own.exec')} <span class="muted sub">{data.exec.total > data.exec.rows.length ? t('corp.own.execLatest', { total: data.exec.total, count: data.exec.rows.length }) : t('corp.own.execCount', { count: data.exec.total })}</span></h2>
    <ul class="rows">
      {#each data.exec.rows as r}
        <li>
          <div class="line"><strong>{r.repror}</strong><span class="muted small">{date(r.rcept_dt, locale)}</span></div>
          <div class="line small">
            <span class="muted">{[r.isu_exctv_ofcps, r.isu_main_shrholdr].filter((v) => v && v !== '-').map((v) => personTerm(v as string, locale)).join(' · ') || '—'}</span>
            <span class="num">{t('corp.own.shares', { count: num(r.sp_stock_lmp_cnt, locale) })} <span class="muted">({String(r.sp_stock_lmp_irds_cnt ?? '').startsWith('-') ? '' : '+'}{num(r.sp_stock_lmp_irds_cnt, locale)})</span></span>
          </div>
        </li>
      {:else}
        <li class="muted">{t('corp.own.execNone')}</li>
      {/each}
    </ul>
  </section>
{:else if data.tab === 'events'}
  <section class="card">
    <div class="foot">
      <div>
        <h2>{t('corp.ev.title')}</h2>
        <p class="muted small fresh">
          {#if data.eventsAt}{t('corp.ev.swept')} <Freshness at={data.eventsAt} />{:else}{t('corp.ev.notSwept')}{/if}
        </p>
      </div>
      <form method="POST" action="?/refresh" use:enhance={submit}>
        <input type="hidden" name="what" value="events" />
        <button class="btn small" disabled={busy} aria-describedby="ev-cost">{busy ? t('corp.ev.checking') : t('corp.ev.checkAll')}</button>
      </form>
    </div>
    <p id="ev-cost" class="muted small">{t('corp.ev.cost')}</p>

    <div class="themes" role="group" aria-label={t('corp.ev.filter')}>
      <button class="chip" class:on={!theme} onclick={() => (theme = null)}>{t('corp.ev.all')}</button>
      {#each data.themes as th}
        <button class="chip" class:on={theme === th} onclick={() => (theme = th)}>{themeLabel(th, locale)}</button>
      {/each}
    </div>

    <ol class="timeline">
      {#each shownEvents as e (e.endpoint + e.rcept_no)}
        <li>
          <time class="muted small">{date(e.rcept_no.slice(0, 8), locale)}</time>
          <div>
            <a href={viewerUrl(e.rcept_no)} target="_blank" rel="noopener" title={locale === 'en' ? e.title : undefined}><strong>{eventTitle(e.endpoint, e.title, locale)}</strong></a>
            <span class="chip">{themeLabel(e.theme, locale)}</span>
            {#if eventSummary(e.row as Row)}<p class="small muted">{eventSummary(e.row as Row)}</p>{/if}
          </div>
        </li>
      {:else}
        <li class="muted empty">{theme ? t('corp.ev.emptyTheme', { theme: themeLabel(theme, locale) }) : t('corp.ev.empty')}</li>
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
