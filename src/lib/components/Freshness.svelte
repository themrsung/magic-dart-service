<script lang="ts">
  import { page } from '$app/state';
  import { ago, kstDateTime } from '$lib/format';
  import { translator } from '$lib/i18n';

  interface ErrorInfo {
    kind: string;
    message: string;
    status?: string;
  }

  let { at, error }: { at: number | null; error?: ErrorInfo | null } = $props();
  const locale = $derived(page.data.locale);
  const t = $derived(translator(locale));
</script>

<p class="fresh muted">
  {#if at}{t('common.fresh.asOf')} <time title={kstDateTime(at, locale)}>{ago(at, locale)}</time>{:else}{t('common.fresh.never')}{/if}
  {#if error && error.kind !== 'nodata'}
    <span class="err" role="status">· {t('common.fresh.failed', { message: error.message })}{#if error.kind === 'auth' || error.kind === 'nokey'} (<a href="/admin">{t('common.fresh.adminLink')}</a>){/if}</span>
  {/if}
</p>

<style>
  .fresh {
    font-size: 13px;
    margin: 4px 0 0;
  }
  .err {
    color: var(--warn-text);
  }
</style>
