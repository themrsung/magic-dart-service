<script lang="ts">
  import { MARKET, relDay, rmChips, splitReportName, date } from '$lib/format';
  import { viewerUrl } from '$lib/normalize';

  interface Filing {
    rcept_no: string;
    corp_code: string;
    corp_name: string;
    corp_cls: string | null;
    report_nm: string;
    flr_nm: string | null;
    rcept_dt: string;
    rm: string | null;
  }

  let { filings, today, showCorp = true }: { filings: Filing[]; today: string; showCorp?: boolean } = $props();
</script>

<ul class="list">
  {#each filings as f (f.rcept_no)}
    {@const name = splitReportName(f.report_nm)}
    {@const flags = rmChips(f.rm)}
    {@const withdrawn = flags.some((c) => c.flag === '철')}
    <li class:withdrawn>
      <div class="meta">
        {#if showCorp}
          <a class="corp" href="/corp/{f.corp_code}">{f.corp_name}</a>
          {#if f.corp_cls && MARKET[f.corp_cls]}<span class="chip {MARKET[f.corp_cls].cls}">{MARKET[f.corp_cls].label}</span>{/if}
        {/if}
        <time class="muted" datetime={f.rcept_dt} title={date(f.rcept_dt)}>{relDay(f.rcept_dt, today)}</time>
      </div>
      <a class="title" href={viewerUrl(f.rcept_no)} target="_blank" rel="noopener">{name.title}</a>
      {#if name.chips.length || flags.length || f.flr_nm}
        <div class="chips">
          {#each name.chips as c}<span class="chip warn">{c}</span>{/each}
          {#each flags as c}<span class="chip" class:warn={c.warn} aria-label={c.label}>{c.warn ? '⚠ ' : ''}{c.label}</span>{/each}
          {#if f.flr_nm && f.flr_nm !== f.corp_name}<span class="muted small">제출인 {f.flr_nm}</span>{/if}
        </div>
      {/if}
    </li>
  {:else}
    <li class="empty muted">표시할 공시가 없습니다.</li>
  {/each}
</ul>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    padding: 12px 2px;
    border-bottom: 1px solid var(--border);
  }
  li:last-child {
    border-bottom: 0;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .corp {
    font-weight: 700;
    color: var(--text);
  }
  time {
    margin-left: auto;
    font-size: 13px;
  }
  .title {
    display: block;
    margin-top: 2px;
    color: var(--text);
    font-weight: 500;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
    align-items: center;
  }
  .small {
    font-size: 12px;
  }
  .withdrawn .title {
    text-decoration: line-through;
    color: var(--muted);
  }
  .empty {
    text-align: center;
    padding: 32px 0;
  }
</style>
