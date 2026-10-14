<script lang="ts">
  import { onMount } from 'svelte';
  import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from '@lucide/svelte';
  import type { ToastTone } from '$lib/client/notifications.js';
  type ToastItem = { id: number; message: string; tone: ToastTone; title?: string };
  let items = $state<ToastItem[]>([]);
  let sequence = 0;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  function dismiss(id: number) {
    items = items.filter((item) => item.id !== id);
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  }
  function addToast(event: Event) {
    const detail = (event as CustomEvent<{message?: string; tone?: ToastTone; title?: string}>).detail;
    if (!detail?.message) return;
    const id = ++sequence;
    items = [...items.slice(-3), { id, message: detail.message, tone: detail.tone ?? 'info', title: detail.title }];
    timers.set(id, setTimeout(() => dismiss(id), detail.tone === 'error' ? 7000 : 4500));
  }
  onMount(() => {
    window.addEventListener('nexus:toast', addToast);
    try {
      const flash = sessionStorage.getItem('nexus:flash-toast');
      if (flash) {
        sessionStorage.removeItem('nexus:flash-toast');
        const detail = JSON.parse(flash) as { message?: string; tone?: ToastTone; title?: string };
        addToast(new CustomEvent('nexus:toast', { detail }));
      }
    } catch { /* ignore malformed or blocked session storage */ }
    return () => {
      window.removeEventListener('nexus:toast', addToast);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  });
</script>

<div class="toast-viewport" aria-label="Notifications" aria-live="polite" aria-relevant="additions text">
  {#each items as item (item.id)}
    <article class={`toast-item tone-${item.tone}`}>
      <span class="toast-icon">
        {#if item.tone === 'success'}<CheckCircle2 size={19}/>{:else if item.tone === 'error'}<CircleAlert size={19}/>{:else if item.tone === 'warning'}<TriangleAlert size={19}/>{:else}<Info size={19}/>{/if}
      </span>
      <div class="toast-copy">{#if item.title}<strong>{item.title}</strong>{/if}<p>{item.message}</p></div>
      <button type="button" aria-label="Dismiss notification" onclick={() => dismiss(item.id)}><X size={16}/></button>
    </article>
  {/each}
</div>

<style>
  .toast-viewport{position:fixed;z-index:1000;top:74px;right:16px;display:grid;gap:8px;width:min(390px,calc(100vw - 24px));pointer-events:none}
  .toast-item{display:flex;align-items:flex-start;gap:11px;padding:12px 13px;border:1px solid #344448;border-radius:9px;background:#182529;color:#e9edef;box-shadow:0 12px 34px #0005;pointer-events:auto;animation:toast-in .18s ease-out}
  .toast-icon{display:grid;place-items:center;flex:0 0 22px;padding-top:1px;color:#92b8be}.tone-success .toast-icon{color:#6fdbad}.tone-error .toast-icon{color:#ff9189}.tone-warning .toast-icon{color:#ffc46d}
  .toast-copy{min-width:0;flex:1}.toast-copy strong{display:block;font-size:12px;font-weight:750;margin-bottom:2px}.toast-copy p{font-size:12px;line-height:1.5;color:#c1cbce;overflow-wrap:anywhere;margin:0}
  .toast-item>button{display:grid;place-items:center;flex:0 0 25px;width:25px;height:25px;border-radius:5px;color:#8b9b9f}.toast-item>button:hover{background:#26373b;color:white}
  @keyframes toast-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
  @media(max-width:600px){.toast-viewport{top:auto;right:10px;bottom:82px;width:calc(100vw - 20px)}}
  @media(prefers-reduced-motion:reduce){.toast-item{animation:none}}
</style>
