<script lang="ts">
	import VerifiedBadge from '$lib/components/ui/VerifiedBadge.svelte';
	const { data } = $props() as { data: { query: string; posts: Array<{ id: string; title: string; body: string; score: number; commentCount: number; createdAt: Date | string; username: string; communitySlug: string; communityName: string }>; communities: Array<{ id: string; name: string; slug: string; description: string | null; category: string; memberCount: number }>; people: Array<{ id: string; username: string; displayName: string; bio: string | null; avatarUrl: string | null; isVerified: boolean; karma: number }>; viewer: { id: string; username: string } | null } };
	let search = $state(data.query);
	function compact(value: number) { return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0); }
</script>

<div class="mx-auto max-w-[1100px] px-4 pb-16 sm:px-6">
	<header class="surface-card relative overflow-hidden rounded-[1.6rem] p-6 sm:p-8"><div class="search-glow"></div><div class="relative"><p class="text-[10px] font-extrabold uppercase tracking-[.18em] text-indigo-200">EXPLORE NEXUS</p><h1 class="mt-2 text-3xl font-black tracking-[-.05em] text-white">Find your next conversation.</h1><p class="mt-2 text-sm text-slate-500">Search posts, people and communities in one place.</p><form action="/search" method="GET" class="mt-5 flex max-w-2xl gap-2"><input bind:value={search} name="q" type="search" minlength="2" placeholder="Try a topic, username, or community" class="search-input min-w-0 flex-1 rounded-xl px-4 py-3 text-sm"/><button class="rounded-xl bg-indigo-300 px-5 py-3 text-xs font-extrabold text-slate-950 transition hover:bg-indigo-200">Search ↗</button></form></div></header>
	{#if data.query.length < 2}
		<div class="surface-card mt-5 rounded-2xl p-8 text-center"><p class="text-sm font-bold text-white">What are you interested in?</p><p class="mt-2 text-xs leading-5 text-slate-500">Enter at least two characters to search the community.</p><div class="mt-4 flex flex-wrap justify-center gap-2"><a class="search-chip" href="/?feed=trending">Trending posts</a><a class="search-chip" href="/communities">Explore communities</a></div></div>
	{:else}
		<p class="mb-4 mt-6 text-xs text-slate-500">Results for <span class="font-bold text-slate-200">“{data.query}”</span></p>
		<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
			<div class="space-y-5">
				<section class="surface-card rounded-[1.35rem] p-4 sm:p-5"><div class="mb-3 flex items-center justify-between"><h2 class="text-sm font-extrabold text-white">Posts</h2><span class="text-[10px] text-slate-600">{data.posts.length} found</span></div><div class="divide-y divide-white/[0.06]">{#each data.posts as post (post.id)}<a href={`/post/${post.id}`} class="search-result block rounded-xl px-3 py-4 transition hover:bg-white/[0.025]"><p class="text-sm font-bold leading-6 text-slate-100">{post.title}</p>{#if post.body}<p class="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{post.body}</p>{/if}<div class="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-600"><span>c/{post.communitySlug}</span><span>·</span><span>@{post.username}</span><span>·</span><span>{compact(post.score)} points</span><span>·</span><span>{compact(post.commentCount)} replies</span></div></a>{:else}<p class="py-8 text-center text-xs text-slate-600">No posts matched this search.</p>{/each}</div></section>
			</div>
			<div class="space-y-5">
				<section class="surface-card rounded-[1.35rem] p-4"><div class="mb-3 flex items-center justify-between"><h2 class="text-sm font-extrabold text-white">Communities</h2><a href="/communities" class="text-[10px] font-bold text-indigo-200">Explore all ↗</a></div><div class="space-y-1">{#each data.communities as community (community.id)}<a href={`/c/${community.slug}`} class="flex items-start gap-3 rounded-xl p-3 transition hover:bg-white/[0.03]"><span class="community-mark">c/</span><span class="min-w-0 flex-1"><b class="block text-xs text-slate-200">{community.name}</b><span class="mt-1 block text-[10px] text-slate-600">c/{community.slug} · {compact(community.memberCount)} members</span>{#if community.description}<span class="mt-1 block line-clamp-2 text-[10px] leading-4 text-slate-500">{community.description}</span>{/if}</span></a>{:else}<p class="px-3 py-5 text-center text-xs text-slate-600">No public communities matched.</p>{/each}</div></section>
				<section class="surface-card rounded-[1.35rem] p-4"><div class="mb-3 flex items-center justify-between"><h2 class="text-sm font-extrabold text-white">People</h2><span class="text-[10px] text-slate-600">{data.people.length} found</span></div><div class="space-y-1">{#each data.people as person (person.id)}<a href={`/u/${encodeURIComponent(person.username)}`} class="flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/[0.03]">{#if person.avatarUrl}<img src={person.avatarUrl} alt="" class="h-9 w-9 rounded-full object-cover"/>{:else}<span class="person-mark">{(person.displayName[0] || 'M').toUpperCase()}</span>{/if}<span class="min-w-0 flex-1"><b class="block truncate text-xs text-slate-200">{person.displayName} {#if person.isVerified}<VerifiedBadge size={14}/>{/if}</b><span class="mt-1 block text-[10px] text-slate-600">@{person.username} · {compact(person.karma)} karma</span>{#if person.bio}<span class="mt-1 block line-clamp-2 text-[10px] leading-4 text-slate-500">{person.bio}</span>{/if}</span></a>{:else}<p class="px-3 py-5 text-center text-xs text-slate-600">No people matched.</p>{/each}</div></section>
			</div>
		</div>
	{/if}
</div>
<style>
	.search-glow { position:absolute; top:-180px; right:-50px; width:380px; height:380px; border-radius:50%; background:radial-gradient(circle,rgba(134,139,255,.14),transparent 68%); }
	.search-input { border:1px solid rgba(255,255,255,.09); background:rgba(0,0,0,.17); color:#edf0fb; outline:none; }
	.search-input:focus { border-color:rgba(157,167,255,.35); }
	.search-chip { border:1px solid rgba(255,255,255,.08); border-radius:999px; padding:8px 12px; color:#aab5cb; font-size:11px; }
	.search-chip:hover { border-color:rgba(157,167,255,.24); color:#e6eaff; }
	.search-result:hover { margin-inline:-.25rem; padding-inline:1rem; }
	.community-mark,.person-mark { display:inline-flex; height:34px; width:34px; flex-shrink:0; align-items:center; justify-content:center; border-radius:12px; border:1px solid rgba(146,155,255,.13); background:rgba(133,143,255,.08); color:#b7beff; font-size:11px; font-weight:900; }
	.person-mark { border-radius:50%; background:linear-gradient(135deg,#b1baff,#7adccd); color:#0b1020; }
</style>
