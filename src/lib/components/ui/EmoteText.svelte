<script lang="ts">
  export type CommunityEmote = { id?: string; code: string; imageUrl: string; isAnimated?: boolean };
  let { text = '', emotes = [], class: className = '' } = $props<{ text?: string; emotes?: CommunityEmote[]; class?: string }>();
  const segments = $derived.by(() => {
    const byCode = new Map(emotes.map((emote) => [emote.code.toLowerCase(), emote]));
    return String(text ?? '').split(/(:[a-z0-9_]{2,24}:)/gi).map((part) => {
      const match = part.match(/^:([a-z0-9_]{2,24}):$/i);
      const emote = match ? byCode.get(match[1].toLowerCase()) : undefined;
      return emote ? { text: part, emote } : { text: part, emote: null };
    });
  });
</script>

<span class={`emote-text ${className}`}>
  {#each segments as segment, index (`${index}-${segment.text}`)}
    {#if segment.emote}
      <img class="community-inline-emote" src={segment.emote.imageUrl} alt={`:${segment.emote.code}:`} title={`:${segment.emote.code}:`} loading="lazy" />
    {:else}
      {segment.text}
    {/if}
  {/each}
</span>

<style>
  .community-inline-emote { display:inline-block; width:1.8em; height:1.8em; margin:0 .08em; vertical-align:-.42em; object-fit:contain; }
  .emote-text { overflow-wrap:anywhere; }
</style>
