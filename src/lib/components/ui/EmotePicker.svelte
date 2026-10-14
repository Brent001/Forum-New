<script lang="ts">
  import { Smile, X } from '@lucide/svelte';
  import type { CommunityEmote } from './EmoteText.svelte';
  let { emotes = [], onSelect, label = 'Community emotes', disabled = false } = $props<{ emotes?: CommunityEmote[]; onSelect: (shortcode: string) => void; label?: string; disabled?: boolean }>();
  let open = $state(false);
  let search = $state('');
  const filtered = $derived(emotes.filter((emote) => emote.code.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 120));
  function choose(emote: CommunityEmote) { onSelect(`:${emote.code}:`); open = false; }
</script>

<div class="emote-picker-wrap">
  <button type="button" class="emote-trigger" aria-expanded={open} disabled={disabled || !emotes.length} onclick={() => open = !open} title={emotes.length ? label : 'This community has no custom emotes yet'}>
    <Smile size={15} /> <span>{label}</span>{#if emotes.length}<small>{emotes.length}</small>{/if}
  </button>
  {#if open}
    <div class="emote-picker-panel" role="dialog" aria-label={label}>
      <div class="emote-picker-head"><strong>{label}</strong><button type="button" class="emote-close" aria-label="Close emotes" onclick={() => open = false}><X size={14}/></button></div>
      <input bind:value={search} class="emote-search" placeholder="Find an emote" aria-label="Search community emotes" />
      {#if filtered.length}
        <div class="emote-grid">{#each filtered as emote (emote.id ?? emote.code)}<button type="button" class="emote-option" title={`:${emote.code}:`} aria-label={`Insert ${emote.code}`} onclick={() => choose(emote)}><img src={emote.imageUrl} alt="" loading="lazy"/><span>:{emote.code}:</span></button>{/each}</div>
      {:else}
        <p class="emote-empty">No matching emotes yet.</p>
      {/if}
      <p class="emote-foot">Click an emote to insert its shortcode.</p>
    </div>
  {/if}
</div>

<style>
  .emote-picker-wrap { position:relative; display:inline-block; }
  .emote-trigger { display:inline-flex; align-items:center; gap:7px; min-height:34px; border:1px solid var(--reddit-border,#2a393e); border-radius:8px; background:var(--reddit-panel,#0f1b1f); padding:7px 10px; color:var(--reddit-text,#d7dadc); font-size:11px; font-weight:700; }
  .emote-trigger:hover:not(:disabled) { border-color:#ffb000; background:var(--reddit-hover,#223237); }
  .emote-trigger:disabled { opacity:.55; cursor:not-allowed; }
  .emote-trigger small { display:inline-flex; align-items:center; justify-content:center; min-width:19px; height:19px; border-radius:5px; background:var(--reddit-hover,#223237); font-size:10px; }
  .emote-picker-panel { position:absolute; z-index:100; left:0; bottom:calc(100% + 8px); width:min(340px, calc(100vw - 30px)); max-height:min(360px, 60vh); overflow:auto; border:1px solid var(--reddit-border,#2a393e); border-radius:12px; padding:11px; background:#111d20; box-shadow:0 16px 50px #0009; }
  .emote-picker-head { display:flex; align-items:center; justify-content:space-between; gap:8px; color:var(--reddit-text-strong,#f2f4f5); font-size:12px; }
  .emote-close { display:grid; place-items:center; width:27px; height:27px; border-radius:6px; color:var(--reddit-muted,#91a0a5); }
  .emote-close:hover { background:var(--reddit-hover,#223237); color:white; }
  .emote-search { width:100%; margin:8px 0 10px; border:1px solid var(--reddit-border,#2a393e); border-radius:7px; background:#0b1416; padding:8px 9px; color:var(--reddit-text-strong,#f2f4f5); font-size:12px; outline:0; }
  .emote-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:5px; }
  .emote-option { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; gap:5px; padding:8px 3px; border-radius:7px; color:var(--reddit-muted,#91a0a5); }
  .emote-option:hover { background:var(--reddit-hover,#223237); color:white; }
  .emote-option img { width:36px; height:36px; object-fit:contain; }
  .emote-option span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:9px; }
  .emote-empty,.emote-foot { padding:8px 0 2px; color:var(--reddit-muted,#91a0a5); font-size:10px; line-height:1.5; }
</style>
