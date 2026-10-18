<script lang="ts">
  import CorpSearch from '$lib/components/CorpSearch.svelte';
  import { translator } from '$lib/i18n';

  let { data } = $props();
  const t = $derived(translator(data.locale));
</script>

<svelte:head><title>{t('corp.search.title')} · MagicDART</title></svelte:head>

<h1>{t('corp.search.title')}</h1>
<p class="muted">{t('corp.search.lead')}</p>
<CorpSearch autofocus />

<style>
  h1 {
    margin-bottom: 4px;
  }
  p {
    margin: 0 0 12px;
    font-size: 14px;
  }
</style>
