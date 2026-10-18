<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { ago, kstDateTime } from '$lib/format';
  import { browserSupportsWebAuthn, passkeyRegister } from '$lib/passkey';
  import { onMount } from 'svelte';

  let { data, form } = $props();
  let canPasskey = $state(false);
  let passkeyName = $state('');
  let passkeyBusy = $state(false);
  let passkeyError = $state('');
  let issuedCodes = $state<string[] | null>(null);
  let copied = $state(false);

  onMount(() => (canPasskey = browserSupportsWebAuthn()));

  const codes = $derived(form?.recoveryCodes ?? issuedCodes);
  const msg = (section: string) => (form?.section === section ? form : null);

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
    oauth_client_approved: 'MCP 연결 승인',
    oauth_client_revoked: 'MCP 연결 해제'
  };
  const methodLabel: Record<string, string> = {
    password: '비밀번호',
    'password+totp': '비밀번호 + 인증 앱',
    'password+passkey': '비밀번호 + 패스키',
    'password+recovery': '비밀번호 + 복구 코드',
    passkey: '패스키',
    setup: '처음 설정',
    register: '가입'
  };

  function device(ua: string | null): string {
    if (!ua) return '알 수 없는 기기';
    const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return [br, os].filter(Boolean).join(' · ') || ua.slice(0, 40);
  }

  async function addPasskey() {
    passkeyError = '';
    passkeyBusy = true;
    try {
      const r = await passkeyRegister(passkeyName);
      if (r) {
        passkeyName = '';
        if (r.recoveryCodes) issuedCodes = r.recoveryCodes;
        await invalidateAll();
      }
    } catch (err) {
      passkeyError = err instanceof Error ? err.message : String(err);
    } finally {
      passkeyBusy = false;
    }
  }

  async function copyMcp() {
    await navigator.clipboard.writeText(`claude mcp add --transport http dart ${data.mcpUrl}`);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  /** Offline copies of pages belong to this account; drop them on sign-out. */
  async function clearOfflineCopies() {
    try {
      for (const k of await caches.keys()) if (k.startsWith('pages-')) await caches.delete(k);
    } catch {
      // caches unavailable (private mode, http)
    }
  }
</script>

<svelte:head><title>계정 · MagicDART</title></svelte:head>

<div class="head">
  <h1>계정</h1>
  <form method="POST" action="/logout" onsubmit={clearOfflineCopies}>
    <button class="btn ghost small">로그아웃</button>
  </form>
</div>
<p class="muted who">{data.username} · {data.role === 'admin' ? '관리자' : '사용자'}</p>

{#if data.welcome}
  <p class="banner info">계정을 만들었습니다. 아래에서 인증 앱이나 패스키를 등록해 2단계 인증을 켜 두세요.</p>
{/if}
{#if data.recovered}
  <p class="banner">복구 코드로 로그인했습니다. 남은 복구 코드: {data.recoveryLeft}개. 필요하면 새로 발급하세요.</p>
{/if}

{#if codes}
  <section class="card codes" aria-live="polite">
    <h2>복구 코드</h2>
    <p class="small">인증 앱이나 패스키를 쓸 수 없을 때 한 번씩 사용할 수 있습니다. <strong>지금만 표시됩니다.</strong> 안전한 곳에 보관하세요.</p>
    <ol>
      {#each codes as c}<li><code>{c}</code></li>{/each}
    </ol>
  </section>
{/if}

<section class="card">
  <h2>2단계 인증</h2>

  <h3>인증 앱 (TOTP)</h3>
  {#if msg('totp')?.error}<p class="banner" role="alert">{msg('totp')?.error}</p>{/if}
  {#if msg('totp')?.message}<p class="banner info" role="status">{msg('totp')?.message}</p>{/if}
  {#if data.totp.enabled}
    <p class="state"><span class="dot ok" aria-hidden="true"></span> 사용 중</p>
    <details>
      <summary class="small">해제</summary>
      <form method="POST" action="?/totpDisable" class="row" use:enhance>
        <input name="current" type="password" autocomplete="current-password" placeholder="현재 비밀번호" required aria-label="현재 비밀번호" />
        <button class="btn ghost">해제</button>
      </form>
    </details>
  {:else if data.totp.pending}
    <p class="small">Google Authenticator, 1Password 같은 인증 앱으로 QR 코드를 스캔하고, 앱에 표시된 6자리 코드를 입력하세요.</p>
    <div class="enroll">
      <img src={data.totp.pending.qr} alt="TOTP 등록 QR 코드" width="180" height="180" />
      <div>
        <p class="small muted">스캔할 수 없으면 직접 입력:</p>
        <code class="secret">{data.totp.pending.secret}</code>
      </div>
    </div>
    <form method="POST" action="?/totpConfirm" class="row" use:enhance>
      <input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="6자리 코드" required aria-label="인증 코드" />
      <button class="btn">확인</button>
    </form>
    <form method="POST" action="?/totpCancel" use:enhance><button class="btn ghost small cancel">취소</button></form>
  {:else}
    <p class="state"><span class="dot" aria-hidden="true"></span> 사용 안 함</p>
    <form method="POST" action="?/totpBegin" use:enhance><button class="btn ghost">인증 앱 등록</button></form>
  {/if}

  <h3>패스키</h3>
  <p class="small muted">기기의 지문·얼굴 인식이나 보안 키로 로그인합니다. 패스키만으로도 로그인할 수 있습니다.</p>
  {#if msg('passkeys')?.error}<p class="banner" role="alert">{msg('passkeys')?.error}</p>{/if}
  {#if msg('passkeys')?.message}<p class="banner info" role="status">{msg('passkeys')?.message}</p>{/if}
  {#if passkeyError}<p class="banner" role="alert">{passkeyError}</p>{/if}
  <ul class="list">
    {#each data.passkeys as p (p.id)}
      <li>
        <div class="main">
          <strong>{p.name}</strong>
          <span class="muted small">등록 {kstDateTime(p.created_at)} · 마지막 사용 {ago(p.last_used_at)}{p.backed_up ? ' · 동기화됨' : ''}</span>
        </div>
        <details>
          <summary class="small">관리</summary>
          <form method="POST" action="?/passkeyRename" class="row" use:enhance>
            <input type="hidden" name="id" value={p.id} />
            <input name="name" type="text" maxlength="60" value={p.name} aria-label="패스키 이름" required />
            <button class="btn ghost small">이름 변경</button>
          </form>
          <form method="POST" action="?/passkeyRemove" class="row" use:enhance>
            <input type="hidden" name="id" value={p.id} />
            <input name="current" type="password" autocomplete="current-password" placeholder="현재 비밀번호" required aria-label="현재 비밀번호" />
            <button class="btn ghost small">삭제</button>
          </form>
        </details>
      </li>
    {:else}
      <li class="muted small">등록된 패스키가 없습니다.</li>
    {/each}
  </ul>
  {#if canPasskey}
    <div class="row">
      <input type="text" bind:value={passkeyName} maxlength="60" placeholder="이름 (예: 노트북)" aria-label="새 패스키 이름" />
      <button class="btn ghost" type="button" onclick={addPasskey} disabled={passkeyBusy}>{passkeyBusy ? '등록 중…' : '패스키 추가'}</button>
    </div>
  {:else}
    <p class="small muted">이 브라우저는 패스키를 지원하지 않습니다.</p>
  {/if}

  <h3>복구 코드</h3>
  {#if msg('recovery')?.error}<p class="banner" role="alert">{msg('recovery')?.error}</p>{/if}
  {#if data.totp.enabled || data.passkeys.length}
    <p class="small">남은 코드 {data.recoveryLeft}개</p>
    <details>
      <summary class="small">새로 발급 (기존 코드는 무효)</summary>
      <form method="POST" action="?/recovery" class="row" use:enhance>
        <input name="current" type="password" autocomplete="current-password" placeholder="현재 비밀번호" required aria-label="현재 비밀번호" />
        <button class="btn ghost">발급</button>
      </form>
    </details>
  {:else}
    <p class="small muted">인증 앱이나 패스키를 등록하면 함께 발급됩니다.</p>
  {/if}
</section>

<section class="card">
  <h2>비밀번호</h2>
  {#if msg('password')?.error}<p class="banner" role="alert">{msg('password')?.error}</p>{/if}
  {#if msg('password')?.message}<p class="banner info" role="status">{msg('password')?.message}</p>{/if}
  <form method="POST" action="?/password" class="stack" use:enhance={() => async ({ update }) => update({ reset: true })}>
    <input type="text" name="username" autocomplete="username" value={data.username} hidden readonly />
    <input name="current" type="password" autocomplete="current-password" placeholder="현재 비밀번호" required aria-label="현재 비밀번호" />
    <input name="password" type="password" autocomplete="new-password" placeholder="새 비밀번호 ({data.minPassword}자 이상)" required minlength={data.minPassword} aria-label="새 비밀번호" />
    <input name="confirm" type="password" autocomplete="new-password" placeholder="새 비밀번호 확인" required minlength={data.minPassword} aria-label="새 비밀번호 확인" />
    <button class="btn ghost">비밀번호 변경</button>
  </form>
  <p class="small muted">바꾸면 다른 기기의 세션은 모두 로그아웃됩니다.</p>
</section>

<section class="card">
  <h2>로그인된 기기</h2>
  {#if msg('sessions')?.error}<p class="banner" role="alert">{msg('sessions')?.error}</p>{/if}
  {#if msg('sessions')?.message}<p class="banner info" role="status">{msg('sessions')?.message}</p>{/if}
  <ul class="list">
    {#each data.sessions as s (s.id)}
      <li>
        <div class="main">
          <strong>{device(s.user_agent)}{#if s.current} <span class="chip">이 기기</span>{/if}</strong>
          <span class="muted small">{methodLabel[s.method] ?? s.method} · {kstDateTime(s.created_at)} 로그인 · 최근 {ago(s.last_seen_at)}{s.ip ? ` · ${s.ip}` : ''}</span>
        </div>
        {#if !s.current}
          <form method="POST" action="?/sessionRevoke" use:enhance>
            <input type="hidden" name="id" value={s.id} />
            <button class="btn ghost small">끝내기</button>
          </form>
        {/if}
      </li>
    {/each}
  </ul>
  {#if data.sessions.length > 1}
    <form method="POST" action="?/sessionRevokeOthers" use:enhance><button class="btn ghost small">다른 기기 모두 로그아웃</button></form>
  {/if}
</section>

<section class="card">
  <h2>MCP 연결</h2>
  <p class="muted small">
    Claude 같은 MCP 클라이언트에 아래 주소를 추가하면 브라우저에 승인 화면이 열립니다. 승인한 클라이언트는 이 계정으로 연결되며, 여기서 언제든 해제할 수 있습니다.
  </p>
  <div class="mcp-url">
    <code>{data.mcpUrl}</code>
    <button class="btn ghost small" onclick={copyMcp}>{copied ? '복사됨' : 'Claude Code 명령 복사'}</button>
  </div>
  {#if msg('clients')?.error}<p class="banner" role="alert">{msg('clients')?.error}</p>{/if}
  {#if msg('clients')?.message}<p class="banner info" role="status">{msg('clients')?.message}</p>{/if}
  <ul class="list">
    {#each data.clients as c (c.client_id)}
      <li class:revoked={c.revoked_at}>
        <div class="main">
          <strong>{c.client_name}</strong>
          <span class="muted small">
            {#if c.revoked_at}해제됨 · {kstDateTime(c.revoked_at)}{:else}승인 {kstDateTime(c.approved_at)} · 마지막 사용 {ago(c.last_used_at)}{/if}
          </span>
          <span class="muted small uri">{c.redirect_uris[0]}</span>
        </div>
        {#if !c.revoked_at}
          <form method="POST" action="?/clientRevoke" use:enhance>
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
  <h2>최근 보안 활동</h2>
  <ul class="list">
    {#each data.activity as a (a.id)}
      <li>
        <div class="main">
          <strong>{eventLabel[a.event] ?? a.event}</strong>
          <span class="muted small">{kstDateTime(a.at)}{a.ip ? ` · ${a.ip}` : ''}{a.detail ? ` · ${a.detail}` : ''}</span>
        </div>
      </li>
    {:else}
      <li class="muted small">기록이 없습니다.</li>
    {/each}
  </ul>
</section>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .who {
    margin: 0 0 12px;
  }
  h2 {
    font-size: 17px;
    margin-bottom: 8px;
  }
  h3 {
    font-size: 15px;
    margin: 18px 0 6px;
  }
  h2 + h3 {
    margin-top: 4px;
  }
  section {
    margin-bottom: 12px;
  }
  .banner {
    margin: 0 0 12px;
  }
  .small {
    font-size: 13px;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 6px;
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
  .row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .row .btn {
    flex: none;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .stack .btn {
    align-self: flex-start;
  }
  .enroll {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin: 8px 0;
  }
  .enroll img {
    border-radius: 12px;
    background: #fff;
  }
  code {
    background: var(--surface-2);
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 14px;
    word-break: break-all;
  }
  .secret {
    letter-spacing: 0.08em;
  }
  .cancel {
    margin-top: 6px;
  }
  .codes ol {
    columns: 2;
    margin: 8px 0 0;
    padding-left: 24px;
  }
  .codes li {
    margin-bottom: 4px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .list li:last-child {
    border-bottom: 0;
  }
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .uri {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mcp-url {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }
  .revoked {
    opacity: 0.6;
  }
  details summary {
    cursor: pointer;
    color: var(--accent-text);
  }
</style>
