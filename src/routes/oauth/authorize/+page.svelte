<script lang="ts">
  import { kstDateTime } from '$lib/format';

  let { data } = $props();
</script>

<svelte:head><title>MCP 연결 승인 · MagicDART</title></svelte:head>

<div class="consent card">
  <svg width="48" height="48" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="#FFC15E" />
    <circle cx="32" cy="32" r="20" fill="#F7934C" />
    <circle cx="32" cy="32" r="10" fill="#CC5803" />
    <circle cx="32" cy="32" r="3.5" fill="#1F1300" />
  </svg>
  <h1>MCP 연결 요청</h1>
  <p class="lead"><strong>{data.clientName}</strong>이(가) MagicDART 데이터에 접근하려고 합니다.</p>

  <ul class="scope">
    <li>기업개황·공시 목록·재무·지분·주요사항 조회 (읽기 전용)</li>
    <li>캐시에 없는 데이터는 OpenDART에서 가져오며, 오늘 요청 한도를 사용합니다</li>
    <li>API 키는 공유되지 않습니다</li>
  </ul>

  <dl class="details">
    <dt>돌아갈 주소</dt>
    <dd><code>{data.redirectUri}</code></dd>
    <dt>클라이언트 등록</dt>
    <dd>{kstDateTime(data.registeredAt)}{data.previouslyApproved ? ' · 이전에 승인한 적 있음' : ''}</dd>
  </dl>
  {#if data.loopback}
    <p class="muted small">이 기기에서 실행 중인 프로그램(예: 터미널의 Claude Code)으로 돌아갑니다.</p>
  {/if}
  <p class="muted small">승인하면 이 클라이언트는 <strong>{data.username}</strong> 계정으로 연결됩니다. 직접 연결을 시작하지 않았다면 거부하세요.</p>

  <form method="POST" class="actions">
    <button class="btn ghost" name="decision" value="deny">거부</button>
    <button class="btn" name="decision" value="approve">승인</button>
  </form>
</div>

<style>
  .consent {
    max-width: 440px;
    margin: 10vh auto 0;
    padding: 28px 24px;
    text-align: center;
  }
  h1 {
    font-size: 22px;
    margin: 12px 0 6px;
  }
  .lead {
    margin: 0 0 16px;
  }
  .scope {
    text-align: left;
    background: var(--surface-2);
    border-radius: 12px;
    padding: 12px 12px 12px 30px;
    margin: 0 0 16px;
    font-size: 14px;
  }
  .details {
    text-align: left;
    font-size: 13px;
    margin: 0 0 8px;
  }
  .details dt {
    color: var(--muted);
  }
  .details dd {
    margin: 0 0 8px;
    word-break: break-all;
  }
  code {
    font-size: 12px;
  }
  .small {
    font-size: 13px;
    margin: 4px 0;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 18px;
  }
</style>
