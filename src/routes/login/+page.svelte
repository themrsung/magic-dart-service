<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import { browserSupportsWebAuthn, passkeyLogin } from '$lib/passkey';
  import { onMount } from 'svelte';

  let { data, form } = $props();
  let busy = $state(false);
  let passkeyError = $state('');
  let canPasskey = $state(false);

  onMount(() => (canPasskey = browserSupportsWebAuthn()));

  async function withPasskey() {
    passkeyError = '';
    busy = true;
    try {
      const to = await passkeyLogin(false, data.next);
      if (to) await goto(to, { invalidateAll: true });
    } catch (err) {
      passkeyError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>로그인 · MagicDART</title></svelte:head>

<AuthCard title="로그인">
  {#if data.devBypass}
    <p class="banner info" role="note"><strong>개발 모드</strong> · 모의 OpenDART API에 연결되어 있어 아무 아이디·비밀번호로 관리자 로그인됩니다.</p>
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
    <label for="username">아이디</label>
    <input id="username" name="username" type="text" autocomplete="username webauthn" autocapitalize="off" spellcheck="false" required value={form?.username ?? ''} />
    <label for="password">비밀번호</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required />
    <button class="btn" disabled={busy}>로그인</button>
  </form>

  {#if canPasskey}
    <p class="or">또는</p>
    <button class="btn ghost" type="button" onclick={withPasskey} disabled={busy}>패스키로 로그인</button>
  {/if}

  {#if data.openRegistration}
    <p class="muted small center">계정이 없나요? <a href="/register">가입하기</a></p>
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
