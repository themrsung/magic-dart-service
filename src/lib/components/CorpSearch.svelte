<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { MARKET } from '$lib/format';
  import { translator } from '$lib/i18n';
  import { marketLabel } from '$lib/i18n/dart-terms';

  interface Hit {
    corp_code: string;
    corp_name: string;
    stock_code: string;
    corp_cls: string | null;
  }

  let { autofocus = false, initial = '' }: { autofocus?: boolean; initial?: string } = $props();
  // svelte-ignore state_referenced_locally
  let q = $state(initial);
  let hits = $state<Hit[]>([]);
  let active = $state(-1);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listId = 'corp-search-list';
  const locale = $derived(page.data.locale);
  const t = $derived(translator(locale));

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const term = q.trim();
      if (!term) {
        hits = [];
        return;
      }
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      hits = res.ok ? await res.json() : [];
      active = -1;
    }, 150);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      active = Math.min(active + 1, hits.length - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      active = Math.max(active - 1, 0);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const pick = hits[active] ?? hits[0];
      if (pick) goto(`/corp/${pick.corp_code}`);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      hits = [];
    }
  }
</script>

<div class="search">
  <label class="visually-hidden" for="corp-q">{t('corp.search.title')}</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    id="corp-q"
    type="search"
    placeholder={t('corp.search.placeholder')}
    autocomplete="off"
    role="combobox"
    aria-expanded={hits.length > 0}
    aria-controls={listId}
    aria-activedescendant={active >= 0 ? `hit-${active}` : undefined}
    bind:value={q}
    oninput={onInput}
    onkeydown={onKey}
    {autofocus}
  />
  {#if hits.length}
    <ul id={listId} role="listbox" class="hits card">
      {#each hits as h, i (h.corp_code)}
        <li id="hit-{i}" role="option" aria-selected={i === active}>
          <a href="/corp/{h.corp_code}" class:active={i === active}>
            <span class="name">{h.corp_name}</span>
            {#if h.corp_cls && MARKET[h.corp_cls]}<span class="chip {MARKET[h.corp_cls].cls}">{marketLabel(h.corp_cls, locale)}</span>{/if}
            {#if h.stock_code}<span class="muted code">{h.stock_code}</span>{:else}<span class="muted code">{t('corp.search.unlisted')}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search {
    position: relative;
  }
  .hits {
    position: absolute;
    z-index: 15;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    list-style: none;
    margin: 0;
    padding: 6px;
    max-height: 60vh;
    overflow: auto;
  }
  .hits a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: 10px;
    color: var(--text);
  }
  .hits a:hover,
  .hits a.active {
    background: var(--surface-2);
    text-decoration: none;
  }
  .name {
    font-weight: 600;
  }
  .code {
    margin-left: auto;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
</style>
