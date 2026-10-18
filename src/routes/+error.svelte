<script lang="ts">
  import { page } from '$app/state';
  import { translator } from '$lib/i18n';

  const t = $derived(translator(page.data.locale));
</script>

<svelte:head><title>{page.status} · MagicDART</title></svelte:head>

<div class="card err">
  <h1>{page.status === 404 ? t('common.error.notFound') : t('common.error.generic')}</h1>
  <p class="muted">{page.error?.message}</p>
  <a class="btn" href="/">{t('common.error.home')}</a>
</div>

<style>
  .err {
    max-width: 420px;
    margin: 10vh auto 0;
    text-align: center;
  }
  h1 {
    font-size: 20px;
  }
</style>
