<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { ago, kstDateTime } from '$lib/format';
  import { onMount } from 'svelte';

  let { data, form } = $props();
  let saving = $state(false);
  let copied = $state(false);

  const eventLabel: Record<string, string> = {
    setup: '처음 설정',
    login: '로그인',
    login_failed: '로그인 실패',
    second_factor_failed: '2단계 인증 실패',
    lockout: '잠금',
    logout: '로그아웃',
    password_changed: '비밀번호 변경',
    totp_enabled: '인증 앱 등록',
    totp_disabled: '인증 앱 해제',
    recovery_codes_generated: '복구 코드 발급',
    recovery_code_used: '복구 코드 사용',
    passkey_added: '패스키 추가',
    passkey_removed: '패스키 삭제',
    session_revoked: '세션 종료',
    user_registered: '가입',
    user_disabled: '사용자 비활성화',
    user_enabled: '사용자 활성화',
    role_changed: '권한 변경',
    invite_created: '초대 생성',
    invite_revoked: '초대 취소',
    oauth_client_approved: 'MCP 연결 승인',
    oauth_client_revoked: 'MCP 연결 해제',
    api_key_changed: 'API 키 변경'
  };
  const registrationLabel = { closed: '닫힘', invite: '초대 링크로만', open: '누구나' } as const;

  async function copyInvite(url: string) {
    await navigator.clipboard.writeText(url);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const statusLabel: Record<string, string> = {
    running: '실행 중',
    ok: '완료',
    error: '오류',
    skipped: '건너뜀',
    budget: '한도 도달'
  };

  // Keep the job table live while something is queued or running.
  onMount(() => {
    const t = setInterval(() => {
      if (data.jobs.some((j) => j.queued || j.last?.status === 'running')) invalidateAll();
    }, 5000);
    return () => clearInterval(t);
  });

  const pct = (n: number, of: number) => Math.min(100, Math.round((n / of) * 100));

</script>

<svelte:head><title>관리 · MagicDART</title></svelte:head>

<h1>관리</h1>

<section class="card">
  <h2>OpenDART API 키</h2>
  <p class="state">
    {#if data.key.configured}
      <span class="dot ok" aria-hidden="true"></span> 등록됨 · {kstDateTime(data.key.updatedAt)} 변경
    {:else if data.key.stored}
      <span class="dot bad" aria-hidden="true"></span> 저장되어 있으나 사용할 수 없음
    {:else}
      <span class="dot" aria-hidden="true"></span> 등록되지 않음
    {/if}
  </p>
  {#if data.key.error}<p class="banner" role="alert">{data.key.error} 원래 키를 다시 입력하세요.</p>{/if}
  {#if data.key.stored}
    <p class="muted small">
      {#if data.key.protection === 'host'}
        암호화: APP_SECRET + 이 서버의 하드웨어 ID ({data.key.hostSource}). 데이터베이스를 다른 서버로 옮기면 키를 다시 입력해야 합니다.
      {:else}
        암호화: APP_SECRET만 사용{data.key.binding === 'off' ? ' (API_KEY_HOST_BINDING=off)' : ' (하드웨어 ID를 찾지 못함, README의 HOST_ID_FILE 참고)'}.
      {/if}
    </p>
  {/if}
  <p class="muted small">
    키는 암호화되어 서버에만 저장되며 다시 표시되지 않습니다. 관리자만 교체할 수 있습니다.
  </p>
  <p class="banner info small">
    <strong>실제 보호 장치는 OpenDART의 IP 허용 목록입니다.</strong> 키는 OpenDART에 로그인하면 언제든 다시 확인할 수 있지만, 키를 바꾸려면 고객센터에 문의해야 할 수 있습니다(확인되지 않았고, 불가능할 수도 있습니다). 등록한 IP에서 나가는 모든 트래픽이 이 키를 쓸 수 있으므로, 같은 공인 IP에서 신뢰할 수 없는 서비스를 돌리거나 이 서버를 VPN 출구 노드나 프록시로 쓰지 마세요.
  </p>
  <form
    method="POST"
    action="?/setKey"
    autocomplete="off"
    use:enhance={() => {
      saving = true;
      return async ({ update }) => {
        await update({ reset: true });
        saving = false;
      };
    }}
  >
    <label class="visually-hidden" for="key">새 API 키</label>
    <div class="row">
      <input id="key" name="key" type="password" inputmode="text" placeholder={data.key.configured ? '새 키로 교체 (40자)' : 'API 키 40자'} required minlength="40" maxlength="40" spellcheck="false" autocapitalize="off" />
      <button class="btn" disabled={saving}>{saving ? '확인 중…' : '저장'}</button>
    </div>
  </form>
  {#if form?.keyError}<p class="banner" role="alert">{form.keyError}</p>{/if}
  {#if form?.keySaved}<p class="banner info" role="status">{form.keySaved}</p>{/if}

  <div class="egress">
    <span class="muted small">이 서버의 외부 IP (OpenDART에 등록할 주소)</span>
    {#if data.egressEnabled}
      {#await data.egress}
        <span class="skeleton ip" aria-label="확인 중"></span>
      {:then ip}
        <code>{ip ?? '확인 실패'}</code>
      {/await}
    {:else}
      <span class="muted small">조회 꺼짐 (EGRESS_IP_LOOKUP=off)</span>
    {/if}
  </div>
  {#if form?.keyStatus === '012'}
    <p class="banner">OpenDART가 이 IP를 거부했습니다. opendart.fss.or.kr → 인증키 관리에서 위 IP를 등록하세요.</p>
  {/if}
</section>

<section class="card">
  <h2>오늘 사용량 <span class="muted sub">KST 자정 초기화</span></h2>
  <div class="meter">
    <div class="meter-head"><span>자동 수집</span><span class="num">{data.usage.cron.toLocaleString()} / {data.usage.budget.toLocaleString()}</span></div>
    <div class="track" role="progressbar" aria-valuenow={data.usage.cron} aria-valuemin="0" aria-valuemax={data.usage.budget} aria-label="자동 수집 사용량">
      <div class="fill" style="width:{pct(data.usage.cron, data.usage.budget)}%"></div>
    </div>
  </div>
  <div class="meter">
    <div class="meter-head"><span>전체 (화면 {data.usage.ui} · MCP {data.usage.mcp} 포함)</span><span class="num">{data.usage.total.toLocaleString()} / {data.usage.cap.toLocaleString()}</span></div>
    <div class="track" role="progressbar" aria-valuenow={data.usage.total} aria-valuemin="0" aria-valuemax={data.usage.cap} aria-label="전체 사용량">
      <div class="fill alt" style="width:{pct(data.usage.total, data.usage.cap)}%"></div>
    </div>
  </div>
  <dl class="stats">
    <div><dt>기업</dt><dd class="num">{data.stats.corps.total.toLocaleString()} <span class="muted">(상장 {data.stats.corps.listed.toLocaleString()})</span></dd></div>
    <div><dt>저장된 공시</dt><dd class="num">{data.stats.filings.toLocaleString()}</dd></div>
    <div><dt>상세 대기열</dt><dd class="num">{data.stats.pending.toLocaleString()}</dd></div>
  </dl>
</section>

<section class="card">
  <h2>수집 작업</h2>
  {#if form?.jobMessage}<p class="banner info" role="status">{form.jobMessage}</p>{/if}
  <ul class="jobs">
    {#each data.jobs as j (j.name)}
      <li>
        <div class="job-main">
          <strong>{j.label}</strong>
          <span class="muted small">
            {#if j.last}
              {statusLabel[j.last.status] ?? j.last.status} · {ago(j.last.started_at)} · 요청 {j.last.requests}
            {:else}
              실행 기록 없음
            {/if}
            {#if j.next} · 다음 {kstDateTime(j.next)}{/if}
          </span>
          {#if j.last?.message}<span class="muted small msg">{j.last.message.split('\n').at(-1)}</span>{/if}
        </div>
        <form method="POST" action="?/runJob" use:enhance>
          <input type="hidden" name="job" value={j.name} />
          <button class="btn ghost small" disabled={j.queued || !data.key.configured}>{j.queued ? '대기 중' : '지금 실행'}</button>
        </form>
      </li>
    {/each}
  </ul>
  <details>
    <summary class="small">최근 실행 기록</summary>
    <table class="runs">
      <thead><tr><th>작업</th><th>시작</th><th>상태</th><th class="num">요청</th></tr></thead>
      <tbody>
        {#each data.runs as r}
          <tr title={r.message ?? ''}>
            <td>{data.jobs.find((j) => j.name === r.job)?.label ?? r.job}</td>
            <td class="small">{kstDateTime(r.started_at)}</td>
            <td>{statusLabel[r.status] ?? r.status}</td>
            <td class="num">{r.requests}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>
</section>

<section class="card">
  <h2>사용자 <span class="muted sub">가입: {registrationLabel[data.registration]}</span></h2>
  {#if form?.userError}<p class="banner" role="alert">{form.userError}</p>{/if}
  {#if form?.userMessage}<p class="banner info" role="status">{form.userMessage}</p>{/if}
  <ul class="clients">
    {#each data.users as u (u.id)}
      <li class:revoked={u.disabled_at}>
        <div>
          <strong>{u.username} <span class="chip">{u.role === 'admin' ? '관리자' : '사용자'}</span>{#if u.disabled_at} <span class="chip warn">비활성</span>{/if}</strong>
          <span class="muted small">
            가입 {kstDateTime(u.created_at)} · 최근 {ago(u.last_seen_at)} · 2단계 {u.totp || u.passkeys ? [u.totp ? '인증 앱' : '', u.passkeys ? `패스키 ${u.passkeys}` : ''].filter(Boolean).join(', ') : '없음'}
          </span>
        </div>
        {#if u.id !== data.me}
          <div class="actions">
            <form method="POST" action="?/userState" use:enhance>
              <input type="hidden" name="id" value={u.id} />
              <input type="hidden" name="role" value={u.role === 'admin' ? 'user' : 'admin'} />
              <button class="btn ghost small" name="op" value="role">{u.role === 'admin' ? '사용자로' : '관리자로'}</button>
            </form>
            <form method="POST" action="?/userState" use:enhance>
              <input type="hidden" name="id" value={u.id} />
              <button class="btn ghost small" name="op" value={u.disabled_at ? 'enable' : 'disable'}>{u.disabled_at ? '활성화' : '비활성화'}</button>
            </form>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  <h3>초대</h3>
  {#if data.registration === 'closed'}
    <p class="muted small">REGISTRATION=closed 이므로 새 계정을 만들 수 없습니다.</p>
  {:else}
    <form method="POST" action="?/invite" class="row" use:enhance>
      <input name="note" type="text" maxlength="100" placeholder="메모 (예: 받는 사람)" aria-label="초대 메모" />
      <select name="role" aria-label="권한">
        <option value="user">사용자</option>
        <option value="admin">관리자</option>
      </select>
      <button class="btn ghost">초대 링크 만들기</button>
    </form>
    {#if form?.inviteError}<p class="banner" role="alert">{form.inviteError}</p>{/if}
    {#if form?.inviteUrl}
      <div class="banner info invite">
        <span>7일 동안 한 번 쓸 수 있는 링크입니다. 지금만 표시됩니다.</span>
        <code>{form.inviteUrl}</code>
        <button class="btn ghost small" onclick={() => copyInvite(form.inviteUrl)}>{copied ? '복사됨' : '복사'}</button>
      </div>
    {/if}
    {#if form?.inviteMessage}<p class="banner info" role="status">{form.inviteMessage}</p>{/if}
    <ul class="clients">
      {#each data.invites as i (i.token_hash)}
        <li class:revoked={i.used_at || i.revoked_at || i.expires_at < Date.now()}>
          <div>
            <strong>{i.note ?? '초대'} <span class="chip">{i.role === 'admin' ? '관리자' : '사용자'}</span></strong>
            <span class="muted small">
              {#if i.used_at}{i.used_by_name ?? '?'} 가입 · {kstDateTime(i.used_at)}
              {:else if i.revoked_at}취소됨
              {:else if i.expires_at < Date.now()}만료됨
              {:else}{kstDateTime(i.expires_at)}까지{/if}
            </span>
          </div>
          {#if !i.used_at && !i.revoked_at && i.expires_at >= Date.now()}
            <form method="POST" action="?/inviteRevoke" use:enhance>
              <input type="hidden" name="id" value={i.token_hash} />
              <button class="btn ghost small">취소</button>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="card">
  <h2>MCP 클라이언트 (전체)</h2>
  <p class="muted small">각 클라이언트는 처음 승인한 사용자에게 묶이며, 그 사용자의 권한으로만 동작합니다.</p>
  {#if form?.clientMessage}<p class="banner info" role="status">{form.clientMessage}</p>{/if}
  <ul class="clients">
    {#each data.clients as c (c.client_id)}
      <li class:revoked={c.revoked_at}>
        <div>
          <strong>{c.client_name} <span class="muted small">· {c.username ?? '?'}</span></strong>
          <span class="muted small">
            {#if c.revoked_at}해제됨 · {kstDateTime(c.revoked_at)}
            {:else}승인 {kstDateTime(c.approved_at)} · 마지막 사용 {ago(c.last_used_at)}{/if}
          </span>
          <span class="muted small uri">{c.redirect_uris[0]}</span>
        </div>
        {#if !c.revoked_at}
          <form method="POST" action="?/revoke" use:enhance>
            <input type="hidden" name="client_id" value={c.client_id} />
            <button class="btn ghost small">연결 해제</button>
          </form>
        {/if}
      </li>
    {:else}
      <li class="muted small">연결된 클라이언트가 없습니다.</li>
    {/each}
  </ul>
</section>

<section class="card">
  <h2>보안 기록</h2>
  <table class="runs">
    <thead><tr><th>시각</th><th>사용자</th><th>이벤트</th><th>IP</th></tr></thead>
    <tbody>
      {#each data.audit as a (a.id)}
        <tr title={a.detail ?? ''}>
          <td class="small">{kstDateTime(a.at)}</td>
          <td>{a.username ?? '-'}</td>
          <td>{eventLabel[a.event] ?? a.event}{a.detail ? ` · ${a.detail}` : ''}</td>
          <td class="small">{a.ip ?? ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  h1 {
    margin-bottom: 12px;
  }
  h2 {
    font-size: 17px;
    margin-bottom: 8px;
  }
  .sub {
    font-size: 13px;
    font-weight: 500;
  }
  section {
    margin-bottom: 12px;
  }
  .small {
    font-size: 13px;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 4px;
    font-weight: 600;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--muted);
  }
  .dot.ok {
    background: #2e9e5b;
  }
  .dot.bad {
    background: var(--rust);
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .banner {
    margin: 10px 0 0;
  }
  .egress {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }
  code {
    background: var(--surface-2);
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 14px;
    word-break: break-all;
  }
  .ip {
    display: inline-block;
    width: 120px;
    height: 20px;
  }
  .meter {
    margin-bottom: 12px;
  }
  .meter-head {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    margin-bottom: 4px;
  }
  .track {
    height: 10px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--tangerine);
  }
  .fill.alt {
    background: var(--rust);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    margin: 0;
  }
  .stats div {
    background: var(--surface-2);
    border-radius: 12px;
    padding: 8px 12px;
  }
  .stats dt {
    font-size: 12px;
    color: var(--muted);
  }
  .stats dd {
    margin: 0;
    text-align: left;
    font-weight: 700;
  }
  .jobs,
  .clients {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .jobs li,
  .clients li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .jobs li:last-child,
  .clients li:last-child {
    border-bottom: 0;
  }
  .job-main,
  .clients li > div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .msg,
  .uri {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  details {
    margin-top: 8px;
  }
  .runs td,
  .runs th {
    font-size: 13px;
    padding: 6px;
  }
  .revoked {
    opacity: 0.6;
  }
  h3 {
    font-size: 15px;
    margin: 18px 0 6px;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .row select {
    width: auto;
  }
  .invite {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }
</style>
