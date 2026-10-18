<script lang="ts">
  import CorpSearch from '$lib/components/CorpSearch.svelte';
</script>

<svelte:head><title>기업 검색 · MagicDART</title></svelte:head>

<h1>기업 검색</h1>
<p class="muted">회사명(한글·영문)이나 6자리 종목코드로 찾을 수 있습니다.</p>
<CorpSearch autofocus />

<style>
  h1 {
    margin-bottom: 4px;
  }
  p {
    margin: 0 0 12px;
    font-size: 14px;
  }
</style>
