<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, lead, children }: { title: string; lead?: string; children: Snippet } = $props();
</script>

<div class="auth card">
  <svg width="48" height="48" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="#FFC15E" />
    <circle cx="32" cy="32" r="20" fill="#F7934C" />
    <circle cx="32" cy="32" r="10" fill="#CC5803" />
    <circle cx="32" cy="32" r="3.5" fill="#1F1300" />
  </svg>
  <h1>{title}</h1>
  {#if lead}<p class="lead muted">{lead}</p>{/if}
  {@render children()}
</div>

<style>
  .auth {
    max-width: 420px;
    margin: 8vh auto 0;
    padding: 28px 24px;
  }
  svg {
    display: block;
    margin: 0 auto;
  }
  h1 {
    font-size: 22px;
    margin: 12px 0 6px;
    text-align: center;
  }
  .lead {
    margin: 0 0 16px;
    text-align: center;
    font-size: 14px;
  }
  .auth :global(form.stack) {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .auth :global(label) {
    font-size: 14px;
    font-weight: 600;
  }
  .auth :global(.hint) {
    font-size: 13px;
    margin: -4px 0 0;
  }
  .auth :global(.or) {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 16px 0;
    color: var(--muted);
    font-size: 13px;
  }
  .auth :global(.or::before),
  .auth :global(.or::after) {
    content: '';
    flex: 1;
    border-top: 1px solid var(--border);
  }
  .auth :global(.banner) {
    margin: 0 0 12px;
  }
  .auth :global(.btn) {
    width: 100%;
  }
</style>
