<script lang="ts">
  import { onMount } from 'svelte';
  import { CalendarDays, Users, Video, MapPin, RefreshCw } from '@lucide/svelte';
  import { featureApiJson } from '$lib/client/feature-api.js';
  import { notify } from '$lib/client/notifications.js';
  type CommunityEvent = { id:string; communitySlug:string; communityName:string; title:string; description:string|null; eventType:'online'|'in_person'|'hybrid'; locationText:string|null; onlineUrl:string|null; startsAt:string; endsAt:string|null; timezone:string; capacity:number|null; visibility:string; goingCount:number; interestedCount:number; myRsvp:'going'|'interested'|null };
  let events = $state<CommunityEvent[]>([]);
  let loading = $state(true);
  let error = $state('');
  let busyId = $state('');
  async function loadEvents() {
    loading = true; error = '';
    try { const response = await featureApiJson<{ events: CommunityEvent[] }>('/events?limit=80'); events = response.events; }
    catch (e) { error = e instanceof Error ? e.message : 'Could not load events.'; }
    finally { loading = false; }
  }
  async function rsvp(item: CommunityEvent) {
    busyId = item.id;
    try {
      if (item.myRsvp) { await featureApiJson(`/events/${encodeURIComponent(item.id)}/rsvp`, { method: 'DELETE' }); events = events.map((e) => e.id === item.id ? { ...e, myRsvp: null, goingCount: e.goingCount - (item.myRsvp === 'going' ? 1 : 0), interestedCount: e.interestedCount - (item.myRsvp === 'interested' ? 1 : 0) } : e); notify('RSVP cancelled.', 'success'); }
      else { await featureApiJson(`/events/${encodeURIComponent(item.id)}/rsvp`, { method: 'PUT', body: JSON.stringify({ status: 'going' }) }); events = events.map((e) => e.id === item.id ? { ...e, myRsvp: 'going', goingCount: e.goingCount + 1 } : e); notify('You are going to this event.', 'success'); }
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not update RSVP.', 'error'); }
    finally { busyId = ''; }
  }
  function formatDate(value: string, timezone = 'UTC') { try { return new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short', timeZone:timezone }).format(new Date(value)); } catch { return new Date(value).toLocaleString(); } }
  onMount(() => { void loadEvents(); });
</script>

<svelte:head><title>Community events · Nexus</title><meta name="description" content="Meet up with communities on Nexus through game nights, study sessions, live streams, and gatherings." /></svelte:head>
<div class="mx-auto w-full max-w-[1500px] px-3 pb-20 sm:px-6">
  <header class="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
    <div><div class="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-300"><CalendarDays size={16}/> Community calendar</div><h1 class="text-3xl font-black tracking-tight text-white sm:text-4xl">Events and meetups</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Game nights, study halls, community AMAs, watch parties, tournaments, and real-world meetups.</p></div>
    <a href="/communities" class="rounded-full border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-200 hover:border-orange-300/40 hover:text-white">Find a community</a>
  </header>
  {#if error}<div class="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}<button class="ml-3 underline" onclick={() => void loadEvents()}>Retry</button></div>{/if}
  {#if loading}<div class="rounded-xl border border-white/10 bg-white/[.025] p-10 text-center text-sm text-slate-400">Loading upcoming events…</div>
  {:else if !events.length}<div class="rounded-xl border border-dashed border-white/15 bg-white/[.02] p-12 text-center"><CalendarDays size={34} class="mx-auto text-slate-500"/><h2 class="mt-3 font-bold text-white">Nothing scheduled just yet</h2><p class="mt-2 text-sm text-slate-400">Open a community and create the first meetup or online event.</p><a href="/communities" class="mt-4 inline-flex rounded-full bg-orange-400 px-4 py-2.5 text-sm font-extrabold text-slate-950">Browse communities</a></div>
  {:else}<div class="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{#each events as event (event.id)}
    <article class="flex min-w-0 flex-col rounded-xl border border-white/10 bg-[#101719] p-4 transition hover:border-white/20">
      <div class="flex items-center justify-between gap-3"><a href={`/c/${encodeURIComponent(event.communitySlug)}`} class="truncate text-xs font-bold text-orange-300 hover:text-orange-200">c/{event.communitySlug}</a><span class="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">{event.eventType.replace('_',' ')}</span></div>
      <h2 class="mt-3 text-lg font-extrabold leading-snug text-white">{event.title}</h2><p class="mt-2 line-clamp-3 text-sm leading-6 text-slate-400">{event.description || 'Community gathering.'}</p>
      <div class="mt-4 grid gap-2 text-xs text-slate-300"><div class="flex items-center gap-2"><CalendarDays size={15} class="shrink-0 text-orange-300"/>{formatDate(event.startsAt, event.timezone)}</div>{#if event.eventType !== 'in_person' && event.onlineUrl}<div class="flex items-center gap-2"><Video size={15} class="shrink-0 text-orange-300"/><a class="truncate underline decoration-white/20 underline-offset-2 hover:text-white" href={event.onlineUrl} target="_blank" rel="noopener noreferrer nofollow">Open meeting link</a></div>{/if}{#if event.locationText}<div class="flex items-center gap-2"><MapPin size={15} class="shrink-0 text-orange-300"/>{event.locationText}</div>{/if}<div class="flex items-center gap-2"><Users size={15} class="shrink-0 text-orange-300"/>{event.goingCount} going · {event.interestedCount} interested{#if event.capacity} · {event.capacity} seats{/if}</div></div>
      <div class="mt-5 flex items-center justify-between gap-3 border-t border-white/[.07] pt-3"><span class="truncate text-[11px] text-slate-500">{event.communityName}</span><button onclick={() => void rsvp(event)} disabled={busyId === event.id} class="rounded-full px-4 py-2 text-xs font-extrabold disabled:opacity-50 {event.myRsvp ? 'border border-white/15 text-slate-200 hover:border-rose-300/40 hover:text-rose-200' : 'bg-orange-400 text-slate-950 hover:bg-orange-300'}">{busyId === event.id ? 'Saving…' : event.myRsvp ? 'Cancel RSVP' : 'I’m going'}</button></div>
    </article>
  {/each}</div>{/if}
  <div class="mt-7 flex items-center gap-2 text-xs text-slate-600"><RefreshCw size={13}/> Events refresh when you reload; server push can be added with the dedicated realtime gateway described in the deployment guide.</div>
</div>
