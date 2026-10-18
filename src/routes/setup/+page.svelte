<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCard from '$lib/components/AuthCard.svelte';

  let { data, form } = $props();
</script>

<svelte:head><title>처음 설정 · MagicDART</title></svelte:head>

<AuthCard title="처음 설정" lead="첫 관리자 계정을 만듭니다. 설정 토큰은 서버 로그에 출력됩니다.">
  {#if form?.error}<p class="banner" role="alert">{form.error}</p>{/if}
  <form method="POST" class="stack" use:enhance>
    <label for="token">설정 토큰</label>
    <input id="token" name="token" type="password" autocomplete="off" spellcheck="false" required />
    <label for="username">관리자 아이디</label>
    <input id="username" name="username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required minlength="3" maxlength="32" value={form?.username ?? ''} />
    <label for="password">비밀번호</label>
    <input id="password" name="password" type="password" autocomplete="new-password" required minlength={data.minPassword} />
    <p class="hint muted">{data.minPassword}자 이상. 긴 문장도 좋습니다.</p>
    <label for="confirm">비밀번호 확인</label>
    <input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength={data.minPassword} />
    <button class="btn">관리자 만들기</button>
  </form>
</AuthCard>
