<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { ago, kstDateTime } from '$lib/format';
  import { translator, type MessageKey } from '$lib/i18n';
  import { onMount } from 'svelte';

  let { data, form } = $props();
  let saving = $state(false);
  let copied = $state(false);

  const t = $derived(translator(page.data.locale));
  const locale = $derived(page.data.locale);
  const nf = $derived(new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'ko-KR'));
  const n = (v: number) => nf.format(v);

  /** Translates a known key family (e.g. admin.event.<x>), falling back to the raw value. */
  function label(prefix: string, value: string): string {
    const key = `${prefix}${value}` as MessageKey;
    const out = t(key);
    return out === key ? value : out;
  }
  const jobLabel = (name: string, fallback?: string) => {
    const out = label('admin.job.', name);
    return out === name ? (fallback ?? name) : out;
  };

  async function copyInvite(url: string) {
    await navigator.clipboard.writeText(url);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  // Keep the job table live while something is queued or running.
  onMount(() => {
    const timer = setInterval(() => {
      if (data.jobs.some((j) => j.queued || j.last?.status === 'running')) invalidateAll();
    }, 5000);
    return () => clearInterval(timer);
  });

  const pct = (v: number, of: number) => Math.min(100, Math.round((v / of) * 100));
  const factors = (u: { totp: number; passkeys: number }) =>
    u.totp || u.passkeys
      ? [u.totp ? t('admin.users.factorTotp') : '', u.passkeys ? t('admin.users.factorPasskeys', { n: u.passkeys }) : ''].filter(Boolean).join(', ')
      : t('admin.users.factorNone');
  const role = (r: string) => (r === 'admin' ? t('admin.role.admin') : t('admin.role.user'));
</script>

<svelte:head><title>{t('admin.title')} · MagicDART</title></svelte:head>

<h1>{t('admin.title')}</h1>

<section class="card">
  <h2>{t('admin.key.heading')}</h2>
  <p class="state">
    {#if data.key.configured}
      <span class="dot ok" aria-hidden="true"></span> {t('admin.key.configured', { when: kstDateTime(data.key.updatedAt, locale) })}
    {:else if data.key.stored}
      <span class="dot bad" aria-hidden="true"></span> {t('admin.key.unusable')}
    {:else}
      <span class="dot" aria-hidden="true"></span> {t('admin.key.missing')}
    {/if}
  </p>
  {#if data.key.error}<p class="banner" role="alert">{data.key.error} {t('admin.key.reenter')}</p>{/if}
  {#if data.key.stored}
    <p class="muted small">
      {#if data.key.protection === 'host'}
        {t('admin.key.protectionHost', { source: data.key.hostSource })}
      {:else}
        {t('admin.key.protectionSecret', { reason: data.key.binding === 'off' ? t('admin.key.protectionSecretOff') : t('admin.key.protectionSecretNoHost') })}
      {/if}
    </p>
  {/if}
  <p class="muted small">{t('admin.key.storedNote')}</p>
  <p class="banner info small">
    <strong>{t('admin.key.allowlistStrong')}</strong> {t('admin.key.allowlistBody')}
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
    <label class="visually-hidden" for="key">{t('admin.key.newLabel')}</label>
    <div class="row">
      <input id="key" name="key" type="password" inputmode="text" placeholder={data.key.configured ? t('admin.key.placeholderReplace') : t('admin.key.placeholderNew')} required minlength="40" maxlength="40" spellcheck="false" autocapitalize="off" />
      <button class="btn" disabled={saving}>{saving ? t('admin.key.checking') : t('admin.key.save')}</button>
    </div>
  </form>
  {#if form?.keyError}<p class="banner" role="alert">{form.keyError}</p>{/if}
  {#if form?.keySaved}<p class="banner info" role="status">{form.keySaved}</p>{/if}

  <div class="egress">
    <span class="muted small">{t('admin.key.egressLabel')}</span>
    {#if data.egressEnabled}
      {#await data.egress}
        <span class="skeleton ip" aria-label={t('admin.key.egressChecking')}></span>
      {:then ip}
        <code>{ip ?? t('admin.key.egressFailed')}</code>
      {/await}
    {:else}
      <span class="muted small">{t('admin.key.egressOff')}</span>
    {/if}
  </div>
  {#if form?.keyStatus === '012'}
    <p class="banner">{t('admin.key.ipRejected')}</p>
  {/if}
</section>

<section class="card">
  <h2>{t('admin.usage.heading')} <span class="muted sub">{t('admin.usage.reset')}</span></h2>
  <div class="meter">
    <div class="meter-head"><span>{t('admin.usage.auto')}</span><span class="num">{n(data.usage.cron)} / {n(data.usage.budget)}</span></div>
    <div class="track" role="progressbar" aria-valuenow={data.usage.cron} aria-valuemin="0" aria-valuemax={data.usage.budget} aria-label={t('admin.usage.autoAria')}>
      <div class="fill" style="width:{pct(data.usage.cron, data.usage.budget)}%"></div>
    </div>
  </div>
  <div class="meter">
    <div class="meter-head"><span>{t('admin.usage.total', { ui: n(data.usage.ui), mcp: n(data.usage.mcp) })}</span><span class="num">{n(data.usage.total)} / {n(data.usage.cap)}</span></div>
    <div class="track" role="progressbar" aria-valuenow={data.usage.total} aria-valuemin="0" aria-valuemax={data.usage.cap} aria-label={t('admin.usage.totalAria')}>
      <div class="fill alt" style="width:{pct(data.usage.total, data.usage.cap)}%"></div>
    </div>
  </div>
  <dl class="stats">
    <div><dt>{t('admin.stats.corps')}</dt><dd class="num">{n(data.stats.corps.total)} <span class="muted">({t('admin.stats.listed', { n: n(data.stats.corps.listed) })})</span></dd></div>
    <div><dt>{t('admin.stats.filings')}</dt><dd class="num">{n(data.stats.filings)}</dd></div>
    <div><dt>{t('admin.stats.pending')}</dt><dd class="num">{n(data.stats.pending)}</dd></div>
  </dl>
</section>

<section class="card">
  <h2>{t('admin.jobs.heading')}</h2>
  {#if form?.jobMessage}<p class="banner info" role="status">{form.jobMessage}</p>{/if}
  <ul class="jobs">
    {#each data.jobs as j (j.name)}
      <li>
        <div class="job-main">
          <strong>{jobLabel(j.name, j.label)}</strong>
          <span class="muted small">
            {#if j.last}
              {label('admin.status.', j.last.status)} · {ago(j.last.started_at, locale)} · {t('admin.jobs.requests', { n: j.last.requests })}
            {:else}
              {t('admin.jobs.noRuns')}
            {/if}
            {#if j.next} · {t('admin.jobs.next', { when: kstDateTime(j.next, locale) })}{/if}
          </span>
          {#if j.last?.message}<span class="muted small msg">{j.last.message.split('\n').at(-1)}</span>{/if}
        </div>
        <form method="POST" action="?/runJob" use:enhance>
          <input type="hidden" name="job" value={j.name} />
          <button class="btn ghost small" disabled={j.queued || !data.key.configured}>{j.queued ? t('admin.jobs.queued') : t('admin.jobs.runNow')}</button>
        </form>
      </li>
    {/each}
  </ul>
  <details>
    <summary class="small">{t('admin.jobs.recent')}</summary>
    <table class="runs">
      <thead><tr><th>{t('admin.jobs.colJob')}</th><th>{t('admin.jobs.colStarted')}</th><th>{t('admin.jobs.colStatus')}</th><th class="num">{t('admin.jobs.colRequests')}</th></tr></thead>
      <tbody>
        {#each data.runs as r}
          <tr title={r.message ?? ''}>
            <td>{jobLabel(r.job, data.jobs.find((j) => j.name === r.job)?.label)}</td>
            <td class="small">{kstDateTime(r.started_at, locale)}</td>
            <td>{label('admin.status.', r.status)}</td>
            <td class="num">{r.requests}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>
</section>

<section class="card">
  <h2>{t('admin.users.heading')} <span class="muted sub">{t('admin.users.registration', { mode: label('admin.registration.', data.registration) })}</span></h2>
  {#if form?.userError}<p class="banner" role="alert">{form.userError}</p>{/if}
  {#if form?.userMessage}<p class="banner info" role="status">{form.userMessage}</p>{/if}
  <ul class="clients">
    {#each data.users as u (u.id)}
      <li class:revoked={u.disabled_at}>
        <div>
          <strong>{u.username} <span class="chip">{role(u.role)}</span>{#if u.disabled_at} <span class="chip warn">{t('admin.users.disabled')}</span>{/if}</strong>
          <span class="muted small">
            {t('admin.users.meta', { created: kstDateTime(u.created_at, locale), seen: ago(u.last_seen_at, locale), factors: factors(u) })}
          </span>
        </div>
        {#if u.id !== data.me}
          <div class="actions">
            <form method="POST" action="?/userState" use:enhance>
              <input type="hidden" name="id" value={u.id} />
              <input type="hidden" name="role" value={u.role === 'admin' ? 'user' : 'admin'} />
              <button class="btn ghost small" name="op" value="role">{u.role === 'admin' ? t('admin.users.makeUser') : t('admin.users.makeAdmin')}</button>
            </form>
            <form method="POST" action="?/userState" use:enhance>
              <input type="hidden" name="id" value={u.id} />
              <button class="btn ghost small" name="op" value={u.disabled_at ? 'enable' : 'disable'}>{u.disabled_at ? t('admin.users.enable') : t('admin.users.disable')}</button>
            </form>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  <h3>{t('admin.invites.heading')}</h3>
  {#if data.registration === 'closed'}
    <p class="muted small">{t('admin.invites.closed')}</p>
  {:else}
    <form method="POST" action="?/invite" class="row" use:enhance>
      <input name="note" type="text" maxlength="100" placeholder={t('admin.invites.notePlaceholder')} aria-label={t('admin.invites.noteAria')} />
      <select name="role" aria-label={t('admin.invites.roleAria')}>
        <option value="user">{t('admin.role.user')}</option>
        <option value="admin">{t('admin.role.admin')}</option>
      </select>
      <button class="btn ghost">{t('admin.invites.create')}</button>
    </form>
    {#if form?.inviteError}<p class="banner" role="alert">{form.inviteError}</p>{/if}
    {#if form?.inviteUrl}
      <div class="banner info invite">
        <span>{t('admin.invites.createdNote')}</span>
        <code>{form.inviteUrl}</code>
        <button class="btn ghost small" onclick={() => copyInvite(form.inviteUrl)}>{copied ? t('admin.invites.copied') : t('admin.invites.copy')}</button>
      </div>
    {/if}
    {#if form?.inviteMessage}<p class="banner info" role="status">{form.inviteMessage}</p>{/if}
    <ul class="clients">
      {#each data.invites as i (i.token_hash)}
        <li class:revoked={i.used_at || i.revoked_at || i.expires_at < Date.now()}>
          <div>
            <strong>{i.note ?? t('admin.invites.defaultNote')} <span class="chip">{role(i.role)}</span></strong>
            <span class="muted small">
              {#if i.used_at}{t('admin.invites.used', { name: i.used_by_name ?? '?', when: kstDateTime(i.used_at, locale) })}
              {:else if i.revoked_at}{t('admin.invites.revoked')}
              {:else if i.expires_at < Date.now()}{t('admin.invites.expired')}
              {:else}{t('admin.invites.until', { when: kstDateTime(i.expires_at, locale) })}{/if}
            </span>
          </div>
          {#if !i.used_at && !i.revoked_at && i.expires_at >= Date.now()}
            <form method="POST" action="?/inviteRevoke" use:enhance>
              <input type="hidden" name="id" value={i.token_hash} />
              <button class="btn ghost small">{t('admin.invites.revoke')}</button>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<section class="card">
  <h2>{t('admin.clients.heading')}</h2>
  <p class="muted small">{t('admin.clients.note')}</p>
  {#if form?.clientMessage}<p class="banner info" role="status">{form.clientMessage}</p>{/if}
  <ul class="clients">
    {#each data.clients as c (c.client_id)}
      <li class:revoked={c.revoked_at}>
        <div>
          <strong>{c.client_name} <span class="muted small">· {c.username ?? '?'}</span></strong>
          <span class="muted small">
            {#if c.revoked_at}{t('admin.clients.revokedAt', { when: kstDateTime(c.revoked_at, locale) })}
            {:else}{t('admin.clients.approved', { approved: kstDateTime(c.approved_at, locale), used: ago(c.last_used_at, locale) })}{/if}
          </span>
          <span class="muted small uri">{c.redirect_uris[0]}</span>
        </div>
        {#if !c.revoked_at}
          <form method="POST" action="?/revoke" use:enhance>
            <input type="hidden" name="client_id" value={c.client_id} />
            <button class="btn ghost small">{t('admin.clients.disconnect')}</button>
          </form>
        {/if}
      </li>
    {:else}
      <li class="muted small">{t('admin.clients.none')}</li>
    {/each}
  </ul>
</section>

<section class="card">
  <h2>{t('admin.audit.heading')}</h2>
  <table class="runs">
    <thead><tr><th>{t('admin.audit.colTime')}</th><th>{t('admin.audit.colUser')}</th><th>{t('admin.audit.colEvent')}</th><th>{t('admin.audit.colIp')}</th></tr></thead>
    <tbody>
      {#each data.audit as a (a.id)}
        <tr title={a.detail ?? ''}>
          <td class="small">{kstDateTime(a.at, locale)}</td>
          <td>{a.username ?? '-'}</td>
          <td>{label('admin.event.', a.event)}{a.detail ? ` · ${a.detail}` : ''}</td>
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
