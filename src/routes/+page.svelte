<script lang="ts">
  import FilingList from '$lib/components/FilingList.svelte';
  import { intlLocale, translator } from '$lib/i18n';

  let { data } = $props();
  const t = $derived(translator(data.locale));

  const link = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/?${s}` : '/';
  };
</script>

<svelte:head><title>{t('corp.feed.title')} · MagicDART</title></svelte:head>

<section class="head">
  <h1>{t('corp.feed.title')}</h1>
  <p class="muted">{t('corp.feed.lead', { count: data.total.toLocaleString(intlLocale(data.locale)) })}</p>
</section>

<form class="filters" method="GET">
  <label class="visually-hidden" for="fq">{t('corp.feed.searchLabel')}</label>
  <input id="fq" type="search" name="q" value={data.q ?? ''} placeholder={t('corp.feed.searchPlaceholder')} />
  {#if !data.listedOnly}<input type="hidden" name="all" value="1" />{/if}
  <button class="btn" type="submit">{t('corp.feed.search')}</button>
</form>

<div class="toggle" role="group" aria-label={t('corp.feed.scope')}>
  <a href={link({ q: data.q })} aria-current={data.listedOnly ? 'true' : undefined}>{t('corp.feed.listed')}</a>
  <a href={link({ q: data.q, all: '1' })} aria-current={!data.listedOnly ? 'true' : undefined}>{t('corp.feed.all')}</a>
</div>

<div class="card">
  <FilingList filings={data.filings} today={data.today} />
</div>

{#if data.next}
  <p class="more">
    <a class="btn ghost" href={link({ q: data.q, all: data.listedOnly ? undefined : '1', before: data.next })}>{t('corp.feed.more')}</a>
  </p>
{/if}

<style>
  .head {
    margin-bottom: 12px;
  }
  .head p {
    margin: 4px 0 0;
    font-size: 14px;
  }
  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .toggle {
    display: inline-flex;
    background: var(--surface-2);
    border-radius: 12px;
    padding: 3px;
    margin-bottom: 12px;
  }
  .toggle a {
    padding: 6px 14px;
    border-radius: 9px;
    color: var(--muted);
    font-weight: 600;
    font-size: 14px;
  }
  .toggle a[aria-current] {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .toggle a:hover {
    text-decoration: none;
  }
  .more {
    text-align: center;
  }
</style>
