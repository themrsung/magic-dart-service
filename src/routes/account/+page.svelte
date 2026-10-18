<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { ago, kstDateTime } from '$lib/format';
  import { translator, type MessageKey } from '$lib/i18n';
  import { browserSupportsWebAuthn, passkeyRegister } from '$lib/passkey';
  import { onMount } from 'svelte';

  let { data, form } = $props();
  let canPasskey = $state(false);
  let passkeyName = $state('');
  let passkeyBusy = $state(false);
  let passkeyError = $state('');
  let issuedCodes = $state<string[] | null>(null);
  let copied = $state(false);

  const t = $derived(translator(page.data.locale));
  const locale = $derived(page.data.locale);

  onMount(() => (canPasskey = browserSupportsWebAuthn()));

  const codes = $derived(form?.recoveryCodes ?? issuedCodes);
  const msg = (section: string) => (form?.section === section ? form : null);

  const EVENTS = [
    'setup',
    'login',
    'login_failed',
    'second_factor_failed',
    'lockout',
    'logout',
    'password_changed',
    'totp_enabled',
    'totp_disabled',
    'recovery_codes_generated',
    'recovery_code_used',
    'passkey_added',
    'passkey_removed',
    'session_revoked',
    'user_registered',
    'oauth_client_approved',
    'oauth_client_revoked'
  ];
  const METHODS = ['password', 'password+totp', 'password+passkey', 'password+recovery', 'passkey', 'setup', 'register', 'dev-bypass'];
  const eventLabel = (e: string) => (EVENTS.includes(e) ? t(`account.event.${e}` as MessageKey) : e);
  const methodLabel = (m: string) => (METHODS.includes(m) ? t(`account.method.${m}` as MessageKey) : m);

  function device(ua: string | null): string {
    if (!ua) return t('account.device.unknown');
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

<svelte:head><title>{t('account.title')} · MagicDART</title></svelte:head>

<div class="head">
  <h1>{t('account.title')}</h1>
  <form method="POST" action="/logout" onsubmit={clearOfflineCopies}>
    <button class="btn ghost small">{t('account.logout')}</button>
  </form>
</div>
<p class="muted who">{data.username} · {data.role === 'admin' ? t('account.role.admin') : t('account.role.user')}</p>

{#if data.welcome}
  <p class="banner info">{t('account.welcome')}</p>
{/if}
{#if data.recovered}
  <p class="banner">{t('account.recovered', { count: data.recoveryLeft })}</p>
{/if}

{#if codes}
  <section class="card codes" aria-live="polite">
    <h2>{t('account.codes.title')}</h2>
    <p class="small">{t('account.codes.intro')} <strong>{t('account.codes.once')}</strong> {t('account.codes.keep')}</p>
    <ol>
      {#each codes as c}<li><code>{c}</code></li>{/each}
    </ol>
  </section>
{/if}

<section class="card">
  <h2>{t('account.twoStep.title')}</h2>

  <h3>{t('account.totp.title')}</h3>
  {#if msg('totp')?.error}<p class="banner" role="alert">{msg('totp')?.error}</p>{/if}
  {#if msg('totp')?.message}<p class="banner info" role="status">{msg('totp')?.message}</p>{/if}
  {#if data.totp.enabled}
    <p class="state"><span class="dot ok" aria-hidden="true"></span> {t('account.totp.on')}</p>
    <details>
      <summary class="small">{t('account.totp.disable')}</summary>
      <form method="POST" action="?/totpDisable" class="row" use:enhance>
        <input name="current" type="password" autocomplete="current-password" placeholder={t('account.current.placeholder')} required aria-label={t('account.current.placeholder')} />
        <button class="btn ghost">{t('account.totp.disable')}</button>
      </form>
    </details>
  {:else if data.totp.pending}
    <p class="small">{t('account.totp.scan')}</p>
    <div class="enroll">
      <img src={data.totp.pending.qr} alt={t('account.totp.qrAlt')} width="180" height="180" />
      <div>
        <p class="small muted">{t('account.totp.manual')}</p>
        <code class="secret">{data.totp.pending.secret}</code>
      </div>
    </div>
    <form method="POST" action="?/totpConfirm" class="row" use:enhance>
      <input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder={t('account.totp.codePlaceholder')} required aria-label={t('account.totp.codeLabel')} />
      <button class="btn">{t('account.totp.confirm')}</button>
    </form>
    <form method="POST" action="?/totpCancel" use:enhance><button class="btn ghost small cancel">{t('account.totp.cancel')}</button></form>
  {:else}
    <p class="state"><span class="dot" aria-hidden="true"></span> {t('account.totp.off')}</p>
    <form method="POST" action="?/totpBegin" use:enhance><button class="btn ghost">{t('account.totp.enroll')}</button></form>
  {/if}

  <h3>{t('account.passkeys.title')}</h3>
  <p class="small muted">{t('account.passkeys.intro')}</p>
  {#if msg('passkeys')?.error}<p class="banner" role="alert">{msg('passkeys')?.error}</p>{/if}
  {#if msg('passkeys')?.message}<p class="banner info" role="status">{msg('passkeys')?.message}</p>{/if}
  {#if passkeyError}<p class="banner" role="alert">{passkeyError}</p>{/if}
  <ul class="list">
    {#each data.passkeys as p (p.id)}
      <li>
        <div class="main">
          <strong>{p.name}</strong>
          <span class="muted small">{t('account.passkeys.meta', { created: kstDateTime(p.created_at, locale), used: ago(p.last_used_at, locale) })}{p.backed_up ? t('account.passkeys.synced') : ''}</span>
        </div>
        <details>
          <summary class="small">{t('account.passkeys.manage')}</summary>
          <form method="POST" action="?/passkeyRename" class="row" use:enhance>
            <input type="hidden" name="id" value={p.id} />
            <input name="name" type="text" maxlength="60" value={p.name} aria-label={t('account.passkeys.nameLabel')} required />
            <button class="btn ghost small">{t('account.passkeys.rename')}</button>
          </form>
          <form method="POST" action="?/passkeyRemove" class="row" use:enhance>
            <input type="hidden" name="id" value={p.id} />
            <input name="current" type="password" autocomplete="current-password" placeholder={t('account.current.placeholder')} required aria-label={t('account.current.placeholder')} />
            <button class="btn ghost small">{t('account.passkeys.remove')}</button>
          </form>
        </details>
      </li>
    {:else}
      <li class="muted small">{t('account.passkeys.none')}</li>
    {/each}
  </ul>
  {#if canPasskey}
    <div class="row">
      <input type="text" bind:value={passkeyName} maxlength="60" placeholder={t('account.passkeys.newPlaceholder')} aria-label={t('account.passkeys.newLabel')} />
      <button class="btn ghost" type="button" onclick={addPasskey} disabled={passkeyBusy}>{passkeyBusy ? t('account.passkeys.adding') : t('account.passkeys.add')}</button>
    </div>
  {:else}
    <p class="small muted">{t('account.passkeys.unsupported')}</p>
  {/if}

  <h3>{t('account.recovery.title')}</h3>
  {#if msg('recovery')?.error}<p class="banner" role="alert">{msg('recovery')?.error}</p>{/if}
  {#if data.totp.enabled || data.passkeys.length}
    <p class="small">{t('account.recovery.left', { count: data.recoveryLeft })}</p>
    <details>
      <summary class="small">{t('account.recovery.regenerate')}</summary>
      <form method="POST" action="?/recovery" class="row" use:enhance>
        <input name="current" type="password" autocomplete="current-password" placeholder={t('account.current.placeholder')} required aria-label={t('account.current.placeholder')} />
        <button class="btn ghost">{t('account.recovery.issue')}</button>
      </form>
    </details>
  {:else}
    <p class="small muted">{t('account.recovery.withFactor')}</p>
  {/if}
</section>

<section class="card">
  <h2>{t('account.password.title')}</h2>
  {#if msg('password')?.error}<p class="banner" role="alert">{msg('password')?.error}</p>{/if}
  {#if msg('password')?.message}<p class="banner info" role="status">{msg('password')?.message}</p>{/if}
  <form method="POST" action="?/password" class="stack" use:enhance={() => async ({ update }) => update({ reset: true })}>
    <input type="text" name="username" autocomplete="username" value={data.username} hidden readonly />
    <input name="current" type="password" autocomplete="current-password" placeholder={t('account.current.placeholder')} required aria-label={t('account.current.placeholder')} />
    <input name="password" type="password" autocomplete="new-password" placeholder={t('account.password.newPlaceholder', { min: data.minPassword })} required minlength={data.minPassword} aria-label={t('account.password.newLabel')} />
    <input name="confirm" type="password" autocomplete="new-password" placeholder={t('account.password.confirmPlaceholder')} required minlength={data.minPassword} aria-label={t('account.password.confirmPlaceholder')} />
    <button class="btn ghost">{t('account.password.submit')}</button>
  </form>
  <p class="small muted">{t('account.password.note')}</p>
</section>

<section class="card">
  <h2>{t('account.sessions.title')}</h2>
  {#if msg('sessions')?.error}<p class="banner" role="alert">{msg('sessions')?.error}</p>{/if}
  {#if msg('sessions')?.message}<p class="banner info" role="status">{msg('sessions')?.message}</p>{/if}
  <ul class="list">
    {#each data.sessions as s (s.id)}
      <li>
        <div class="main">
          <strong>{device(s.user_agent)}{#if s.current} <span class="chip">{t('account.sessions.thisDevice')}</span>{/if}</strong>
          <span class="muted small">{t('account.sessions.meta', { method: methodLabel(s.method), created: kstDateTime(s.created_at, locale), seen: ago(s.last_seen_at, locale) })}{s.ip ? ` · ${s.ip}` : ''}</span>
        </div>
        {#if !s.current}
          <form method="POST" action="?/sessionRevoke" use:enhance>
            <input type="hidden" name="id" value={s.id} />
            <button class="btn ghost small">{t('account.sessions.end')}</button>
          </form>
        {/if}
      </li>
    {/each}
  </ul>
  {#if data.sessions.length > 1}
    <form method="POST" action="?/sessionRevokeOthers" use:enhance><button class="btn ghost small">{t('account.sessions.endOthers')}</button></form>
  {/if}
</section>

<section class="card">
  <h2>{t('account.mcp.title')}</h2>
  <p class="muted small">{t('account.mcp.intro')}</p>
  <div class="mcp-url">
    <code>{data.mcpUrl}</code>
    <button class="btn ghost small" onclick={copyMcp}>{copied ? t('account.mcp.copied') : t('account.mcp.copy')}</button>
  </div>
  {#if msg('clients')?.error}<p class="banner" role="alert">{msg('clients')?.error}</p>{/if}
  {#if msg('clients')?.message}<p class="banner info" role="status">{msg('clients')?.message}</p>{/if}
  <ul class="list">
    {#each data.clients as c (c.client_id)}
      <li class:revoked={c.revoked_at}>
        <div class="main">
          <strong>{c.client_name}</strong>
          <span class="muted small">
            {#if c.revoked_at}{t('account.mcp.revokedAt', { at: kstDateTime(c.revoked_at, locale) })}{:else}{t('account.mcp.approvedAt', { at: kstDateTime(c.approved_at, locale), used: ago(c.last_used_at, locale) })}{/if}
          </span>
          <span class="muted small uri">{c.redirect_uris[0]}</span>
        </div>
        {#if !c.revoked_at}
          <form method="POST" action="?/clientRevoke" use:enhance>
            <input type="hidden" name="client_id" value={c.client_id} />
            <button class="btn ghost small">{t('account.mcp.disconnect')}</button>
          </form>
        {/if}
      </li>
    {:else}
      <li class="muted small">{t('account.mcp.none')}</li>
    {/each}
  </ul>
</section>

<section class="card">
  <h2>{t('account.activity.title')}</h2>
  <ul class="list">
    {#each data.activity as a (a.id)}
      <li>
        <div class="main">
          <strong>{eventLabel(a.event)}</strong>
          <span class="muted small">{kstDateTime(a.at, locale)}{a.ip ? ` · ${a.ip}` : ''}{a.detail ? ` · ${a.detail}` : ''}</span>
        </div>
      </li>
    {:else}
      <li class="muted small">{t('account.activity.none')}</li>
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
