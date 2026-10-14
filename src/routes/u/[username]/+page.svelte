<script lang="ts">
	import PostCard, { type PostSummary } from '$lib/components/ui/PostCard.svelte';
	import VerifiedBadge from '$lib/components/ui/VerifiedBadge.svelte';
	import KarmaProgress from '$lib/components/ui/KarmaProgress.svelte';
	type Profile = { id: string; username: string | null; name: string; bio: string | null; avatarUrl: string | null; bannerUrl: string | null; createdAt: Date | string; role: string; isVerified: boolean; karma: number; postKarma: number; commentKarma: number; isOwner: boolean; followers: number; following: number; postCount: number; commentCount: number; isFollowing: boolean; isBlocked: boolean; isMuted: boolean };
	const { data } = $props() as { data: { profile: Profile; posts: PostSummary[]; viewer: { id: string; username: string; name: string; isOwner: boolean } | null } };
	let following = $state(data.profile.isFollowing); let blocked = $state(data.profile.isBlocked); let muted = $state(data.profile.isMuted); let notice = $state('');
	function count(value: number) { return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0); }
	async function follow() {
		if (!data.viewer) return (window.location.href = '/login');
		try { const response = await fetch(`/api/users/${data.profile.id}/follow`, { method: 'POST' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not update follow.'); following = result.following; }
		catch (error) { notice = error instanceof Error ? error.message : 'Could not update follow.'; }
	}
	async function safety(action: 'mute' | 'unmute' | 'block' | 'unblock') {
		if (!data.viewer) return (window.location.href = '/login');
		if (action === 'block' && !window.confirm(`Block @${data.profile.username}? Their posts will be hidden from your feed.`)) return;
		try { const response = await fetch(`/api/users/${data.profile.id}/safety`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not update account controls.'); if (action === 'mute' || action === 'unmute') muted = result.muted; else blocked = result.blocked; notice = action.includes('block') ? (blocked ? 'This account is now blocked.' : 'This account is unblocked.') : (muted ? 'This account is muted.' : 'This account is unmuted.'); }
		catch (error) { notice = error instanceof Error ? error.message : 'Could not update account controls.'; }
	}
</script>

<div class="mx-auto max-w-[1020px] px-4 pb-14 sm:px-6">
	<section class="surface-card overflow-hidden rounded-[1.55rem]">
		<div class="profile-banner">{#if data.profile.bannerUrl}<img src={data.profile.bannerUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />{/if}<span aria-hidden="true"></span></div>
		<div class="px-5 pb-6 sm:px-7">
			<div class="-mt-10 flex flex-col gap-4 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
				<div class="flex min-w-0 items-end gap-4">
					{#if data.profile.avatarUrl}<img src={data.profile.avatarUrl} alt="" loading="lazy" decoding="async" class="profile-avatar" />{:else}<span class="profile-avatar flex items-center justify-center">{data.profile.name[0]?.toUpperCase() || 'M'}</span>{/if}
					<div class="min-w-0 pb-1"><div class="flex flex-wrap items-center gap-2"><h1 class="truncate text-2xl font-extrabold tracking-[-.04em] text-white">{data.profile.name}</h1>{#if data.profile.isVerified}<VerifiedBadge size={21} label="Nexus verified account"/>{/if}{#if data.profile.isOwner}<span class="rounded-full border border-violet-300/15 bg-violet-300/[0.06] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-violet-100">Owner</span>{/if}</div><p class="mt-1 text-xs text-slate-500">@{data.profile.username}</p></div>
				</div>
				{#if data.viewer?.id === data.profile.id}<a href="/settings" class="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/[0.08]">Edit profile ↗</a>{:else if data.viewer}<div class="flex flex-wrap gap-2"><button onclick={follow} class={`rounded-xl px-4 py-2.5 text-xs font-extrabold ${following ? 'border border-white/10 bg-white/[0.04] text-slate-200' : 'bg-indigo-300 text-slate-950'}`}>{following ? 'Following' : 'Follow'}</button><button onclick={() => safety(muted ? 'unmute' : 'mute')} class="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-slate-400 hover:text-white">{muted ? 'Unmute' : 'Mute'}</button><button onclick={() => safety(blocked ? 'unblock' : 'block')} class="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-slate-400 hover:text-rose-200">{blocked ? 'Unblock' : 'Block'}</button></div>{:else}<a href="/login" class="rounded-xl bg-indigo-300 px-4 py-2.5 text-xs font-extrabold text-slate-950">Follow</a>{/if}
			</div>
			{#if data.profile.bio}<p class="mt-5 max-w-2xl whitespace-pre-line text-sm leading-6 text-slate-300">{data.profile.bio}</p>{:else}<p class="mt-5 text-sm text-slate-600">No bio yet.</p>{/if}
			<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"><span>◷ Joined {new Date(data.profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><span>✦ {count(data.profile.karma)} total karma</span></div>
			<div class="mt-5 flex flex-wrap gap-5 border-t border-white/[0.06] pt-4 text-xs"><span><b class="text-white">{count(data.profile.postCount)}</b> <span class="text-slate-500">posts</span></span><span><b class="text-white">{count(data.profile.followers)}</b> <span class="text-slate-500">followers</span></span><span><b class="text-white">{count(data.profile.following)}</b> <span class="text-slate-500">following</span></span><span><b class="text-white">{count(data.profile.commentCount)}</b> <span class="text-slate-500">replies</span></span></div>
		</div>
	</section>
	<div class="mt-4"><KarmaProgress total={data.profile.karma} post={data.profile.postKarma} comment={data.profile.commentKarma}/></div>
	{#if notice}<p class="mt-3 rounded-xl border border-indigo-300/10 bg-indigo-300/[0.035] px-4 py-3 text-xs text-indigo-100" role="status">{notice}</p>{/if}
	<div class="mt-6 flex items-end justify-between gap-3 px-1"><div><p class="text-[10px] font-bold uppercase tracking-[.16em] text-slate-600">PUBLIC ACTIVITY</p><h2 class="mt-1.5 text-xl font-extrabold text-white">Posts by {data.profile.name}</h2></div><span class="rounded-full border border-white/[0.07] px-3 py-1.5 text-[10px] text-slate-500">{data.posts.length} posts</span></div>
	<div class="mt-4 space-y-4">{#each data.posts as post (post.id)}<PostCard {post} viewerId={data.viewer?.id ?? null}/>{:else}<div class="surface-card rounded-[1.4rem] px-6 py-12 text-center"><h3 class="font-bold text-white">No posts yet</h3><p class="mt-2 text-xs text-slate-500">Their public posts will show up here.</p></div>{/each}</div>
</div>
<style>
	.profile-banner { position:relative; height:150px; overflow:hidden; background:linear-gradient(112deg,rgba(120,130,255,.17),rgba(72,214,197,.07)),repeating-linear-gradient(135deg,transparent 0 18px,rgba(255,255,255,.014) 18px 19px); }
	.profile-banner img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
	.profile-banner span { position:absolute; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(8,11,18,.45),rgba(8,11,18,.05)); }
	.profile-avatar { display:flex; height:86px; width:86px; flex-shrink:0; align-items:center; justify-content:center; border:4px solid #141a29; border-radius:50%; background:linear-gradient(140deg,#a5b4fc,#5ddbc8); color:#0b1220; font-size:26px; font-weight:900; object-fit:cover; box-shadow:0 8px 30px rgba(0,0,0,.25); }
</style>
