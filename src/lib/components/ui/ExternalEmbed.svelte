<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { ExternalLink, Gamepad2, Headphones, Play } from '@lucide/svelte';
  import { buildExternalEmbed } from '$lib/utils/external-embeds';

  let { url, title = 'Embedded content' } = $props<{ url: string; title?: string }>();
  function configuredParent() {
    try { return env.PUBLIC_SITE_URL ? new URL(env.PUBLIC_SITE_URL).hostname : ''; }
    catch { return ''; }
  }
  let parentDomain = $state(configuredParent());
  const embed = $derived(buildExternalEmbed(url, parentDomain));

  onMount(() => {
    // Twitch validates this value against the page's real host; never use the user-provided URL host.
    parentDomain = window.location.hostname;
  });

  const frameTitle = $derived(`${embed?.provider ?? 'External'}: ${title}`);
</script>

{#if embed}
  <section class={`external-embed external-embed-${embed.kind}`} aria-label={`${embed.provider} embed`}>
    <header class="external-embed-header">
      <span class="external-embed-provider-icon">
        {#if embed.mode === 'audio'}<Headphones size={14} />{:else if embed.mode === 'playground'}<Gamepad2 size={14} />{:else}<Play size={14} />{/if}
      </span>
      <span class="external-embed-provider">{embed.provider}</span>
      <a href={embed.externalUrl} target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" class="external-embed-open" aria-label={`Open on ${embed.provider}`}>
        Open <ExternalLink size={12} />
      </a>
    </header>
    <div class:embed-audio={embed.mode === 'audio'} class:embed-playground={embed.mode === 'playground'} class:embed-twitch={embed.kind === 'twitch'} class="external-embed-frame" style={`--embed-height:${embed.height}px;${embed.ratio ? `--embed-ratio:${embed.ratio};` : ''}${embed.minWidth ? `--embed-min-width:${embed.minWidth}px;` : ''}${embed.minHeight ? `--embed-min-height:${embed.minHeight}px;` : ''}`}>
      <iframe
        src={embed.src}
        title={frameTitle}
        loading="lazy"
        referrerpolicy="no-referrer"
        allow={embed.allow}
        allowfullscreen
        sandbox={embed.sandbox}
        scrolling={embed.mode === 'playground' ? 'no' : undefined}
      ></iframe>
    </div>
  </section>
{:else}
  <section class="external-embed external-embed-pending" aria-label="External player">
    <div class="external-embed-pending-copy">Preparing secure embed…</div>
    <a href={url} target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open original link <ExternalLink size={12} /></a>
  </section>
{/if}

<style>
  .external-embed { width:100%; min-width:0; margin-top:12px; overflow:hidden; border:1px solid var(--reddit-border,#343f42); border-radius:9px; background:#080d0f; color:var(--reddit-text,#d7dadc); }
  .external-embed-header { display:flex; align-items:center; gap:7px; min-height:34px; padding:0 10px; background:rgba(255,255,255,.025); border-bottom:1px solid rgba(255,255,255,.055); }
  .external-embed-provider-icon { display:inline-flex; align-items:center; justify-content:center; color:var(--reddit-orange,#ff4500); }
  .external-embed-provider { font-size:10px; font-weight:800; letter-spacing:.02em; }
  .external-embed-open { display:inline-flex; align-items:center; gap:5px; margin-left:auto; color:var(--reddit-muted,#829196); font-size:10px; font-weight:650; }
  .external-embed-open:hover { color:var(--reddit-text-strong,#f2f4f5); }
  .external-embed-frame { position:relative; width:100%; aspect-ratio:var(--embed-ratio,16 / 9); min-width:0; min-height:0; overflow:hidden; background:#000; }
  .external-embed-frame iframe { position:absolute; inset:0; display:block; width:100%; height:100%; border:0; background:#000; }
  .external-embed-frame.embed-audio { height:var(--embed-height); aspect-ratio:auto; }
  .external-embed-spotify .external-embed-frame.embed-audio { height:var(--embed-height); }
  .external-embed-frame.embed-playground { height:var(--embed-height); aspect-ratio:auto; background:#101315; }
  .external-embed-frame.embed-playground iframe { color-scheme:normal; }
  .external-embed-frame.embed-twitch { min-height:var(--embed-min-height,300px); }
  .external-embed-twitch .external-embed-frame { min-height:var(--embed-min-height,300px); overflow-x:auto; overflow-y:hidden; }
  .external-embed-twitch .external-embed-frame iframe { min-width:var(--embed-min-width,400px); }
  .external-embed-pending { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:14px; font-size:11px; }
  .external-embed-pending-copy { color:var(--reddit-muted,#829196); }
  .external-embed-pending a { display:inline-flex; align-items:center; gap:4px; color:var(--reddit-orange,#ff4500); }
  @media(max-width:480px) {
    .external-embed-header { min-height:32px; }
    .external-embed-frame.embed-playground { height: min(var(--embed-height), 86vw); min-height:300px; }
    .external-embed-frame.embed-audio { min-height:0; }
  }
</style>
