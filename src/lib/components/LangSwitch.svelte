<script lang="ts">
  import { page } from '$app/state';
  import { translator } from '$lib/i18n';

  const t = $derived(translator(page.data.locale));
  const other = $derived(page.data.locale === 'en' ? 'ko' : 'en');
</script>

<form method="POST" action="/lang" class="lang">
  <input type="hidden" name="lang" value={other} />
  <input type="hidden" name="next" value={page.url.pathname + page.url.search} />
  <button class="btn ghost small" lang={other} aria-label={t('common.lang.switch')}>{other === 'en' ? 'English' : '한국어'}</button>
</form>

<style>
  .lang {
    margin: 0;
  }
</style>
