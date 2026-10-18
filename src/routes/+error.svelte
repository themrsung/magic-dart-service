<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · MagicDART</title></svelte:head>

<div class="card err">
  <h1>{page.status === 404 ? '찾을 수 없습니다' : '문제가 발생했습니다'}</h1>
  <p class="muted">{page.error?.message}</p>
  <a class="btn" href="/">처음으로</a>
</div>

<style>
  .err {
    max-width: 420px;
    margin: 10vh auto 0;
    text-align: center;
  }
  h1 {
    font-size: 20px;
  }
</style>
