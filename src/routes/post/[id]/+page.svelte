<script lang="ts">
	import { Film, Search, X, Smile, ArrowUp, ArrowDown } from '@lucide/svelte';
	import Dropdown, { type DropdownOption } from '$lib/components/ui/Dropdown.svelte';
	import EmotePicker from '$lib/components/ui/EmotePicker.svelte';
	import EmoteText, { type CommunityEmote } from '$lib/components/ui/EmoteText.svelte';
	import VerifiedBadge from '$lib/components/ui/VerifiedBadge.svelte';
	import PostCard, { type PostSummary } from '$lib/components/ui/PostCard.svelte';
	type CommentItem = { id: string; content: string; gifUrl?: string | null; parentId: string | null; path: string; createdAt: Date | string; score: number; userVote: number; authorKarma: number; isPinned: boolean; authorId: string | null; username: string; name: string; avatarUrl: string | null; isVerified: boolean; depth: number };
	const { data } = $props() as { data: { post: PostSummary; comments: CommentItem[]; emotes: CommunityEmote[]; viewer: { id: string; username: string; name: string; isOwner: boolean } | null } };
	let commentText = $state('');
	let replyTo = $state<CommentItem | null>(null);
	let submitting = $state(false);
	let notice = $state('');
	let gifPickerOpen = $state(false);
	let gifSearch = $state('');
	let gifUrlInput = $state('');
	let selectedGifUrl = $state('');
	let gifResults = $state<Array<{ id: string; title: string; url: string; previewUrl?: string; provider?: string }>>([]);
	let gifProvider = $state('auto');
	let gifProviders = $state<{ tenor: boolean; giphy: boolean }>({ tenor: false, giphy: false });
	let gifSearching = $state(false);
	let gifSearchConfigured = $state<boolean | null>(null);
	const gifProviderOptions: DropdownOption[] = [{ value: 'auto', label: 'Auto', detail: 'Search all configured providers' }, { value: 'tenor', label: 'Tenor' }, { value: 'giphy', label: 'GIPHY' }];
	let commentsList = $state(data.comments);
	async function submitComment() {
		if (!data.viewer) return (window.location.href = '/login');
		if (!commentText.trim() && !selectedGifUrl) { notice = 'Write a reply or attach a GIF before sending.'; return; }
		submitting = true;
		try {
			const response = await fetch(`/api/posts/${data.post.id}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: commentText, gifUrl: selectedGifUrl || null, parentId: replyTo?.id ?? null }) });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not send reply.');
			commentsList = [{ id: result.id, content: commentText.trim(), gifUrl: selectedGifUrl || null, parentId: replyTo?.id ?? null, path: result.id, createdAt: new Date(), score: 0, userVote: 0, authorKarma: 0, isPinned: false, authorId: data.viewer.id, username: data.viewer.username, name: data.viewer.name, avatarUrl: null, isVerified: false, depth: replyTo ? Math.min(replyTo.depth + 1, 4) : 0 }, ...commentsList];
			commentText = ''; selectedGifUrl = ''; gifUrlInput = ''; gifResults = []; gifPickerOpen = false; replyTo = null; notice = 'Reply posted.';
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not send reply.'; }
		finally { submitting = false; }
	}

	async function searchGifs() {
		const query = gifSearch.trim();
		if (query.length < 2) { notice = 'Enter at least two characters to search GIFs.'; return; }
		gifSearching = true; notice = '';
		try {
			const response = await fetch(`/api/gifs/search?q=${encodeURIComponent(query)}&provider=${encodeURIComponent(gifProvider)}`);
			const result = await response.json();
			gifSearchConfigured = Boolean(result.configured);
			gifProviders = result.providers ?? { tenor: false, giphy: false };
			if (!response.ok) throw new Error(result.error || 'GIF search is temporarily unavailable.');
			gifResults = Array.isArray(result.results) ? result.results : [];
			if (!gifSearchConfigured) notice = 'GIF search needs TENOR_API_KEY and/or GIPHY_API_KEY on the server. You can still paste a direct GIF URL below.';
			else if (!gifResults.length) notice = 'No GIFs found. Try another search.';
		} catch (error) { notice = error instanceof Error ? error.message : 'GIF search failed.'; }
		finally { gifSearching = false; }
	}
	function useGifUrl() {
		let parsed: URL;
		try { parsed = new URL(gifUrlInput.trim()); } catch { notice = 'Enter a valid direct GIF URL.'; return; }
		const host = parsed.hostname.toLowerCase();
		const allowedHost = ['media.giphy.com', 'i.giphy.com', 'media.tenor.com', 'c.tenor.com'].includes(host) || /^media\d+\.giphy\.com$/.test(host);
		if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !allowedHost || !/\.gif$/i.test(parsed.pathname)) {
			notice = 'Use a direct HTTPS .gif file hosted by GIPHY or Tenor.'; return;
		}
		selectedGifUrl = parsed.toString(); notice = 'GIF attached to your reply.';
	}
	async function voteComment(comment: CommentItem, requested: number) {
		if (!data.viewer) return (window.location.href = '/login');
		const next = comment.userVote === requested ? 0 : requested;
		try {
			const response = await fetch(`/api/comments/${comment.id}/vote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: next }) });
			const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not vote on this reply.');
			commentsList = commentsList.map((item) => item.id === comment.id ? { ...item, score: result.score, userVote: result.value } : item);
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not vote on this reply.'; }
	}
	function formatDate(date: Date | string) {
		return new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}
</script>

<div class="post-page">
	<div class="min-w-0">
		<div class="mb-4 flex items-center gap-2 text-xs text-slate-600"><a href="/" class="hover:text-slate-300">Home</a><span>/</span><a href={`/c/${encodeURIComponent(data.post.community)}`} class="hover:text-slate-300">c/{data.post.community}</a><span>/</span><span>Discussion</span></div>
		<PostCard post={data.post} viewerId={data.viewer?.id ?? null} emotes={data.emotes} />

		<section id="comments" class="surface-card mt-4 rounded-[1.45rem] p-5 sm:p-6">
			<div class="flex items-center justify-between gap-3"><div><p class="text-[10px] font-bold uppercase tracking-[.17em] text-slate-600">COMMUNITY VOICES</p><h2 class="mt-1.5 text-xl font-extrabold text-white">Replies <span class="ml-1 text-sm font-semibold text-slate-500">{commentsList.length}</span></h2></div><span class="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[10px] font-bold text-slate-500">Threaded discussion</span></div>
			{#if data.post.isLocked}<div class="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] p-3 text-xs text-amber-100">This discussion is locked. Only moderators can reopen it.</div>{:else}
				<div class="mt-5 rounded-2xl border border-white/[0.07] bg-black/15 p-3.5">
					{#if replyTo}<div class="mb-2 flex items-center justify-between text-xs text-indigo-200"><span>Replying to @{replyTo.username}</span><button onclick={() => replyTo = null} class="text-slate-500 hover:text-white">Cancel reply ×</button></div>{/if}
					<textarea bind:value={commentText} rows="3" maxlength="5000" placeholder={data.viewer ? 'Add something thoughtful to the conversation…' : 'Sign in to join the discussion…'} class="w-full resize-y rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3 text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus:border-indigo-300/25 focus:ring-0"></textarea>
					<div class="mt-2 flex flex-wrap items-center justify-between gap-2"><div class="flex flex-wrap gap-2"><button type="button" onclick={() => gifPickerOpen = !gifPickerOpen} class="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-white/20 hover:bg-white/[0.04]"><Film size={15} /> GIF {#if selectedGifUrl}<span class="text-emerald-300">attached</span>{/if}</button>{#if data.emotes.length}<EmotePicker emotes={data.emotes} onSelect={(shortcode) => commentText = `${commentText}${commentText && !commentText.endsWith(' ') ? ' ' : ''}${shortcode} `} label="Emotes"/>{/if}</div>{#if selectedGifUrl}<button type="button" onclick={() => { selectedGifUrl = ''; gifUrlInput = ''; }} class="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-white"><X size={13}/> Remove GIF</button>{/if}</div>
					{#if gifPickerOpen}
						<div class="gif-picker mt-3 rounded-xl border border-white/10 p-3">
							<form onsubmit={(event) => { event.preventDefault(); void searchGifs(); }} class="grid grid-cols-[minmax(0,1fr)_120px_auto] gap-2 max-sm:grid-cols-1"><input bind:value={gifSearch} placeholder="Search GIFs…" maxlength="80" class="min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-slate-600"/><Dropdown label="GIF provider" value={gifProvider} options={gifProviderOptions} onChange={(value) => gifProvider = value} fullWidth/><button type="submit" disabled={gifSearching} class="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold text-slate-900 disabled:opacity-50"><Search size={13}/>{gifSearching ? 'Searching' : 'Search'}</button></form>
							{#if gifResults.length}<div class="mt-3 grid grid-cols-3 gap-2">{#each gifResults as gif (gif.id)}<button type="button" onclick={() => { selectedGifUrl = gif.url; gifPickerOpen = false; notice = 'GIF attached to your reply.'; }} class="gif-result" title={gif.title}><img src={gif.previewUrl || gif.url} alt={gif.title} loading="lazy"/><span>{gif.title} · {gif.provider || 'GIF'}</span></button>{/each}</div>{/if}
							<div class="mt-3"><label for="gif-url" class="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Or paste a direct GIF URL</label><div class="flex gap-2"><input id="gif-url" type="url" bind:value={gifUrlInput} placeholder="https://media.tenor.com/…/tenor.gif" class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-slate-600"/><button type="button" onclick={useGifUrl} class="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.04]">Attach</button></div><p class="mt-1 text-[10px] text-slate-600">Configured providers: {gifProviders.tenor ? 'Tenor' : ''}{gifProviders.tenor && gifProviders.giphy ? ' + ' : ''}{gifProviders.giphy ? 'GIPHY' : ''}{!gifProviders.tenor && !gifProviders.giphy ? 'No search provider configured yet. Add TENOR_API_KEY and/or GIPHY_API_KEY to your server environment.' : '. Keys stay server-side. Direct GIF URLs also work.'}</p></div>
						</div>
					{/if}
					{#if selectedGifUrl}<div class="mt-3 max-w-[340px] overflow-hidden rounded-lg border border-white/10"><img src={selectedGifUrl} alt="GIF preview for your reply" class="max-h-64 w-full object-contain"/></div>{/if}
					{#if notice}<p class="mt-2 text-xs text-indigo-200" role="status">{notice}</p>{/if}
					<div class="mt-3 flex items-center justify-between gap-3"><p class="text-[10px] text-slate-600">Respectful replies make better threads.</p><button onclick={submitComment} disabled={submitting || data.post.isLocked} class="rounded-xl bg-indigo-300 px-4 py-2.5 text-xs font-extrabold text-slate-950 transition hover:bg-indigo-200 disabled:opacity-50">{submitting ? 'Sending…' : 'Reply ↗'}</button></div>
				</div>
			{/if}

			<div class="mt-3 divide-y divide-white/[0.055]">
				{#each commentsList as comment (comment.id)}
					<div class="comment-row py-4" style={`margin-left:${Math.min(comment.depth, 4) * 13}px`}>
						<div class="flex items-start gap-3">
							{#if comment.avatarUrl}<img src={comment.avatarUrl} alt="" class="h-8 w-8 rounded-full object-cover" />{:else}<span class="comment-avatar">{comment.name[0]?.toUpperCase() || 'M'}</span>{/if}
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2 text-xs"><a href={`/u/${encodeURIComponent(comment.username)}`} class="font-bold text-slate-200 hover:text-indigo-200">{comment.name}</a>{#if comment.isVerified}<VerifiedBadge size={14}/>{/if}<span class="text-slate-600">@{comment.username}</span>{#if comment.authorKarma > 0}<span class="text-[10px] text-slate-600">{new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(comment.authorKarma)} karma</span>{/if}<span class="text-slate-700">·</span><time class="text-slate-600">{formatDate(comment.createdAt)}</time>{#if comment.isPinned}<span class="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[9px] text-amber-200">Pinned reply</span>{/if}</div>
								{#if comment.content}<p class="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300"><EmoteText text={comment.content} emotes={data.emotes}/></p>{/if}{#if comment.gifUrl}<a href={comment.gifUrl} target="_blank" rel="noopener noreferrer" class="mt-3 inline-block max-w-full"><img src={comment.gifUrl} alt="GIF in comment" loading="lazy" class="comment-gif"/></a>{/if}
								<div class="mt-2 flex items-center gap-1"><button onclick={() => voteComment(comment, 1)} aria-label="Upvote reply" aria-pressed={comment.userVote === 1} class={`comment-vote ${comment.userVote === 1 ? 'comment-vote-up' : ''}`} title="Upvote reply"><ArrowUp size={13}/></button><span class={`comment-score ${comment.userVote === 1 ? 'comment-score-up' : comment.userVote === -1 ? 'comment-score-down' : ''}`}>{new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(comment.score)}</span><button onclick={() => voteComment(comment, -1)} aria-label="Downvote reply" aria-pressed={comment.userVote === -1} class={`comment-vote ${comment.userVote === -1 ? 'comment-vote-down' : ''}`} title="Downvote reply"><ArrowDown size={13}/></button>{#if data.viewer && !data.post.isLocked}<button onclick={() => { replyTo = comment; commentText = ''; document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} class="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-white/[0.04] hover:text-indigo-200">↳ Reply</button>{/if}</div>
							</div>
						</div>
					</div>
				{:else}
					<div class="py-10 text-center"><p class="text-sm font-semibold text-slate-300">Be the first to reply.</p><p class="mt-1 text-xs text-slate-600">Great discussions start with one useful thought.</p></div>
				{/each}
			</div>
		</section>
	</div>
	<aside class="hidden lg:block"><div class="sticky top-24 space-y-4">
		<div class="surface-card rounded-2xl p-4"><p class="text-[10px] font-bold uppercase tracking-[.15em] text-slate-600">IN THIS SPACE</p><a href={`/c/${encodeURIComponent(data.post.community)}`} class="mt-3 block text-sm font-extrabold text-white">c/{data.post.community}</a><p class="mt-1 text-xs leading-5 text-slate-500">Join the community to find more conversations like this one.</p><a href={`/c/${encodeURIComponent(data.post.community)}`} class="mt-3 inline-block text-xs font-bold text-indigo-200 hover:text-white">Visit community ↗</a></div>
		<div class="rounded-2xl border border-indigo-300/10 bg-indigo-300/[0.035] p-4"><p class="text-xs font-bold text-indigo-100">Keep the thread good.</p><p class="mt-2 text-[11px] leading-5 text-slate-500">Add context, challenge ideas rather than people, and report content that breaks community rules.</p></div>
	</div></aside>
</div>

<style>
	.post-page { width:100%; display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:16px; align-items:start; padding:0 16px 90px; margin:0 auto; }
	.post-page > div { min-width:0; }
	@media(max-width:900px) { .post-page { grid-template-columns:minmax(0,1fr); padding:0 12px 90px; } .post-page > aside { display:none; } }
	@media(max-width:620px) { .post-page { padding:0 8px 100px; } }
	.comment-avatar { display: inline-flex; height: 32px; width: 32px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; background: linear-gradient(145deg,#a5b4fc,#58d6c7); color: #0b1220; font-size: 11px; font-weight: 900; }
	.comment-row { border-radius: 10px; padding-left: 8px; padding-right: 8px; }
	.comment-vote { display:inline-flex; align-items:center; justify-content:center; width:23px; height:23px; border-radius:7px; color:#78849a; } .comment-vote:hover{background:rgba(255,255,255,.05);color:#e2e8f0}.comment-vote-up{color:#fb923c;background:rgba(251,146,60,.08)}.comment-vote-down{color:#818cf8;background:rgba(129,140,248,.08)}.comment-score{min-width:20px;text-align:center;color:#7c899f;font-size:10px;font-weight:800}.comment-score-up{color:#fb923c}.comment-score-down{color:#a5b4fc}
	.gif-result { position:relative; overflow:hidden; border-radius:7px; border:1px solid rgba(255,255,255,.08); background:#0c1115; text-align:left; }
	.gif-result img { display:block; width:100%; height:82px; object-fit:cover; }
	.gif-result span { display:block; padding:4px 5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#cbd5e1; font-size:9px; }
	.gif-result:hover { border-color:rgba(165,180,252,.7); }
	.comment-gif { display:block; width:auto; max-width:min(100%,420px); max-height:420px; object-fit:contain; border-radius:9px; background:#090c10; }
</style>
