<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import { translator } from '$lib/i18n';

  let { data, form } = $props();
  const t = $derived(translator(page.data.locale));
</script>

<svelte:head><title>{t('auth.setup.title')} · MagicDART</title></svelte:head>

<AuthCard title={t('auth.setup.title')} lead={t('auth.setup.lead')}>
  {#if form?.error}<p class="banner" role="alert">{form.error}</p>{/if}
  <form method="POST" class="stack" use:enhance>
    <label for="token">{t('auth.setup.token')}</label>
    <input id="token" name="token" type="password" autocomplete="off" spellcheck="false" required />
    <label for="username">{t('auth.setup.username')}</label>
    <input id="username" name="username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required minlength="3" maxlength="32" value={form?.username ?? ''} />
    <label for="password">{t('auth.field.password')}</label>
    <input id="password" name="password" type="password" autocomplete="new-password" required minlength={data.minPassword} />
    <p class="hint muted">{t('auth.password.hint', { min: data.minPassword })}</p>
    <label for="confirm">{t('auth.field.confirm')}</label>
    <input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength={data.minPassword} />
    <button class="btn">{t('auth.setup.submit')}</button>
  </form>
</AuthCard>
