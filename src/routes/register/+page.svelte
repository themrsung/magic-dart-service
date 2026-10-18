<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import { translator } from '$lib/i18n';

  let { data, form } = $props();
  const t = $derived(translator(page.data.locale));
</script>

<svelte:head><title>{t('auth.register.titleShort')} · MagicDART</title></svelte:head>

<AuthCard title={t('auth.register.title')} lead={data.invite ? t('auth.register.leadInvite') : undefined}>
  {#if form?.error}<p class="banner" role="alert">{form.error}</p>{/if}
  <form method="POST" class="stack" use:enhance>
    {#if data.invite}<input type="hidden" name="invite" value={data.invite} />{/if}
    <label for="username">{t('auth.field.username')}</label>
    <input id="username" name="username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required minlength="3" maxlength="32" value={form?.username ?? ''} />
    <p class="hint muted">{t('auth.register.usernameHint')}</p>
    <label for="password">{t('auth.field.password')}</label>
    <input id="password" name="password" type="password" autocomplete="new-password" required minlength={data.minPassword} />
    <p class="hint muted">{t('auth.password.hint', { min: data.minPassword })}</p>
    <label for="confirm">{t('auth.field.confirm')}</label>
    <input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength={data.minPassword} />
    <button class="btn">{t('auth.register.submit')}</button>
  </form>
  <p class="muted center">{t('auth.register.haveAccount')} <a href="/login">{t('auth.register.loginLink')}</a></p>
</AuthCard>

<style>
  .center {
    text-align: center;
    font-size: 14px;
    margin: 16px 0 0;
  }
</style>
