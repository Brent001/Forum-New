<script lang="ts">
	import Dropdown, { type DropdownOption } from '$lib/components/ui/Dropdown.svelte';
	import { uploadMediaFile } from '$lib/client/media-upload.js';
	import { notify, notifyOnNextPage } from '$lib/client/notifications.js';
	type Community = { id: string; name: string; slug: string; description: string | null; memberCount: number; category: string; communityType?: string; iconUrl: string | null; bannerUrl: string | null; isFeatured: boolean; isPrivate: boolean; isJoined: boolean };
	const { data } = $props() as { data: { communities: Community[]; viewer: { id: string; isOwner: boolean } | null; query: string } };
	let rows = $state(data.communities);
	let query = $state(data.query);
	let createOpen = $state(false);
	let name = $state('');
	let slug = $state('');
	let description = $state('');
	let category = $state('General');
	let communityType = $state('standard');
	let busy = $state(false);
	let notice = $state('');
	let iconUrl = $state('');
	let bannerUrl = $state('');
	let mediaUploading = $state(false);
	let mediaProgress = $state(0);
	const communityTypeOptions: DropdownOption[] = [{ value: 'standard', label: 'Standard forum' }, { value: 'gaming', label: 'Gaming community' }, { value: 'academic', label: 'Academic / study' }, { value: 'creative', label: 'Creative studio' }];
	const categoryOptions: DropdownOption[] = ['General','Technology','Gaming','Art & Design','Music','Learning','Entertainment','Questions','Local'].map((value) => ({ value, label: value }));
	function formatMembers(count: number) { return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(count); }
	function makeSlug(value: string) { return value.toLowerCase().trim().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-').replace(/^-|-$/g, '').slice(0, 30); }
	async function join(community: Community) {
		if (!data.viewer) return (window.location.href = '/login');
		try {
			const response = await fetch(`/api/communities/${community.id}/join`, { method: 'POST' }); const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not update membership.');
			rows = rows.map((row) => row.id === community.id ? { ...row, isJoined: result.joined, memberCount: Math.max(0, row.memberCount + (result.joined ? 1 : -1)) } : row); notify(result.joined ? `Joined c/${community.slug}.` : `Left c/${community.slug}.`, 'success');
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not update membership.'; notify(notice, 'error'); }
	}
	async function uploadCommunityAsset(file: File, kind: 'community-icon' | 'community-banner') {
		mediaUploading = true; mediaProgress = 0; notice = '';
		try {
			const asset = await uploadMediaFile(file, kind, { visibility: 'private', onProgress: (progress) => { mediaProgress = progress.total ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : 0; } });
			if (kind === 'community-icon') iconUrl = asset.url; else bannerUrl = asset.url;
			notify(kind === 'community-icon' ? 'Community icon uploaded.' : 'Community banner uploaded.', 'success');
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not upload community image.'; notify(notice, 'error'); }
		finally { mediaUploading = false; }
	}
	async function createCommunity() {
		if (!data.viewer) return (window.location.href = '/login');
		if (mediaUploading) { notice = 'Wait for the community image upload to finish.'; return; }
		busy = true; notice = '';
		try {
			const response = await fetch('/api/communities', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, slug: slug || makeSlug(name), description, category, communityType, iconUrl, bannerUrl }) });
			const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not create community.');
			notifyOnNextPage('Community created successfully.', 'success'); window.location.href = result.redirectTo;
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not create community.'; notify(notice, 'error'); }
		finally { busy = false; }
	}
</script>

<div class="mx-auto max-w-[1160px] px-4 pb-14 sm:px-6">
	<div class="community-hero surface-card relative overflow-hidden rounded-[1.7rem] p-6 sm:p-9">
		<div class="community-hero-glow"></div>
		<div class="relative z-10 max-w-2xl">
			<div class="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.15em] text-emerald-100"><span class="h-1.5 w-1.5 rounded-full bg-emerald-300"></span> Find your people</div>
			<h1 class="mt-4 text-3xl font-extrabold tracking-[-.045em] text-white sm:text-4xl">Communities make the feed yours.</h1>
			<p class="mt-3 max-w-xl text-sm leading-6 text-slate-400">Explore focused spaces, share your work, ask better questions, and meet people who care about the same things.</p>
			<div class="mt-6 flex flex-wrap gap-3"><button onclick={() => createOpen = !createOpen} class="rounded-xl bg-indigo-300 px-4 py-3 text-xs font-extrabold text-slate-950 transition hover:bg-indigo-200">＋ Create a community</button><a href="/?feed=trending" class="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs font-bold text-slate-200 transition hover:bg-white/[0.07]">Explore trending ↗</a></div>
		</div>
	</div>

	{#if createOpen}
		<section class="surface-card mt-5 rounded-[1.4rem] p-5 sm:p-6">
			<div class="flex items-start justify-between gap-4"><div><p class="text-[10px] font-bold uppercase tracking-[.17em] text-slate-600">COMMUNITY BUILDER</p><h2 class="mt-1 text-xl font-extrabold text-white">Create a new corner</h2></div><button onclick={() => createOpen = false} class="text-xl text-slate-500 hover:text-white" aria-label="Close">×</button></div>
			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				<label class="form-label">Community name<input bind:value={name} oninput={() => { if (!slug || slug === makeSlug(name.slice(0, -1))) slug = makeSlug(name); }} maxlength="60" placeholder="e.g. Indie Game Makers" class="form-input" /></label>
				<label class="form-label">URL slug<input bind:value={slug} oninput={() => slug = makeSlug(slug)} maxlength="30" placeholder="indie-game-makers" class="form-input" /><span class="mt-1 block text-[10px] text-slate-600">Your URL: /c/{slug || makeSlug(name) || 'your-community'}</span></label>
				<label class="form-label sm:col-span-2">What is this community about?<textarea bind:value={description} rows="3" maxlength="500" placeholder="Set expectations, topics, and the kind of discussion you want…" class="form-input"></textarea></label>
				<div class="form-label community-media-field"><span>Community icon</span>{#if iconUrl}<img class="community-icon-preview" src={iconUrl} alt="Community icon preview" loading="lazy" decoding="async" />{/if}<label class="community-image-pick">Choose icon<input type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" disabled={mediaUploading} onchange={(event) => { const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (file) void uploadCommunityAsset(file, 'community-icon'); (event.currentTarget as HTMLInputElement).value = ''; }} /></label><small>Square image · max 15 MB</small></div>
				<div class="form-label community-media-field"><span>Community banner</span>{#if bannerUrl}<img class="community-banner-preview" src={bannerUrl} alt="Community banner preview" loading="lazy" decoding="async" />{/if}<label class="community-image-pick">Choose banner<input type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" disabled={mediaUploading} onchange={(event) => { const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (file) void uploadCommunityAsset(file, 'community-banner'); (event.currentTarget as HTMLInputElement).value = ''; }} /></label><small>Wide cover image · max 15 MB</small></div>
				{#if mediaUploading}<div class="sm:col-span-2 community-media-progress" role="progressbar" aria-valuenow={mediaProgress} aria-valuemin="0" aria-valuemax="100"><div><span>Uploading image…</span><b>{mediaProgress}%</b></div><span><i style={`width:${mediaProgress}%`}></i></span></div>{/if}
				<label class="form-label">Community type<Dropdown label="Community type" value={communityType} options={communityTypeOptions} onChange={(value) => communityType = value} fullWidth /></label>
				<label class="form-label">Category<Dropdown label="Community category" value={category} options={categoryOptions} onChange={(value) => category = value} fullWidth /></label>
			</div>
			{#if notice}<p class="mt-3 text-xs text-rose-200" role="alert">{notice}</p>{/if}
			<div class="mt-4 flex justify-end"><button onclick={createCommunity} disabled={busy || mediaUploading} class="rounded-xl bg-indigo-300 px-4 py-2.5 text-xs font-extrabold text-slate-950 disabled:opacity-50">{busy ? 'Creating…' : 'Create community ↗'}</button></div>
		</section>
	{/if}

	<div class="mt-7 flex flex-wrap items-end justify-between gap-4"><div><p class="text-[10px] font-bold uppercase tracking-[.17em] text-slate-600">EXPLORE THE NETWORK</p><h2 class="mt-1.5 text-2xl font-extrabold text-white">All communities <span class="ml-1 text-base font-semibold text-slate-500">{rows.length}</span></h2></div><form action="/communities" method="GET" class="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5"><span class="text-slate-500">⌕</span><input bind:value={query} name="q" placeholder="Search communities" class="w-40 border-0 bg-transparent p-0 text-xs focus:ring-0 sm:w-56"/><button class="text-xs font-bold text-indigo-200">Search</button></form></div>
	{#if notice && !createOpen}<p class="mt-3 rounded-xl border border-rose-300/10 bg-rose-300/[0.04] px-4 py-3 text-xs text-rose-200">{notice}</p>{/if}
	<div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each rows as community (community.id)}
			<article class="community-card surface-card overflow-hidden rounded-[1.35rem]">
				<div class="community-cover">{#if community.bannerUrl}<img src={community.bannerUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />{/if}<span aria-hidden="true"></span></div>
				<div class="p-5"><div class="flex items-start gap-3"><div class="community-large-icon">{#if community.iconUrl}<img src={community.iconUrl} alt="" loading="lazy" decoding="async" class="h-full w-full rounded-xl object-cover"/>{:else}{community.name.slice(0, 1).toUpperCase()}{/if}</div><div class="min-w-0 flex-1 pt-1"><div class="flex flex-wrap items-center gap-2"><a href={`/c/${encodeURIComponent(community.slug)}`} class="truncate text-sm font-extrabold text-white hover:text-indigo-200">c/{community.slug}</a>{#if community.isFeatured}<span class="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-100">Featured</span>{/if}</div><p class="mt-1 text-[10px] uppercase tracking-wide text-slate-600">{community.category}{community.communityType && community.communityType !== 'standard' ? ` · ${community.communityType === 'gaming' ? 'Gaming hub' : community.communityType === 'academic' ? 'Academic' : 'Creative studio'}` : ''} · {formatMembers(community.memberCount)} members</p></div></div>
					<p class="mt-4 min-h-[3rem] text-xs leading-5 text-slate-400">{community.description || 'A space to share ideas and build conversations around this topic.'}</p>
					<div class="mt-5 flex items-center justify-between gap-3"><a href={`/c/${encodeURIComponent(community.slug)}`} class="text-xs font-bold text-indigo-200 hover:text-white">View community ↗</a>{#if community.isPrivate}<span class="text-[10px] text-slate-500">Private</span>{:else}<button onclick={() => join(community)} class={`rounded-xl px-3.5 py-2 text-[11px] font-extrabold transition ${community.isJoined ? 'border border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100 hover:bg-rose-300/[0.07] hover:text-rose-100' : 'bg-indigo-300 text-slate-950 hover:bg-indigo-200'}`}>{community.isJoined ? '✓ Joined' : '＋ Join'}</button>{/if}</div>
				</div>
			</article>
		{:else}
			<div class="surface-card col-span-full rounded-[1.4rem] px-5 py-12 text-center"><h3 class="font-bold text-white">No communities found</h3><p class="mt-2 text-xs text-slate-500">Try a different search or create the first space.</p></div>
		{/each}
	</div>
</div>

<style>
	.community-hero { isolation: isolate; }
	.special-type-badge { border:1px solid rgba(255,107,53,.25);border-radius:4px;padding:2px 5px;color:#ffab84;font-size:9px;text-transform:capitalize; }
	.community-hero-glow { position: absolute; inset: -100px -80px auto auto; width: 420px; height: 420px; background: radial-gradient(circle,rgba(112,132,255,.17),transparent 68%); pointer-events: none; }
	.community-cover { position:relative; height:70px; overflow:hidden; background:linear-gradient(115deg,rgba(255,69,0,.16),rgba(96,122,130,.08)),repeating-linear-gradient(135deg,transparent 0 17px,rgba(255,255,255,.018) 17px 18px); }
	.community-cover img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
	.community-cover span { position:absolute; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(8,11,18,.55),rgba(8,11,18,.1)); }
	.community-large-icon { display: flex; height: 46px; width: 46px; flex-shrink: 0; align-items: center; justify-content: center; margin-top: -26px; border: 3px solid #121827; border-radius: 15px; background: linear-gradient(140deg,#a5b4fc,#60dcc8); color: #0a1020; font-weight: 900; }
	.form-label { display: grid; gap: 7px; color: #a2adc1; font-size: 11px; font-weight: 700; }
	.form-input { width: 100%; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; background: rgba(0,0,0,.2); padding: 11px 12px; color: #e4e8f6; font-size: 13px; font-weight: 400; outline: none; }
	.form-input:focus { border-color: rgba(156,167,255,.35); box-shadow: 0 0 0 3px rgba(129,140,248,.05); }
	.form-input::placeholder { color: #566176; }

	.community-media-field{min-width:0;padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(0,0,0,.12)}.community-icon-preview{width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid #34474c}.community-banner-preview{width:100%;max-width:360px;height:74px;border-radius:8px;object-fit:cover;border:1px solid #34474c}.community-image-pick{display:inline-flex;align-self:flex-start;position:relative;overflow:hidden;border:1px solid #435258;border-radius:6px;background:#1b292d;padding:7px 10px;color:#e2e8ea;font-size:11px;font-weight:750;cursor:pointer}.community-image-pick input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.community-media-field small{font-size:10px;color:#7d8d92;font-weight:400}.community-media-progress{border:1px solid #34474c;border-radius:8px;padding:10px;background:#0f1b1f}.community-media-progress>div{display:flex;justify-content:space-between;color:#bac6c9;font-size:10px}.community-media-progress b{color:#ff8656}.community-media-progress>span{display:block;height:5px;margin-top:7px;border-radius:99px;background:#2b3b40;overflow:hidden}.community-media-progress i{display:block;height:100%;background:#ff6b35;border-radius:99px}
</style>
