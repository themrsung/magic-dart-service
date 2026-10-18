<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCard from '$lib/components/AuthCard.svelte';

  let { data, form } = $props();
</script>

<svelte:head><title>가입 · MagicDART</title></svelte:head>

<AuthCard title="계정 만들기" lead={data.invite ? '초대를 받아 가입합니다.' : undefined}>
  {#if form?.error}<p class="banner" role="alert">{form.error}</p>{/if}
  <form method="POST" class="stack" use:enhance>
    {#if data.invite}<input type="hidden" name="invite" value={data.invite} />{/if}
    <label for="username">아이디</label>
    <input id="username" name="username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required minlength="3" maxlength="32" value={form?.username ?? ''} />
    <p class="hint muted">영문 소문자·숫자·._- 3~32자</p>
    <label for="password">비밀번호</label>
    <input id="password" name="password" type="password" autocomplete="new-password" required minlength={data.minPassword} />
    <p class="hint muted">{data.minPassword}자 이상. 긴 문장도 좋습니다.</p>
    <label for="confirm">비밀번호 확인</label>
    <input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength={data.minPassword} />
    <button class="btn">가입</button>
  </form>
  <p class="muted center">이미 계정이 있나요? <a href="/login">로그인</a></p>
</AuthCard>

<style>
  .center {
    text-align: center;
    font-size: 14px;
    margin: 16px 0 0;
  }
</style>
