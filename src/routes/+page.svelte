<script lang="ts">
  import FilingList from '$lib/components/FilingList.svelte';

  let { data } = $props();

  const link = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/?${s}` : '/';
  };
</script>

<svelte:head><title>최근 공시 · MagicDART</title></svelte:head>

<section class="head">
  <h1>최근 공시</h1>
  <p class="muted">평일 07–20시 15분마다 새 공시를 가져옵니다. 저장된 공시 {data.total.toLocaleString('ko-KR')}건</p>
</section>

<form class="filters" method="GET">
  <label class="visually-hidden" for="fq">보고서명·회사명 검색</label>
  <input id="fq" type="search" name="q" value={data.q ?? ''} placeholder="보고서명·회사명 (예: 유상증자, 자기주식)" />
  {#if !data.listedOnly}<input type="hidden" name="all" value="1" />{/if}
  <button class="btn" type="submit">검색</button>
</form>

<div class="toggle" role="group" aria-label="대상">
  <a href={link({ q: data.q })} aria-current={data.listedOnly ? 'true' : undefined}>상장사</a>
  <a href={link({ q: data.q, all: '1' })} aria-current={!data.listedOnly ? 'true' : undefined}>전체</a>
</div>

<div class="card">
  <FilingList filings={data.filings} today={data.today} />
</div>

{#if data.next}
  <p class="more">
    <a class="btn ghost" href={link({ q: data.q, all: data.listedOnly ? undefined : '1', before: data.next })}>더 보기</a>
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
