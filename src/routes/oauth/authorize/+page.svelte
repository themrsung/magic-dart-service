<script lang="ts">
  import { page } from '$app/state';
  import LangSwitch from '$lib/components/LangSwitch.svelte';
  import { kstDateTime } from '$lib/format';
  import { translator, type MessageKey } from '$lib/i18n';

  let { data } = $props();
  const t = $derived(translator(page.data.locale));
  const MARK = '\u0000';
  /** Splits a message around its one placeholder so the value can be wrapped in <strong>. */
  const around = (key: MessageKey, param: string) => t(key, { [param]: MARK }).split(MARK);
  const lead = $derived(around('auth.consent.lead', 'client'));
  const bind = $derived(around('auth.consent.bindNote', 'username'));
</script>

<svelte:head><title>{t('auth.consent.pageTitle')} · MagicDART</title></svelte:head>

<div class="consent card">
  <svg width="48" height="48" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="#FFC15E" />
    <circle cx="32" cy="32" r="20" fill="#F7934C" />
    <circle cx="32" cy="32" r="10" fill="#CC5803" />
    <circle cx="32" cy="32" r="3.5" fill="#1F1300" />
  </svg>
  <h1>{t('auth.consent.title')}</h1>
  <p class="lead">{lead[0]}<strong>{data.clientName}</strong>{lead[1]}</p>

  <ul class="scope">
    <li>{t('auth.consent.scopeRead')}</li>
    <li>{t('auth.consent.scopeQuota')}</li>
    <li>{t('auth.consent.scopeKey')}</li>
  </ul>

  <dl class="details">
    <dt>{t('auth.consent.redirect')}</dt>
    <dd><code>{data.redirectUri}</code></dd>
    <dt>{t('auth.consent.registered')}</dt>
    <dd>{kstDateTime(data.registeredAt, page.data.locale)}{data.previouslyApproved ? t('auth.consent.previouslyApproved') : ''}</dd>
  </dl>
  {#if data.loopback}
    <p class="muted small">{t('auth.consent.loopback')}</p>
  {/if}
  <p class="muted small">{bind[0]}<strong>{data.username}</strong>{bind[1]}</p>

  <form method="POST" class="actions">
    <button class="btn ghost" name="decision" value="deny">{t('auth.consent.deny')}</button>
    <button class="btn" name="decision" value="approve">{t('auth.consent.approve')}</button>
  </form>
  <div class="lang-row"><LangSwitch /></div>
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
  .lang-row {
    display: flex;
    justify-content: center;
    margin-top: 16px;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 18px;
  }
</style>
