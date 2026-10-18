<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import { translator } from '$lib/i18n';
  import { browserSupportsWebAuthn, passkeyLogin } from '$lib/passkey';
  import { onMount } from 'svelte';

  let { data, form } = $props();
  const t = $derived(translator(page.data.locale));
  let busy = $state(false);
  let passkeyError = $state('');
  let canPasskey = $state(false);

  onMount(() => (canPasskey = browserSupportsWebAuthn()));

  async function withPasskey() {
    passkeyError = '';
    busy = true;
    try {
      const to = await passkeyLogin(false, data.next, t);
      if (to) await goto(to, { invalidateAll: true });
    } catch (err) {
      passkeyError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('auth.login.title')} · MagicDART</title></svelte:head>

<AuthCard title={t('auth.login.title')}>
  {#if data.devBypass}
    <p class="banner info" role="note"><strong>{t('auth.login.devBypassLabel')}</strong> · {t('auth.login.devBypass')}</p>
  {/if}
  {#if form?.error}<p class="banner" role="alert">{form.error}</p>{/if}
  {#if passkeyError}<p class="banner" role="alert">{passkeyError}</p>{/if}

  <form
    method="POST"
    class="stack"
    use:enhance={() => {
      busy = true;
      return async ({ update }) => {
        await update();
        busy = false;
      };
    }}
  >
    <input type="hidden" name="next" value={data.next} />
    <label for="username">{t('auth.field.username')}</label>
    <input id="username" name="username" type="text" autocomplete="username webauthn" autocapitalize="off" spellcheck="false" required value={form?.username ?? ''} />
    <label for="password">{t('auth.field.password')}</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    <button class="btn" disabled={busy}>{t('auth.login.submit')}</button>
  </form>

  {#if canPasskey}
    <p class="or">{t('auth.or')}</p>
    <button class="btn ghost" type="button" onclick={withPasskey} disabled={busy}>{t('auth.login.passkey')}</button>
  {/if}

  {#if data.openRegistration}
    <p class="muted small center">{t('auth.login.noAccount')} <a href="/register">{t('auth.login.registerLink')}</a></p>
  {/if}
</AuthCard>

<style>
  .small {
    font-size: 14px;
  }
  .center {
    text-align: center;
    margin: 16px 0 0;
  }
</style>
