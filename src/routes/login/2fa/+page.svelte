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
  // svelte-ignore state_referenced_locally
  let mode = $state<'totp' | 'recovery'>(form?.kind === 'recovery' || !data.totp ? 'recovery' : 'totp');
  let busy = $state(false);
  let passkeyError = $state('');
  let canPasskey = $state(false);

  onMount(() => (canPasskey = data.passkeys && browserSupportsWebAuthn()));

  async function withPasskey() {
    passkeyError = '';
    busy = true;
    try {
      const to = await passkeyLogin(true, data.next, t);
      if (to) await goto(to, { invalidateAll: true });
    } catch (err) {
      passkeyError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('auth.twofa.title')} · MagicDART</title></svelte:head>

<AuthCard title={t('auth.twofa.title')} lead={t('auth.twofa.lead')}>
  {#if form?.error}<p class="banner" role="alert">{form.error}</p>{/if}
  {#if passkeyError}<p class="banner" role="alert">{passkeyError}</p>{/if}

  {#if canPasskey}
    <button class="btn" type="button" onclick={withPasskey} disabled={busy}>{t('auth.twofa.passkey')}</button>
    {#if data.totp || data.recovery}<p class="or">{t('auth.or')}</p>{/if}
  {/if}

  {#if mode === 'totp' && data.totp}
    <form method="POST" action="?/verify" class="stack" use:enhance>
      <input type="hidden" name="next" value={data.next} />
      <input type="hidden" name="kind" value="totp" />
      <label for="code">{t('auth.twofa.codeLabel')}</label>
      <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{'{6,7}'}" maxlength="7" required />
      <button class={canPasskey ? 'btn ghost' : 'btn'}>{t('auth.twofa.verify')}</button>
    </form>
  {:else if data.recovery}
    <form method="POST" action="?/verify" class="stack" use:enhance>
      <input type="hidden" name="next" value={data.next} />
      <input type="hidden" name="kind" value="recovery" />
      <label for="code">{t('auth.twofa.recoveryLabel')}</label>
      <input id="code" name="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX" required />
      <p class="hint muted">{t('auth.twofa.recoveryHint')}</p>
      <button class={canPasskey ? 'btn ghost' : 'btn'}>{t('auth.twofa.verify')}</button>
    </form>
  {/if}

  <div class="links">
    {#if data.totp && data.recovery}
      <button type="button" class="link" onclick={() => (mode = mode === 'totp' ? 'recovery' : 'totp')}>
        {mode === 'totp' ? t('auth.twofa.useRecovery') : t('auth.twofa.useTotp')}
      </button>
    {/if}
    <form method="POST" action="?/cancel"><button class="link">{t('auth.twofa.otherAccount')}</button></form>
  </div>
</AuthCard>

<style>
  .links {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent-text);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
</style>
