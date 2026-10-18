<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import { browserSupportsWebAuthn, passkeyLogin } from '$lib/passkey';
  import { onMount } from 'svelte';

  let { data, form } = $props();
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
      const to = await passkeyLogin(true, data.next);
      if (to) await goto(to, { invalidateAll: true });
    } catch (err) {
      passkeyError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>2단계 인증 · MagicDART</title></svelte:head>

<AuthCard title="2단계 인증" lead="로그인을 마치려면 등록한 인증 수단으로 확인하세요.">
  {#if form?.error}<p class="banner" role="alert">{form.error}</p>{/if}
  {#if passkeyError}<p class="banner" role="alert">{passkeyError}</p>{/if}

  {#if canPasskey}
    <button class="btn" type="button" onclick={withPasskey} disabled={busy}>패스키로 확인</button>
    {#if data.totp || data.recovery}<p class="or">또는</p>{/if}
  {/if}

  {#if mode === 'totp' && data.totp}
    <form method="POST" action="?/verify" class="stack" use:enhance>
      <input type="hidden" name="next" value={data.next} />
      <input type="hidden" name="kind" value="totp" />
      <label for="code">인증 앱의 6자리 코드</label>
      <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{'{6,7}'}" maxlength="7" required />
      <button class={canPasskey ? 'btn ghost' : 'btn'}>확인</button>
    </form>
  {:else if data.recovery}
    <form method="POST" action="?/verify" class="stack" use:enhance>
      <input type="hidden" name="next" value={data.next} />
      <input type="hidden" name="kind" value="recovery" />
      <label for="code">복구 코드</label>
      <input id="code" name="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX" required />
      <p class="hint muted">복구 코드는 한 번만 쓸 수 있습니다.</p>
      <button class={canPasskey ? 'btn ghost' : 'btn'}>확인</button>
    </form>
  {/if}

  <div class="links">
    {#if data.totp && data.recovery}
      <button type="button" class="link" onclick={() => (mode = mode === 'totp' ? 'recovery' : 'totp')}>
        {mode === 'totp' ? '복구 코드 사용' : '인증 앱 코드 사용'}
      </button>
    {/if}
    <form method="POST" action="?/cancel"><button class="link">다른 계정으로 로그인</button></form>
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
