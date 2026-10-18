<script lang="ts">
  import { ago, kstDateTime } from '$lib/format';

  interface ErrorInfo {
    kind: string;
    message: string;
    status?: string;
  }

  let { at, error }: { at: number | null; error?: ErrorInfo | null } = $props();
</script>

<p class="fresh muted">
  {#if at}기준 <time title={kstDateTime(at)}>{ago(at)}</time>{:else}아직 조회된 적 없음{/if}
  {#if error && error.kind !== 'nodata'}
    <span class="err" role="status">· 새로 고침 실패: {error.message}{#if error.kind === 'auth' || error.kind === 'nokey'} (<a href="/admin">관리자 설정</a>){/if}</span>
  {/if}
</p>

<style>
  .fresh {
    font-size: 13px;
    margin: 4px 0 0;
  }
  .err {
    color: var(--warn-text);
  }
</style>
