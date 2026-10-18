<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  let { data, children } = $props();

  const tabs = [
    { href: '/', label: '공시', icon: 'M4 5h16M4 10h16M4 15h10M4 20h7', match: (p: string) => p === '/' },
    { href: '/search', label: '기업', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3', match: (p: string) => p.startsWith('/search') || p.startsWith('/corp') },
    { href: '/account', label: '계정', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z', match: (p: string) => p.startsWith('/account') }
  ];
  const adminTab = { href: '/admin', label: '관리', icon: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4zM9 12l2 2 4-4', match: (p: string) => p.startsWith('/admin') };
  const shown = $derived(data.user?.role === 'admin' ? [...tabs, adminTab] : tabs);
  const bare = $derived(!data.user || /^\/(oauth|login|setup|register)(\/|$)/.test(page.url.pathname));
</script>

<div class="app" class:bare>
  {#if !bare}
    <header class="top">
      <a class="brand" href="/" aria-label="MagicDART 홈">
        <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="30" fill="#FFC15E" />
          <circle cx="32" cy="32" r="20" fill="#F7934C" />
          <circle cx="32" cy="32" r="10" fill="#CC5803" />
          <circle cx="32" cy="32" r="3.5" fill="#1F1300" />
        </svg>
        <span>MagicDART</span>
      </a>
      <nav class="side" aria-label="주 메뉴">
        {#each shown as t}
          <a href={t.href} aria-current={t.match(page.url.pathname) ? 'page' : undefined}>{t.label}</a>
        {/each}
      </nav>
    </header>

    {#if !data.keyConfigured && !page.url.pathname.startsWith('/admin')}
      <div class="wrap">
        {#if data.user?.role === 'admin'}
          <p class="banner">OpenDART API 키가 아직 없습니다. 저장된 데이터만 보여줍니다. <a href="/admin">관리에서 키 등록 →</a></p>
        {:else}
          <p class="banner">OpenDART API 키가 아직 등록되지 않아 저장된 데이터만 보여줍니다. 관리자에게 문의하세요.</p>
        {/if}
      </div>
    {/if}
  {/if}

  <main class="wrap">
    {@render children()}
  </main>

  {#if !bare}
    <nav class="tabbar" aria-label="하단 메뉴" style:--tabs={shown.length}>
      {#each shown as t}
        <a href={t.href} aria-current={t.match(page.url.pathname) ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"
            ><path d={t.icon} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg
          >
          <span>{t.label}</span>
        </a>
      {/each}
    </nav>
  {/if}
</div>

<style>
  .app {
    min-height: 100dvh;
    padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + 16px);
  }
  .app.bare {
    padding-bottom: 24px;
  }
  .wrap {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 16px;
  }
  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(env(safe-area-inset-top) + 10px) 16px 10px;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 18px;
    color: var(--text);
  }
  .brand:hover {
    text-decoration: none;
  }
  .side {
    display: none;
    gap: 4px;
  }
  .side a {
    padding: 6px 12px;
    border-radius: 10px;
    color: var(--muted);
    font-weight: 600;
  }
  .side a[aria-current='page'] {
    color: var(--text);
    background: var(--surface-2);
  }
  .banner {
    margin: 0 0 16px;
  }
  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(var(--tabs, 3), 1fr);
    height: calc(var(--nav-h) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  .tabbar a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }
  .tabbar a:hover {
    text-decoration: none;
  }
  .tabbar a[aria-current='page'] {
    color: var(--accent-text);
  }
  @media (min-width: 760px) {
    .side {
      display: flex;
    }
    .tabbar {
      display: none;
    }
    .app {
      padding-bottom: 32px;
    }
  }
</style>
