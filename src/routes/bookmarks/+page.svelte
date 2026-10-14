<script lang="ts">
	import PostCard, { type PostSummary } from '$lib/components/ui/PostCard.svelte';
	const { data } = $props() as { data: { posts: PostSummary[]; viewer: { id: string; username: string; name: string } | null } };
</script>
<div class="mx-auto max-w-[900px] px-4 pb-14 sm:px-6">
	<div class="surface-card relative overflow-hidden rounded-[1.5rem] p-6 sm:p-8"><div class="absolute -right-8 -top-16 h-52 w-52 rounded-full bg-indigo-400/[0.08] blur-2xl"></div><div class="relative"><p class="text-[10px] font-extrabold uppercase tracking-[.16em] text-indigo-200">YOUR LIBRARY</p><h1 class="mt-2 text-3xl font-extrabold tracking-[-.04em] text-white">Saved for later.</h1><p class="mt-2 text-sm text-slate-400">A personal shelf for posts, ideas, and discussions worth coming back to.</p><p class="mt-5 text-xs text-slate-600">{data.posts.length} saved {data.posts.length === 1 ? 'post' : 'posts'}</p></div></div>
	<div class="mt-5 space-y-4">{#each data.posts as post (post.id)}<PostCard {post} viewerId={data.viewer?.id ?? null}/>{:else}<div class="surface-card rounded-[1.4rem] px-6 py-12 text-center"><div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-300/[0.07] text-2xl text-indigo-200">♧</div><h2 class="mt-4 font-extrabold text-white">Your saved posts live here</h2><p class="mt-2 text-sm text-slate-500">Use the bookmark icon on any post to keep it close.</p><a href="/" class="mt-5 inline-block rounded-xl bg-indigo-300 px-4 py-2.5 text-xs font-extrabold text-slate-950">Explore the feed ↗</a></div>{/each}</div>
</div>
