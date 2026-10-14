<script lang="ts">
	import { ArrowUpRight, Bell, Bookmark, ChartNoAxesColumn, Clock3, Compass, Flame, Home, Image as ImageIcon, Link2, Mail, Menu, Music, Plus, Search, Settings, Sparkles, TrendingUp, UserRound, Users, Video, X, Upload, FileText } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import Dropdown, { type DropdownOption } from '$lib/components/ui/Dropdown.svelte';
	import PostCard, { type PostSummary } from '$lib/components/ui/PostCard.svelte';
	import VerifiedBadge from '$lib/components/ui/VerifiedBadge.svelte';
	import EmotePicker from '$lib/components/ui/EmotePicker.svelte';
	import type { CommunityEmote } from '$lib/components/ui/EmoteText.svelte';
	import { uploadMediaFiles } from '$lib/client/media-upload.js';
	import { notify } from '$lib/client/notifications.js';
	import { queuePostWithMedia } from '$lib/client/background-tasks.js';

	type Community = { id: string; name: string; slug: string; description: string | null; memberCount: number; category: string; iconUrl: string | null; isJoined: boolean };
	type Person = { id: string; username: string; name: string; bio: string | null; avatarUrl: string | null; isVerified: boolean; role: string; followers: number };
	const { data } = $props() as {
		data: {
			posts: PostSummary[];
			communities: Community[];
			people: Person[];
			viewer: { id: string; username: string; name: string; isOwner: boolean; isAdmin: boolean } | null;
			site: { name: string; tagline: string };
			mode: string;
			query: string;
			databaseReady: boolean;
		};
	};

	let communities = $state(data.communities);
	let people = $state(data.people);
	let composerOpen = $state(false);
	let postTitle = $state('');
	let postBody = $state('');
	let postUrl = $state('');
	let communitySlug = $state('');
	let composerEmotes = $state<CommunityEmote[]>([]);
	let emoteLoadToken = 0;
	let postType = $state('discussion');
	let pollOptions = $state(['', '']);
	let publishing = $state(false);
	let selectedFiles = $state<File[]>([]);
	let uploadedAssetIds = $state<string[]>([]);
	let uploadBusy = $state(false);
	let uploadPercent = $state(0);
	let uploadStage = $state('');
	let pageNotice = $state('');
	let searchTerm = $state(data.query ?? '');
	let mobileSidebarOpen = $state(false);

	onMount(() => {
		const openFromNav = () => {
			if (!data.viewer) { window.location.href = '/login'; return; }
			composerOpen = true;
			postType = 'discussion';
			window.setTimeout(() => document.getElementById('composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
		};
		window.addEventListener('nexus:compose', openFromNav);
		const params = new URLSearchParams(window.location.search);
		if (params.get('compose') === '1') {
			if (data.viewer) {
				openFromNav();
				const kind = params.get('type');
				if (kind && ['discussion', 'media', 'link', 'poll'].includes(kind)) postType = kind;
			} else window.location.href = '/login';
		}
		return () => window.removeEventListener('nexus:compose', openFromNav);
	});

	const trendingPosts = $derived([...data.posts].sort((a, b) => (b.comments * 2 + b.upvotes + b.shares) - (a.comments * 2 + a.upvotes + a.shares)).slice(0, 4));
	const communityOptions = $derived<DropdownOption[]>([{ value: '', label: 'Your profile', detail: 'Post to your profile' }, ...communities.map((community) => ({ value: community.slug, label: `c/${community.slug}`, detail: community.name }))]);

	function memberCount(count: number) {
		return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(count ?? 0);
	}
	function addPollOption() {
		if (pollOptions.length < 6) pollOptions = [...pollOptions, ''];
	}
	function removePollOption(index: number) {
		if (pollOptions.length > 2) pollOptions = pollOptions.filter((_, i) => i !== index);
	}
	function insertComposerEmote(shortcode: string) {
		postBody = `${postBody}${postBody && !postBody.endsWith(' ') ? ' ' : ''}${shortcode} `;
	}
	async function selectComposerCommunity(value: string) {
		communitySlug = value;
		const token = ++emoteLoadToken;
		const community = communities.find((item) => item.slug === value);
		if (!community) { composerEmotes = []; return; }
		try {
			const response = await fetch(`/api/communities/${community.id}/emotes`);
			const result = await response.json();
			if (token !== emoteLoadToken) return;
			composerEmotes = response.ok && Array.isArray(result.emotes) ? result.emotes.map((item: CommunityEmote) => ({ ...item, imageUrl: item.imageUrl || (item.id ? `/api/media/${item.id}` : '') })).filter((item: CommunityEmote) => Boolean(item.imageUrl)) : [];
		} catch { if (token === emoteLoadToken) composerEmotes = []; }
	}
	async function uploadPostFiles(): Promise<boolean> {
		if (!selectedFiles.length) return true;
		uploadBusy = true; uploadPercent = 0; uploadStage = 'Preparing upload'; pageNotice = '';
		try {
			const assets = await uploadMediaFiles(selectedFiles, 'post', {
				communityId: communities.find((community) => community.slug === communitySlug)?.id,
				onProgress: (progress) => { uploadPercent = progress.total ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : 0; },
				onStage: (stage) => { uploadStage = stage; }
			});
			uploadedAssetIds = [...uploadedAssetIds, ...assets.map((asset) => asset.assetId)];
			selectedFiles = []; pageNotice = 'Media uploaded and ready to attach.'; notify('Media uploaded and ready to attach.', 'success');
			return true;
		} catch (error) { pageNotice = error instanceof Error ? error.message : 'Media upload failed.'; notify(pageNotice, 'error'); return false; }
		finally { uploadBusy = false; uploadStage = ''; }
	}
	function publishInBackground() {
		if (!data.viewer) return (window.location.href = '/login');
		if (!selectedFiles.length) { pageNotice = 'Choose a file before continuing in the background.'; return; }
		if (postTitle.trim().length < 3) { pageNotice = 'Add a title with at least 3 characters.'; return; }
		if (postType === 'link' && !postUrl.trim()) { pageNotice = 'Add the link you want to share.'; return; }
		if (postType === 'poll' && pollOptions.filter((option) => option.trim()).length < 2) { pageNotice = 'Add at least two poll options.'; return; }
		queuePostWithMedia({ title: postTitle.trim(), body: postBody, url: postType === 'link' ? postUrl.trim() : '', postType: postType === 'media' ? 'discussion' : postType, communitySlug, communityId: communities.find((community) => community.slug === communitySlug)?.id, pollOptions: pollOptions.filter((option) => option.trim()), mediaAssetIds: uploadedAssetIds }, selectedFiles);
		selectedFiles = []; uploadedAssetIds = []; postTitle = ''; postBody = ''; postUrl = ''; pollOptions = ['', '']; composerOpen = false; pageNotice = '';
	}

	async function publishPost() {
		if (!data.viewer) return (window.location.href = '/login');
		if (!postTitle.trim()) { pageNotice = 'Add a title before publishing.'; return; }
		if (postType === 'link' && !postUrl.trim()) { pageNotice = 'Add the link you want to share.'; return; }
		if (postType === 'poll' && pollOptions.filter((option) => option.trim()).length < 2) { pageNotice = 'Add at least two poll options.'; return; }
		if (postType === 'media' && !selectedFiles.length && !uploadedAssetIds.length) { pageNotice = 'Choose at least one image, video, or audio file.'; return; }
		publishing = true;
		pageNotice = '';
		try {
			if (selectedFiles.length && !(await uploadPostFiles())) return;
			const response = await fetch('/api/posts', {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: postTitle, body: postBody, url: postType === 'link' ? postUrl : '', postType: postType === 'media' ? 'discussion' : postType, communitySlug, pollOptions: pollOptions.filter((option) => option.trim()), mediaAssetIds: uploadedAssetIds })
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Your post could not be published.');
			window.location.href = result.redirectTo || `/post/${result.id}`;
		} catch (error) {
			pageNotice = error instanceof Error ? error.message : 'Your post could not be published.';
		} finally { publishing = false; }
	}
	async function toggleCommunity(community: Community) {
		if (!data.viewer) return (window.location.href = '/login');
		try {
			const response = await fetch(`/api/communities/${community.id}/join`, { method: 'POST' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Unable to update membership.');
			communities = communities.map((item) => item.id === community.id ? { ...item, isJoined: result.joined, memberCount: Math.max(0, item.memberCount + (result.joined ? 1 : -1)) } : item);
		} catch (error) { pageNotice = error instanceof Error ? error.message : 'Unable to update membership.'; }
	}
	async function followPerson(person: Person) {
		if (!data.viewer) return (window.location.href = '/login');
		try {
			const response = await fetch(`/api/users/${person.id}/follow`, { method: 'POST' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Unable to follow this account.');
			if (result.following) people = people.filter((item) => item.id !== person.id);
		} catch (error) { pageNotice = error instanceof Error ? error.message : 'Unable to follow this account.'; }
	}
</script> 

<div class="reddit-layout">
	<aside class={`left-rail ${mobileSidebarOpen ? 'mobile-open' : ''}`} aria-label="Main navigation">
		<div class="sidebar-inner">
			<div class="mobile-sidebar-head lg:hidden"><strong>Menu</strong><button onclick={() => mobileSidebarOpen = false} aria-label="Close navigation"><X size={18} /></button></div>
			<nav class="reddit-nav" aria-label="Feeds">
				<a href="/?feed=for-you" class:reddit-nav-active={data.mode === 'for-you'}><Home class="nav-icon" size={18} /> For you</a>
				<a href="/?feed=following" class:reddit-nav-active={data.mode === 'following'}><Users class="nav-icon" size={18} /> Following</a>
				<a href="/?feed=best" class:reddit-nav-active={data.mode === 'best'}><Sparkles class="nav-icon" size={18} /> Best</a>
				<a href="/?feed=hot" class:reddit-nav-active={data.mode === 'hot'}><Flame class="nav-icon" size={18} /> Hot</a>
				<a href="/?feed=latest" class:reddit-nav-active={data.mode === 'latest'}><Clock3 class="nav-icon" size={18} /> New</a>
				<a href="/?feed=top" class:reddit-nav-active={data.mode === 'top'}><ChartNoAxesColumn class="nav-icon" size={18} /> Top</a>
				<a href="/?feed=trending" class:reddit-nav-active={data.mode === 'trending'}><TrendingUp class="nav-icon" size={18} /> Trending</a>
			</nav>
			<div class="sidebar-rule"></div>
			<div class="sidebar-section-head"><span>YOUR COMMUNITIES</span><a href="/communities" aria-label="Browse communities"><Plus size={17} /></a></div>
			<nav class="community-nav" aria-label="Your communities">
				{#each communities.slice(0, 12) as community (community.id)}
					<a href={`/c/${encodeURIComponent(community.slug)}`} title={community.name}>
						{#if community.iconUrl}<img src={community.iconUrl} alt="" />{:else}<span class="subreddit-avatar">c</span>{/if}
						<span class="community-nav-name">c/{community.slug}</span>
					</a>
				{/each}
				{#if communities.length === 0}<span class="sidebar-empty">No communities yet.</span>{/if}
				<a href="/communities" class="see-all-communities">Browse communities <span>›</span></a>
			</nav>
			<div class="sidebar-rule"></div>
			<nav class="reddit-nav" aria-label="Your account">
				<a href="/communities"><Compass class="nav-icon" size={18} /> Explore communities</a>
				<a href="/bookmarks"><Bookmark class="nav-icon" size={18} /> Saved posts</a>
				{#if data.viewer}<a href="/notifications"><Bell class="nav-icon" size={18} /> Notifications</a><a href="/messages"><Mail class="nav-icon" size={18} /> Messages</a><a href={`/u/${encodeURIComponent(data.viewer.username)}`}><UserRound class="nav-icon" size={18} /> Profile</a>{/if}
				{#if data.viewer?.isOwner}<a href="/admin" class="owner-nav-link"><Settings class="nav-icon" size={18} /> Owner dashboard</a>{/if}
			</nav>
			<div class="sidebar-legal"><a href="/terms">Content policy</a><a href="/privacy">Privacy</a><a href="/support">Help center</a><span>© 2026 {data.site.name}</span></div>
		</div>
	</aside>

	{#if mobileSidebarOpen}<button class="sidebar-scrim" aria-label="Close menu" onclick={() => mobileSidebarOpen = false}></button>{/if}

	<main class="feed-column">
		<div class="mobile-feed-tools">
			<button class="mobile-menu-button" onclick={() => mobileSidebarOpen = true} aria-label="Open navigation"><Menu size={19} /></button>
			<form action="/search" method="GET" class="mobile-feed-search"><Search size={16} /><input name="q" bind:value={searchTerm} placeholder="Search posts and communities" /><button aria-label="Search"><ArrowUpRight size={16} /></button></form>
		</div>

		<div class="feed-heading-row">
			<div><h1>{data.query ? `Search results` : data.mode === 'following' ? 'Following' : data.mode === 'trending' ? 'Trending' : data.mode === 'latest' || data.mode === 'new' ? 'New posts' : data.mode === 'top' ? 'Top posts' : data.mode === 'best' ? 'Best posts' : data.mode === 'hot' ? 'Hot posts' : 'Home'}</h1>
				{#if data.query}<p>Results for “{data.query}”</p>{:else}<p>{data.site.tagline || 'Find your community and join the conversation.'}</p>{/if}
			</div>
			{#if !data.viewer}<a class="join-reddit-button" href="/login">Join</a>{/if}
		</div>

		{#if !data.databaseReady}<div class="database-warning">The database is not connected. Configure <code>DATABASE_URL</code> and run the schema push to enable posts.</div>{/if}

		{#if data.viewer}
			<section id="composer" class="quick-composer" aria-label="Create a post">
				<div class="quick-composer-main">
					{#if data.viewer}<span class="viewer-avatar">{(data.viewer.name[0] || 'M').toUpperCase()}</span>{/if}
					<button class="quick-composer-input" onclick={() => { composerOpen = true; postType = 'discussion'; }}>Create a post</button>
				</div>
				<div class="quick-composer-actions">
					<button onclick={() => { composerOpen = true; postType = 'media'; }}><ImageIcon size={17} /> Image & Video</button>
					<button onclick={() => { composerOpen = true; postType = 'link'; }}><Link2 size={17} /> Link</button>
					<button onclick={() => { composerOpen = true; postType = 'poll'; }}><ChartNoAxesColumn size={17} /> Poll</button>
				</div>
				{#if composerOpen}
					<div class="post-composer-expanded">
						<div class="composer-tabs" role="tablist" aria-label="Post type">
							<button class:composer-tab-active={postType === 'discussion'} onclick={() => postType = 'discussion'}><FileText size={16} /> Post</button>
							<button class:composer-tab-active={postType === 'media'} onclick={() => postType = 'media'}><ImageIcon size={16} /> Images & Video</button>
							<button class:composer-tab-active={postType === 'link'} onclick={() => postType = 'link'}><Link2 size={16} /> Link</button>
							<button class:composer-tab-active={postType === 'poll'} onclick={() => postType = 'poll'}><ChartNoAxesColumn size={16} /> Poll</button>
						</div>
						<label class="composer-label" for="post-community">Post to</label>
						<div class="composer-community-select"><Dropdown label="Post destination" value={communitySlug} options={communityOptions} onChange={selectComposerCommunity} fullWidth /></div>
						<input bind:value={postTitle} id="post-title" maxlength="220" placeholder="Title" class="reddit-composer-input post-title-input" />
						{#if postType === 'discussion'}
							<textarea bind:value={postBody} rows="5" maxlength="12000" placeholder="Text (optional)" class="reddit-composer-input"></textarea>{#if composerEmotes.length}<div class="composer-emote-picker"><EmotePicker emotes={composerEmotes} onSelect={insertComposerEmote} label="Community emotes" /></div>{/if}
						{:else if postType === 'link'}
							<input bind:value={postUrl} type="url" placeholder="URL (https://…)" class="reddit-composer-input" />
							<textarea bind:value={postBody} rows="3" maxlength="12000" placeholder="Add context (optional)" class="reddit-composer-input mt-2"></textarea>{#if composerEmotes.length}<div class="composer-emote-picker"><EmotePicker emotes={composerEmotes} onSelect={insertComposerEmote} label="Community emotes" /></div>{/if}
						{:else if postType === 'poll'}
							<textarea bind:value={postBody} rows="2" maxlength="12000" placeholder="Add some context (optional)" class="reddit-composer-input"></textarea>{#if composerEmotes.length}<div class="composer-emote-picker"><EmotePicker emotes={composerEmotes} onSelect={insertComposerEmote} label="Community emotes" /></div>{/if}
							<div class="poll-builder">
								{#each pollOptions as option, index}<div class="poll-option-input-row"><input bind:value={pollOptions[index]} maxlength="100" placeholder={`Option ${index + 1}`} class="reddit-composer-input" />{#if pollOptions.length > 2}<button onclick={() => removePollOption(index)} aria-label="Remove poll option">×</button>{/if}</div>{/each}
								{#if pollOptions.length < 6}<button class="add-poll-option" onclick={addPollOption}>+ Add option</button>{/if}
							</div>
						{:else}
							<p class="media-tab-help">Share a photo, a gallery, or a video with your community.</p><textarea bind:value={postBody} rows="3" maxlength="12000" placeholder="Add a caption (optional)" class="reddit-composer-input"></textarea>{#if composerEmotes.length}<div class="composer-emote-picker"><EmotePicker emotes={composerEmotes} onSelect={insertComposerEmote} label="Community emotes" /></div>{/if}
						{/if}
						<div class="media-upload-box">
							<div class="media-upload-heading"><span class="media-upload-icon"><Upload size={19} /></span><div><strong>{postType === 'media' ? 'Add images or video' : 'Attach media (optional)'}</strong><p>Photos, GIFs, videos, and audio files</p></div></div>
							<label class="choose-files-button">Choose files<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/webm" onchange={(event) => { selectedFiles = Array.from((event.currentTarget as HTMLInputElement).files ?? []).slice(0, 8); uploadedAssetIds = []; }} /></label>
							{#if selectedFiles.length}<div class="selected-files"><strong>{selectedFiles.length} selected</strong>{#each selectedFiles as file, index}<span class="selected-file">{#if file.type.startsWith('video/')}<Video size={13} />{:else if file.type.startsWith('audio/')}<Music size={13} />{:else}<ImageIcon size={13} />{/if} {file.name}</span>{/each}</div>{/if}
							{#if uploadedAssetIds.length}<p class="upload-success">✓ {uploadedAssetIds.length} attachment(s) uploaded</p>{/if}
							{#if uploadBusy}<div class="inline-upload-progress" role="progressbar" aria-valuenow={uploadPercent} aria-valuemin="0" aria-valuemax="100"><div><span>{uploadStage || 'Uploading media…'}</span><b>{uploadPercent}%</b></div><span class="inline-progress-track"><i style={`width:${uploadPercent}%`}></i></span></div>{/if}
							<p class="upload-note">Uploads are stored in your configured Backblaze B2 bucket. Selected files upload when you publish.</p>
						</div>
						{#if pageNotice}<p class="composer-notice" role="alert">{pageNotice}</p>{/if}
						<div class="composer-bottom-row"><span>Remember the human behind the screen.</span><div><button class="composer-cancel" onclick={() => composerOpen = false}>Cancel</button>{#if selectedFiles.length}<button class="composer-cancel background-upload-button" onclick={publishInBackground} disabled={publishing || uploadBusy}>Continue in background</button>{/if}<button class="reddit-publish-button" onclick={publishPost} disabled={publishing || uploadBusy}>{publishing ? 'Publishing…' : uploadBusy ? 'Uploading…' : 'Post'}</button></div></div>
					</div>
				{/if}
			</section>
		{:else}
			<section class="quick-composer signed-out-composer"><div class="quick-composer-main"><span class="viewer-avatar">?</span><a class="quick-composer-input" href="/login">Log in or sign up to post</a></div><div class="quick-composer-actions"><a href="/login"><ImageIcon size={16} /> Image & Video</a><a href="/login"><Link2 size={16} /> Link</a><a href="/login"><ChartNoAxesColumn size={16} /> Poll</a></div></section>
		{/if}

		<div class="feed-sort-row"><span>Sort by</span><nav aria-label="Sort posts"><a href="/?feed=best" class:sort-active={data.mode === 'best'}><Sparkles size={14} /> Best</a><a href="/?feed=hot" class:sort-active={data.mode === 'hot'}><Flame size={14} /> Hot</a><a href="/?feed=latest" class:sort-active={data.mode === 'latest' || data.mode === 'new'}><Clock3 size={14} /> New</a><a href="/?feed=top" class:sort-active={data.mode === 'top'}><ChartNoAxesColumn size={14} /> Top</a></nav><button class="view-mode" title="Compact feed"><Menu size={15} /></button></div>

		{#if pageNotice && data.viewer && !composerOpen}<p class="page-notice" role="status">{pageNotice}</p>{/if}
		<div class="post-list">
			{#each data.posts as post (post.id)}<PostCard {post} viewerId={data.viewer?.id ?? null} emotes={post.emotes ?? []} />
			{:else}
				<section class="empty-feed"><div class="empty-feed-icon">☷</div><h2>{data.mode === 'following' ? 'Your feed is quiet' : data.query ? 'No posts found' : 'It’s quiet around here'}</h2><p>{data.mode === 'following' ? 'Follow people and join communities to fill your feed.' : data.query ? 'Try another search phrase or switch to a different feed.' : 'Start a conversation and give your community something to talk about.'}</p>{#if data.viewer}<button class="reddit-publish-button" onclick={() => { composerOpen = true; postType = 'discussion'; }}>Create a post</button>{:else}<a class="reddit-publish-button" href="/login">Join the conversation</a>{/if}</section>
			{/each}
		</div>
		<div class="feed-end">You’re all caught up</div>
	</main>

	<aside class="right-rail" aria-label="Community sidebar">
		<form action="/search" method="GET" class="sidebar-search"><Search size={16} /><input bind:value={searchTerm} name="q" placeholder="Search Nexus" /><button aria-label="Search"><ArrowUpRight size={16} /></button></form>
		<section class="reddit-side-card community-welcome-card"><div class="side-card-banner"></div><div class="side-card-content"><div class="welcome-emblem"><Home size={23} /></div><h2>Home</h2><p>{data.site.tagline || 'A home for every interest.'}</p><a href="/communities" class="side-primary-button">Explore communities</a>{#if data.viewer}<button onclick={() => { composerOpen = true; postType = 'discussion'; }} class="side-secondary-button">Create a post</button>{:else}<a href="/login" class="side-secondary-button">Join Nexus</a>{/if}</div></section>
		<section class="reddit-side-card"><div class="side-card-heading"><h2>Popular communities</h2><a href="/communities">See all</a></div><div class="side-card-list">
			{#each communities.slice(0, 5) as community (community.id)}<div class="popular-community-row">{#if community.iconUrl}<img src={community.iconUrl} alt="" />{:else}<span class="popular-community-icon">c</span>{/if}<a href={`/c/${encodeURIComponent(community.slug)}`}><strong>c/{community.slug}</strong><span>{memberCount(community.memberCount)} members</span></a><button onclick={() => toggleCommunity(community)} title={community.isJoined ? 'Leave community' : 'Join community'}>{community.isJoined ? '✓' : '+'}</button></div>{/each}
			{#if communities.length === 0}<p class="side-empty">No communities yet.</p>{/if}
		</div></section>
		{#if trendingPosts.length}<section class="reddit-side-card"><div class="side-card-heading"><h2>Trending posts</h2><a href="/?feed=trending">More</a></div><div class="trending-list">{#each trendingPosts as post, index}<a href={`/post/${post.id}`}><span>{index + 1}</span><div><strong>{post.title}</strong><small>c/{post.community} · {memberCount(post.comments)} comments</small></div></a>{/each}</div></section>{/if}
		{#if people.length}<section class="reddit-side-card"><div class="side-card-heading"><h2>People to follow</h2></div><div class="side-card-list">{#each people.slice(0, 4) as person (person.id)}<div class="popular-community-row">{#if person.avatarUrl}<img class="person-avatar" src={person.avatarUrl} alt="" />{:else}<span class="popular-community-icon person-avatar">{person.name[0]?.toUpperCase() || 'M'}</span>{/if}<a href={`/u/${encodeURIComponent(person.username)}`}><strong>{person.name}{#if person.isVerified}<VerifiedBadge size={13}/>{/if}</strong><span>@{person.username}</span></a>{#if data.viewer}<button onclick={() => followPerson(person)} title={`Follow ${person.name}`}>+</button>{:else}<a class="follow-login" href="/login">Follow</a>{/if}</div>{/each}</div></section>{/if}
		<div class="reddit-side-footer"><a href="/terms">User Agreement</a><a href="/privacy">Privacy Policy</a><a href="/support">Help</a><span>© 2026 {data.site.name}</span></div>
	</aside>
</div>

<style>
	.reddit-layout { width: 100%; max-width: none; margin: 0; padding: 0 18px 48px; display: grid; grid-template-columns: minmax(205px, 230px) minmax(0, 1fr) minmax(245px, 300px); align-items: start; gap: 18px; }
	.left-rail { min-width: 0; }
	.sidebar-inner { position: sticky; top: 76px; max-height: calc(100vh - 88px); overflow-y: auto; padding: 8px 8px 18px 0; scrollbar-width: thin; scrollbar-color: #343b3e transparent; }
	.reddit-nav, .community-nav { display: grid; gap: 2px; }
	.reddit-nav a, .community-nav a { display: flex; align-items: center; min-width: 0; gap: 13px; padding: 10px 13px; color: var(--reddit-text); border-radius: 8px; font-size: 14px; transition: background .12s; }
	.reddit-nav a:hover, .community-nav a:hover { background: var(--reddit-hover); }
	.reddit-nav a.reddit-nav-active { background: var(--reddit-hover); font-weight: 700; color: var(--reddit-text-strong); }
	.nav-icon { flex: 0 0 auto; color: inherit; }
	.nav-symbol { width: 21px; text-align: center; font-size: 20px; line-height: 1; color: #a7b0b4; }
	.reddit-nav-active .nav-icon { flex: 0 0 auto; color: inherit; }
	.nav-symbol { color: var(--reddit-orange); }
	.sidebar-rule { height: 1px; background: var(--reddit-border); margin: 15px 12px; }
	.sidebar-section-head { display: flex; align-items: center; justify-content: space-between; padding: 0 13px 8px; color: var(--reddit-muted); font-size: 11px; font-weight: 700; letter-spacing: .04em; }
	.sidebar-section-head a { color: var(--reddit-muted); font-size: 21px; line-height: 1; }
	.community-nav a { padding: 7px 13px; }
	.community-nav img, .subreddit-avatar { display: inline-flex; width: 30px; height: 30px; flex: 0 0 30px; align-items: center; justify-content: center; object-fit: cover; border-radius: 50%; background: #33464d; color: #f1f5f6; font-weight: 800; }
	.subreddit-avatar { background: #ffb000; color: #142024; }
	.community-nav-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.see-all-communities { color: var(--reddit-blue) !important; font-size: 13px !important; }
	.see-all-communities span { margin-left: auto; font-size: 20px; }
	.sidebar-empty { padding: 10px 13px; color: var(--reddit-muted); font-size: 12px; }
	.owner-nav-link { color: #ffb09a !important; }
	.sidebar-legal { display: flex; flex-wrap: wrap; gap: 7px 12px; padding: 18px 12px; color: var(--reddit-muted); font-size: 11px; }
	.sidebar-legal span { width: 100%; }
	.feed-column { min-width: 0; padding-top: 5px; }
	.feed-heading-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 48px; margin: 5px 0 16px; }
	.feed-heading-row h1 { color: var(--reddit-text-strong); font-size: 22px; font-weight: 700; letter-spacing: -.02em; }
	.feed-heading-row p { margin-top: 3px; color: var(--reddit-muted); font-size: 12px; }
	.join-reddit-button { background: var(--reddit-blue); color: #09202a; font-size: 13px; font-weight: 700; border-radius: 999px; padding: 9px 18px; }
	.database-warning { margin: 0 0 14px; padding: 12px 14px; border: 1px solid #7c633c; background: #30291c; border-radius: 8px; font-size: 13px; color: #f5d9a0; }
	.quick-composer { scroll-margin-top: 78px; background: var(--reddit-card); border: 1px solid var(--reddit-border); border-radius: 12px; margin-bottom: 17px; overflow: hidden; }
	.quick-composer-main { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
	.viewer-avatar { width: 38px; height: 38px; border-radius: 50%; background: #ffb000; color: #20262a; display: inline-flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; flex: 0 0 38px; }
	.quick-composer-input { width: 100%; background: var(--reddit-panel); border: 1px solid var(--reddit-border); color: var(--reddit-muted); border-radius: 7px; padding: 10px 12px; text-align: left; font-size: 14px; }
	.quick-composer-input:hover { border-color: var(--reddit-blue); }
	.quick-composer-actions { display: flex; align-items: center; gap: 4px; padding: 0 14px 10px; }
	.quick-composer-actions button, .quick-composer-actions a { display: inline-flex; align-items: center; gap: 7px; border-radius: 6px; padding: 8px 12px; color: var(--reddit-text); font-size: 12px; font-weight: 600; }
	.quick-composer-actions button:hover, .quick-composer-actions a:hover { background: var(--reddit-hover); }
	.quick-composer-actions svg { color: var(--reddit-blue); flex: 0 0 auto; }
	.post-composer-expanded { border-top: 1px solid var(--reddit-border); padding: 15px; }
	.composer-emote-picker { margin-top: 8px; }
	.composer-tabs { display: flex; overflow-x: auto; border-bottom: 1px solid var(--reddit-border); margin: -2px 0 14px; gap: 4px; }
	.composer-tabs button { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; padding: 11px 13px; border-bottom: 3px solid transparent; color: var(--reddit-muted); font-size: 13px; font-weight: 700; }
	.composer-tabs button:hover { color: var(--reddit-text-strong); }
	.composer-tabs button.composer-tab-active { color: var(--reddit-text-strong); border-color: var(--reddit-orange); }
	.composer-tabs button span { font-size: 16px; }
	.composer-label { display: block; margin: 0 0 6px; color: var(--reddit-muted); font-size: 12px; }
	.reddit-select, .reddit-composer-input { width: 100%; border: 1px solid var(--reddit-border); background: var(--reddit-panel); color: var(--reddit-text-strong); border-radius: 7px; padding: 10px 12px; font-size: 14px; outline: none; }
	.composer-community-select { width: min(100%, 270px); margin-bottom: 10px; }
	.reddit-select { width: auto; min-width: 170px; max-width: 100%; margin-bottom: 10px; }
	.reddit-composer-input:focus, .reddit-select:focus { border-color: var(--reddit-blue); box-shadow: 0 0 0 1px var(--reddit-blue); }
	.post-title-input { margin: 0 0 9px; font-weight: 600; }
	.reddit-composer-input::placeholder { color: var(--reddit-muted); }
	.poll-builder { display: grid; gap: 8px; margin-top: 8px; }
	.poll-option-input-row { display: flex; gap: 8px; }
	.poll-option-input-row input { flex: 1; min-width: 0; }
	.poll-option-input-row button { padding: 0 8px; color: var(--reddit-muted); font-size: 22px; }
	.add-poll-option { width: fit-content; color: var(--reddit-blue); font-size: 12px; font-weight: 700; padding: 5px 0; }
	.media-tab-help { margin: 2px 0 12px; color: var(--reddit-muted); font-size: 13px; }
	.media-upload-box { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 12px; border: 1px dashed #425158; border-radius: 8px; padding: 12px; background: rgba(0,0,0,.08); }
	.media-upload-heading { display: flex; align-items: center; gap: 9px; min-width: 170px; flex: 1; }
	.media-upload-icon { display: inline-flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 50%; background: #26383e; color: var(--reddit-blue); font-size: 20px; }
	.media-upload-heading strong { display: block; color: var(--reddit-text-strong); font-size: 12px; }
	.media-upload-heading p { margin-top: 3px; color: var(--reddit-muted); font-size: 11px; }
	.choose-files-button { display: inline-flex; align-items: center; border: 1px solid var(--reddit-border); border-radius: 999px; padding: 8px 12px; color: var(--reddit-text-strong); font-size: 12px; font-weight: 700; cursor: pointer; }
	.choose-files-button:hover { border-color: var(--reddit-blue); }
	.choose-files-button input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
	.selected-files { display: flex; flex-wrap: wrap; align-items: center; width: 100%; gap: 5px; color: var(--reddit-muted); font-size: 11px; }
	.selected-files strong { margin-right: 4px; }
	.selected-file { background: var(--reddit-hover); border-radius: 4px; padding: 4px 6px; max-width: 100%; overflow-wrap: anywhere; }
	.upload-success { width: 100%; color: #65cba0; font-size: 11px; }
	.upload-note { width: 100%; color: var(--reddit-muted); font-size: 10px; }
	.composer-notice, .page-notice { margin-top: 10px; color: #ffb4a5; font-size: 12px; }
	.composer-bottom-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 15px; border-top: 1px solid var(--reddit-border); padding-top: 12px; }
	.composer-bottom-row > span { color: var(--reddit-muted); font-size: 11px; }
	.composer-bottom-row > div { display: flex; gap: 8px; }
	.composer-cancel { border: 1px solid var(--reddit-border); border-radius: 999px; padding: 9px 15px; color: var(--reddit-text); font-size: 12px; font-weight: 700; }
	.reddit-publish-button, .side-primary-button { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: var(--reddit-blue); color: #09212a; padding: 9px 17px; font-size: 12px; font-weight: 800; }
	.reddit-publish-button:hover, .side-primary-button:hover { filter: brightness(1.08); }
	.reddit-publish-button:disabled { opacity: .6; cursor: wait; }
	.feed-sort-row { display: flex; align-items: center; gap: 13px; margin: 0 0 12px; border-bottom: 1px solid var(--reddit-border); padding: 0 7px; }
	.feed-sort-row > span { color: var(--reddit-muted); font-size: 11px; white-space: nowrap; }
	.feed-sort-row nav { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; }
	.feed-sort-row nav a { display:inline-flex; align-items:center; gap:6px; white-space: nowrap; padding: 12px 10px; color: var(--reddit-muted); font-size: 12px; font-weight: 700; border-bottom: 2px solid transparent; }
	.feed-sort-row nav a:hover { color: var(--reddit-text-strong); }
	.feed-sort-row nav a.sort-active { color: var(--reddit-blue); border-color: var(--reddit-blue); }
	.view-mode { margin-left: auto; color: var(--reddit-muted); font-size: 17px; }
	.post-list { display: grid; gap: 10px; }
	.empty-feed { background: var(--reddit-card); border: 1px solid var(--reddit-border); border-radius: 12px; padding: 42px 22px; text-align: center; }
	.empty-feed-icon { color: var(--reddit-orange); font-size: 32px; }
	.empty-feed h2 { color: var(--reddit-text-strong); font-size: 18px; font-weight: 700; margin-top: 10px; }
	.empty-feed p { color: var(--reddit-muted); font-size: 13px; line-height: 1.55; max-width: 360px; margin: 8px auto 17px; }
	.feed-end { color: var(--reddit-muted); text-align: center; padding: 28px 0; font-size: 11px; }
	.right-rail { min-width: 0; padding-top: 7px; }
	.sidebar-search { display: flex; align-items: center; gap: 8px; background: var(--reddit-card); border: 1px solid var(--reddit-border); border-radius: 999px; padding: 10px 13px; margin-bottom: 14px; }
	.sidebar-search > span { color: var(--reddit-muted); font-size: 18px; }
	.sidebar-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--reddit-text); font-size: 12px; padding: 0; }
	.sidebar-search button { color: var(--reddit-blue); font-size: 12px; font-weight: 800; }
	.reddit-side-card { overflow: hidden; margin-bottom: 14px; border: 1px solid var(--reddit-border); border-radius: 12px; background: var(--reddit-card); }
	.side-card-banner { height: 36px; background: var(--reddit-blue); }
	.side-card-content { padding: 0 15px 15px; }
	.welcome-emblem { display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; margin-top: -20px; border: 4px solid var(--reddit-card); border-radius: 50%; background: #ffb000; color: #18252a; }
	.side-card-content h2, .side-card-heading h2 { color: var(--reddit-text-strong); font-size: 14px; font-weight: 700; }
	.side-card-content > p { color: var(--reddit-muted); font-size: 12px; line-height: 1.5; margin: 7px 0 13px; }
	.side-primary-button, .side-secondary-button { width: 100%; margin-top: 8px; }
	.side-secondary-button { display: flex; align-items: center; justify-content: center; border: 1px solid var(--reddit-blue); border-radius: 999px; padding: 8px 14px; color: var(--reddit-blue); font-size: 12px; font-weight: 700; }
	.side-card-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 14px 14px 8px; }
	.side-card-heading a { color: var(--reddit-blue); font-size: 11px; font-weight: 700; }
	.side-card-list { padding: 4px 9px 10px; }
	.popular-community-row { display: flex; align-items: center; gap: 9px; padding: 8px 5px; min-width: 0; }
	.popular-community-row > img, .popular-community-icon { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex: 0 0 34px; border-radius: 50%; object-fit: cover; background: #ffb000; color: #18252a; font-weight: 800; }
	.popular-community-icon.person-avatar { background: #43515a; color: white; }
	.popular-community-row > a:not(.follow-login) { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
	.popular-community-row > a strong { color: var(--reddit-text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
	.popular-community-row > a span { color: var(--reddit-muted); font-size: 10px; }
	.popular-community-row button { display: flex; align-items: center; justify-content: center; flex: 0 0 29px; height: 29px; border-radius: 50%; border: 1px solid var(--reddit-blue); color: var(--reddit-blue); font-size: 19px; }
	.popular-community-row button:hover { background: var(--reddit-hover); }
	.follow-login { color: var(--reddit-blue); font-size: 11px; font-weight: 700; }
	.trending-list { padding: 0 9px 9px; }
	.trending-list > a { display: flex; gap: 10px; padding: 9px 6px; border-radius: 7px; }
	.trending-list > a:hover { background: var(--reddit-hover); }
	.trending-list > a > span { display: flex; align-items: center; justify-content: center; flex: 0 0 24px; height: 24px; border-radius: 5px; background: var(--reddit-hover); color: var(--reddit-muted); font-size: 11px; font-weight: 800; }
	.trending-list > a > div { min-width: 0; }
	.trending-list strong { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--reddit-text); font-size: 12px; font-weight: 600; line-height: 1.4; }
	.trending-list small { display: block; margin-top: 4px; color: var(--reddit-muted); font-size: 10px; }
	.side-empty { padding: 8px 10px 13px; color: var(--reddit-muted); font-size: 12px; }
	.reddit-side-footer { display: flex; flex-wrap: wrap; gap: 8px 12px; padding: 7px 4px; color: var(--reddit-muted); font-size: 10px; }
	.reddit-side-footer span { width: 100%; }
	.mobile-feed-tools, .mobile-sidebar-head { display: none; }
	@media (max-width: 1199px) { .reddit-layout { grid-template-columns: 215px minmax(0, 1fr); max-width: none; gap: 14px; padding-left: 14px; padding-right: 14px; } .right-rail { display: none; } }
	@media (max-width: 760px) {
		.reddit-layout { display: block; width: 100%; padding: 0 8px 98px; }
		.left-rail { position: fixed; z-index: 80; inset: 0 auto 0 0; width: min(290px, 86vw); padding: 12px; background: var(--reddit-bg); border-right: 1px solid var(--reddit-border); transform: translateX(-110%); transition: transform .2s; }
		.left-rail.mobile-open { transform: translateX(0); }
		.sidebar-inner { position: static; max-height: calc(100vh - 24px); padding: 4px 0; }
		.mobile-sidebar-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px 14px; color: var(--reddit-text-strong); }
		.mobile-sidebar-head button { font-size: 25px; color: var(--reddit-muted); }
		.sidebar-scrim { position: fixed; z-index: 75; inset: 0; padding: 0; border: 0; background: rgba(0,0,0,.6); }
		.mobile-feed-tools { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; }
		.mobile-menu-button { flex: 0 0 38px; height: 38px; border: 1px solid var(--reddit-border); border-radius: 8px; color: var(--reddit-text); }
		.mobile-feed-search { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; padding: 9px 12px; border: 1px solid var(--reddit-border); border-radius: 999px; background: var(--reddit-card); }
		.mobile-feed-search span { color: var(--reddit-muted); }
		.mobile-feed-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--reddit-text); font-size: 12px; padding: 0; }
		.mobile-feed-search button { color: var(--reddit-muted); }
		.feed-column { padding-top: 0; }
		.feed-heading-row { margin-top: 4px; }
		.feed-heading-row h1 { font-size: 20px; }
		.quick-composer-actions { justify-content: space-between; }
		.quick-composer-actions button, .quick-composer-actions a { padding: 8px 6px; font-size: 11px; }
		.feed-sort-row { gap: 7px; }
		.feed-sort-row > span { display: none; }
		.feed-sort-row nav { flex: 1; }
		.feed-sort-row nav a { padding: 12px 8px; }
		.view-mode { display: none; }
	}

	.inline-upload-progress{margin-top:12px;padding:10px 11px;border:1px solid var(--reddit-border,#34474c);border-radius:7px;background:#101b1f}.inline-upload-progress>div{display:flex;justify-content:space-between;gap:10px;font-size:10px;color:#c5d0d2}.inline-upload-progress b{color:#ff8353}.inline-progress-track{display:block;height:5px;margin-top:8px;border-radius:99px;background:#29383c;overflow:hidden}.inline-progress-track i{display:block;height:100%;border-radius:inherit;background:#ff6b35;transition:width .12s linear}.background-upload-button{border:1px solid var(--reddit-border,#34474c);border-radius:6px;padding:8px 10px;font-size:11px;color:#d4dfe1}.background-upload-button:hover{background:#27373b}
</style>
