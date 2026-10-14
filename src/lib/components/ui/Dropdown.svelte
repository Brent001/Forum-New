<script lang="ts">
  import { Check, ChevronDown } from '@lucide/svelte';

  export type DropdownOption = { value: string; label: string; detail?: string; disabled?: boolean };
  let { label, value, options, onChange, fullWidth = false } = $props<{
    label: string;
    value: string;
    options: DropdownOption[];
    onChange: (value: string) => void;
    fullWidth?: boolean;
  }>();

  let open = $state(false);
  let rootEl = $state<HTMLElement | null>(null);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let alignRight = $state(false);
  const selected = $derived(options.find((option) => option.value === value) ?? options[0]);

  function adjustMenuSide() {
    requestAnimationFrame(() => {
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const usableWidth = Math.min(360, window.innerWidth - 24);
      alignRight = rect.left + usableWidth > window.innerWidth - 8 && rect.right - usableWidth >= 8;
    });
  }

  function focusOption(which: 'first' | 'last' = 'first') {
    requestAnimationFrame(() => {
      const buttons = menuEl?.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)');
      if (!buttons?.length) return;
      (which === 'last' ? buttons[buttons.length - 1] : buttons[0])?.focus();
    });
  }

  function handleTriggerKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open = true;
      adjustMenuSide();
      focusOption('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      open = true;
      adjustMenuSide();
      focusOption('last');
    } else if (event.key === 'Escape') {
      open = false;
    }
  }

  function handleMenuKey(event: KeyboardEvent) {
    if (!menuEl) return;
    const buttons = [...menuEl.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)')];
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      open = false;
      triggerEl?.focus();
    }
  }

  function choose(option: DropdownOption) {
    if (option.disabled) return;
    onChange(option.value);
    open = false;
  }

  $effect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (rootEl && !rootEl.contains(event.target as Node)) open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  });
</script>

<div class:dropdown-full={fullWidth} class="dropdown-root" bind:this={rootEl}>
  <button
    bind:this={triggerEl}
    type="button"
    class="dropdown-trigger"
    aria-label={label}
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={() => { open = !open; if (open) { adjustMenuSide(); focusOption('first'); } }}
    onkeydown={handleTriggerKey}
  >
    <span class="dropdown-current">{selected?.label ?? label}</span>
    <ChevronDown size={16} strokeWidth={2} class={open ? 'chevron-open' : ''} />
  </button>
  {#if open}
    <div bind:this={menuEl} class:dropdown-align-right={alignRight} class="dropdown-menu" role="listbox" aria-label={label} onkeydown={handleMenuKey}>
      {#each options as option (option.value)}
        <button
          type="button"
          class:dropdown-option-selected={option.value === value}
          class:dropdown-option-disabled={option.disabled}
          role="option"
          aria-selected={option.value === value}
          disabled={option.disabled}
          onclick={() => choose(option)}
        >
          <span class="dropdown-option-copy">
            <span class="dropdown-option-label">{option.label}</span>
            {#if option.detail}<span class="dropdown-option-detail">{option.detail}</span>{/if}
          </span>
          {#if option.value === value}<Check size={15} strokeWidth={2.2} />{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dropdown-root { position: relative; display: inline-block; min-width: 0; max-width: 100%; vertical-align: middle; }
  .dropdown-full { display: block; width: 100%; }
  .dropdown-full .dropdown-menu { width:100%; min-width:100%; box-sizing:border-box; }
  .dropdown-trigger { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:37px; width:100%; border:1px solid var(--reddit-border,#343f42); border-radius:7px; background:var(--reddit-panel,#192529); padding:8px 11px; color:var(--reddit-text-strong,#e9edef); text-align:left; font-size:12px; font-weight:600; cursor:pointer; }
  .dropdown-trigger:hover, .dropdown-trigger[aria-expanded="true"] { border-color:#65777d; background:var(--reddit-hover,#253338); }
  .dropdown-current { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  :global(.dropdown-trigger svg) { flex:0 0 auto; color:var(--reddit-muted,#829196); transition:transform .12s; }
  :global(.dropdown-trigger svg.chevron-open) { transform:rotate(180deg); }
  .dropdown-menu { position:absolute; z-index:10000; top:calc(100% + 5px); left:0; min-width:100%; width:max-content; max-width:min(360px,calc(100vw - 24px)); max-height:min(320px,calc(100dvh - 120px)); overflow:auto; overscroll-behavior:contain; border:1px solid var(--reddit-border,#343f42); border-radius:9px; background:#182428; padding:4px; box-shadow:0 12px 34px rgba(0,0,0,.38); }
  .dropdown-menu.dropdown-align-right { left:auto; right:0; }
  .dropdown-menu button { display:flex; align-items:center; justify-content:space-between; gap:16px; width:100%; min-height:35px; border-radius:5px; padding:7px 9px; color:var(--reddit-text,#d7dadc); text-align:left; font-size:12px; cursor:pointer; }
  .dropdown-menu button:hover, .dropdown-menu button:focus-visible { outline:none; background:#293a3f; }
  .dropdown-menu button.dropdown-option-selected { color:var(--reddit-blue,#d7e7ea); }
  .dropdown-menu button.dropdown-option-disabled { opacity:.45; cursor:not-allowed; }
  .dropdown-option-copy { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .dropdown-option-label { font-weight:650; }
  .dropdown-option-detail { color:var(--reddit-muted,#829196); font-size:10px; white-space:normal; }
  :global(.dropdown-menu svg) { color:var(--reddit-blue,#d7e7ea); flex:0 0 auto; }
</style>
