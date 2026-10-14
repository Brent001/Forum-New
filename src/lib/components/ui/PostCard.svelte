<script lang="ts">
	import { ArrowDown, ArrowUp, Bookmark, ExternalLink, MessageCircle, MoreHorizontal, Share2, ShieldCheck } from '@lucide/svelte';
	import EmoteText, { type CommunityEmote } from './EmoteText.svelte';
	import VerifiedBadge from './VerifiedBadge.svelte';
	import ArtVideoPlayer from './ArtVideoPlayer.svelte';
	import ExternalEmbed from './ExternalEmbed.svelte';
	import { notify } from '$lib/client/notifications.js';
	import { findSupportedEmbedUrl, isSupportedExternalEmbed } from '$lib/utils/external-embeds';
	export type PollOption = { id: string; text: string; votes: number };
	export type PollData = { options: PollOption[]; endsAt?: string } | null;
	export type PostSummary = {
		id: string;
		title: string;
		body: string;
		url?: string | null;
		media?: Array<{ id: string; kind: string }>;
		authorId: string;
		author: string;
		authorName: string;
		authorAvatar?: string | null;
		authorVerified?: boolean;
		authorKarma?: number;
		community: string;
		communityName: string;
		communityId?: string | null;
		score: number;
		upvotes: number;
		downvotes: number;
		comments: number;
		views: number;
		shares: number;
		bookmarkCount?: number;
		time: string;
		isPinned?: boolean;
		isLocked?: boolean;
		postType?: string;
		flair?: string | null;
		poll?: PollData;
		userPollVote?: string | null;
		isNsfw?: boolean;
		isFollowedAuthor?: boolean;
		isJoinedCommunity?: boolean;
		userVote?: number;
		isBookmarked?: boolean;
		emotes?: CommunityEmote[];
	};
	const { post, viewerId = null, compact = false, emotes = [], canModerate = false } = $props<{ post: PostSummary; viewerId?: string | null; compact?: boolean; emotes?: CommunityEmote[]; canModerate?: boolean }>();
	let score = $state(post.score ?? 0);
	let upvotes = $state(post.upvotes ?? 0);
	let downvotes = $state(post.downvotes ?? 0);
	let vote = $state(post.userVote ?? 0);
	let saved = $state(post.isBookmarked ?? false);
	let following = $state(post.isFollowedAuthor ?? false);
	let poll = $state<PollData>(post.poll ?? null);
	let pollVoted = $state(Boolean(post.userPollVote));
	let selectedOption = $state(post.userPollVote ?? '');
	let busy = $state(false);
	let notice = $state('');
	let modMenuOpen = $state(false);
	let isPinned = $state(Boolean(post.isPinned));
	let isLocked = $state(Boolean(post.isLocked));
	let removedLocally = $state(false);

	const scoreText = $derived(new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(score));
	const commentText = $derived(new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(post.comments));
	const pollTotal = $derived(poll?.options.reduce((total, option) => total + option.votes, 0) ?? 0);
	const externalEmbedUrl = $derived(findSupportedEmbedUrl([post.url, post.body].filter(Boolean).join(' ')));
	const hasExternalEmbed = $derived(isSupportedExternalEmbed(externalEmbedUrl));

	function displayName(name: string) {
		return name?.trim() || 'Community member';
	}
	function safeUrlLabel(value: string) {
		try { const parsed = new URL(value); return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`; }
		catch { return 'Open link'; }
	}
	function timeAgo(value: string) {
		const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
		if (seconds < 60) return 'just now';
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
		if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
		return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
	function requireSignIn() {
		window.location.href = `/login?callbackURL=${encodeURIComponent(window.location.pathname + window.location.search)}`;
	}
	async function sendVote(nextValue: number) {
		if (!viewerId) return requireSignIn();
		if (busy) return;
		busy = true;
		const desired = vote === nextValue ? 0 : nextValue;
		try {
			const response = await fetch(`/api/posts/${post.id}/vote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: desired }) });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not vote.');
			vote = result.value;
			upvotes = result.upvotes;
			downvotes = result.downvotes;
			score = result.score;
			notice = desired === 1 ? 'Upvoted post.' : desired === -1 ? 'Downvoted post.' : 'Vote removed.'; notify(notice, 'success');
		} catch (error) {
			notice = error instanceof Error ? error.message : 'Could not vote.'; notify(notice, 'error');
		} finally { busy = false; }
	}
	async function toggleBookmark() {
		if (!viewerId) return requireSignIn();
		if (busy) return;
		busy = true;
		try {
			const response = await fetch(`/api/posts/${post.id}/bookmark`, { method: 'POST' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not save post.');
			saved = result.bookmarked;
			notice = saved ? 'Saved to bookmarks.' : 'Removed from bookmarks.'; notify(notice, 'success');
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not save post.'; notify(notice, 'error'); }
		finally { busy = false; }
	}
	async function toggleFollow() {
		if (!viewerId) return requireSignIn();
		if (!post.authorId || post.authorId === viewerId || busy) return;
		busy = true;
		try {
			const response = await fetch(`/api/users/${post.authorId}/follow`, { method: 'POST' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not update follow.');
			following = result.following;
			notice = following ? `Following @${post.author}.` : `Unfollowed @${post.author}.`; notify(notice, 'success');
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not follow account.'; notify(notice, 'error'); }
		finally { busy = false; }
	}
	async function sharePost() {
		const link = `${window.location.origin}/post/${post.id}`;
		try {
			if (navigator.share) await navigator.share({ title: post.title, text: post.body.slice(0, 160), url: link });
			else { await navigator.clipboard.writeText(link); notice = 'Link copied to clipboard.'; }
			if (viewerId) void fetch(`/api/posts/${post.id}/share`, { method: 'POST' }).catch(() => {});
			if (navigator.share) notice = 'Thanks for sharing.'; notify('Post link shared.', 'success');
		} catch (error) {
			if (error instanceof Error && error.name !== 'AbortError') { notice = 'Could not share this post.'; notify(notice, 'error'); }
		}
	}
	async function reportPost() {
		if (!viewerId) return requireSignIn();
		const reason = (window.prompt('Report reason: spam, harassment, hate, misinformation, illegal, sexual-content, self-harm, other', 'spam') || '').trim().toLowerCase();
		if (!reason) return;
		const allowed = ['spam', 'harassment', 'hate', 'misinformation', 'illegal', 'sexual-content', 'self-harm', 'other'];
		if (!allowed.includes(reason)) { notice = 'Please enter one of the listed report reasons.'; return; }
		try {
			const response = await fetch(`/api/posts/${post.id}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not report post.');
			notice = result.alreadyReported ? 'You already reported this post.' : 'Report sent to the moderation team.'; notify(notice, result.alreadyReported ? 'info' : 'success');
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not report post.'; notify(notice, 'error'); }
	}

	async function moderatePost(action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'remove' | 'restore') {
		if (!post.communityId || !canModerate) return;
		const reason = action === 'remove' ? (window.prompt('Why are you removing this post?', 'Breaks community rules') || '').trim() : '';
		if (action === 'remove' && !reason) return;
		busy = true;
		try {
			const response = await fetch(`/api/communities/${post.communityId}/moderation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postId: post.id, action, reason }) });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Moderation action failed.');
			if (action === 'pin') isPinned = true;
			if (action === 'unpin') isPinned = false;
			if (action === 'lock') isLocked = true;
			if (action === 'unlock') isLocked = false;
			if (action === 'remove') {
				removedLocally = true;
				window.dispatchEvent(new CustomEvent('nexus:community-post-removed', { detail: {
					communityId: post.communityId, id: post.id, title: post.title, body: post.body || '',
					reason: reason, createdAt: post.time, updatedAt: new Date().toISOString(),
					authorId: post.authorId, author: post.author, authorName: post.authorName
				} }));
			}
			if (action === 'restore') removedLocally = false;
			notice = `Post ${action === 'pin' ? 'pinned' : action === 'unpin' ? 'unpinned' : action === 'lock' ? 'locked' : action === 'unlock' ? 'unlocked' : action === 'remove' ? 'removed' : 'restored'}.`; notify(notice, 'success');
			modMenuOpen = false;
		} catch (error) { notice = error instanceof Error ? error.message : 'Moderation action failed.'; notify(notice, 'error'); }
		finally { busy = false; }
	}

	async function voteInPoll() {
		if (!viewerId) return requireSignIn();
		if (!selectedOption || busy) return;
		busy = true;
		try {
			const response = await fetch(`/api/posts/${post.id}/poll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ optionId: selectedOption }) });
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not vote in poll.');
			poll = result.poll;
			pollVoted = true;
			notice = 'Your poll vote has been counted.'; notify(notice, 'success');
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not vote in poll.'; notify(notice, 'error'); }
		finally { busy = false; }
	}
</script>

<article class:moderated-hidden={removedLocally} class={`reddit-post ${compact ? 'reddit-post-compact' : ''}`}>
	<div class="reddit-vote-rail">
		<button onclick={() => sendVote(1)} aria-label="Upvote" aria-pressed={vote === 1} class:vote-active-up={vote === 1} title="Upvote" class="reddit-vote-button upvote"><ArrowUp size={17} strokeWidth={2.5} /></button>
		<span class:score-up={vote === 1} class:score-down={vote === -1} class="reddit-score">{scoreText}</span>
		<button onclick={() => sendVote(-1)} aria-label="Downvote" aria-pressed={vote === -1} class:vote-active-down={vote === -1} title="Downvote" class="reddit-vote-button downvote"><ArrowDown size={17} strokeWidth={2.5} /></button>
	</div>
	<div class="reddit-post-main">
		<div class="reddit-post-meta">
			<a href={`/c/${encodeURIComponent(post.community)}`} class="reddit-community-avatar" aria-label={`Visit c/${post.community}`}>c</a>
			<div class="reddit-post-byline">
				<a href={`/c/${encodeURIComponent(post.community)}`} class="reddit-community-name">c/{post.community}</a>
				<span class="meta-dot">·</span>
				<span>Posted by</span>
				<a href={`/u/${encodeURIComponent(post.author)}`} class="reddit-author">u/{post.author}</a>{#if post.authorVerified}<VerifiedBadge size={14}/>{/if}{#if post.authorKarma !== undefined}<span class="author-karma" title="Author karma">{new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(post.authorKarma)} karma</span>{/if}
				<time datetime={post.time} title={new Date(post.time).toLocaleString()}>{timeAgo(post.time)}</time>
			</div>
			{#if viewerId && post.authorId !== viewerId}<button onclick={toggleFollow} class="reddit-follow-link">{following ? 'Following' : 'Follow'}</button>{/if}
		</div>
		{#if isPinned || isLocked || post.isNsfw}
			<div class="post-state-labels">{#if isPinned}<span>📌 Pinned</span>{/if}{#if isLocked}<span>🔒 Locked</span>{/if}{#if post.isNsfw}<span class="nsfw-label">18+</span>{/if}</div>
		{/if}
		<a href={`/post/${post.id}`} class="reddit-post-title-link"><h2>{post.title}</h2></a>
		{#if post.flair}<div class="reddit-post-flair">{post.flair}</div>{/if}
		{#if post.body}<p class={`reddit-post-body ${compact ? 'body-compact' : ''}`}><EmoteText text={post.body} {emotes} /></p>{/if}
		{#if post.media?.length}
			<div class="reddit-post-media">
				{#each post.media as attachment (attachment.id)}
					{#if attachment.kind === 'video'}
						<ArtVideoPlayer src={`/api/media/${attachment.id}`} title={post.title || 'Community video'} />
					{:else if attachment.kind === 'audio'}
						<audio src={`/api/media/${attachment.id}`} controls preload="metadata" class="reddit-audio"></audio>
					{:else}
						<a href={`/api/media/${attachment.id}`} target="_blank" rel="noopener noreferrer" class="reddit-image-link"><img src={`/api/media/${attachment.id}`} alt="Post attachment" loading="lazy" class="reddit-image" /></a>
					{/if}
				{/each}
			</div>
		{/if}
		{#if externalEmbedUrl && hasExternalEmbed}
			<ExternalEmbed url={externalEmbedUrl} title={post.title || post.body || 'Shared media'} />
		{:else if post.url}
			<a href={post.url} target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" class="reddit-link-preview">
				<span class="reddit-link-icon"><ExternalLink size={17} /></span><span class="reddit-link-copy"><strong>{safeUrlLabel(post.url)}</strong><small>{safeUrlLabel(post.url).split('/')[0]}</small></span><span class="reddit-link-open">Open link ↗</span>
			</a>
		{/if}
		{#if poll}
			<div class="reddit-poll">
				<div class="reddit-poll-header"><strong>Poll</strong><span>{pollTotal} vote{pollTotal === 1 ? '' : 's'}{poll.endsAt ? ` · ends ${new Date(poll.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</span></div>
				{#each poll.options as option}
					{@const percent = pollTotal ? Math.round((option.votes / pollTotal) * 100) : 0}
					{#if pollVoted}
						<div class="reddit-poll-result"><span class="reddit-poll-bar" style={`width:${percent}%`}></span><span class="reddit-poll-result-label"><span>{option.text}</span><strong>{percent}%</strong></span></div>
					{:else}
					<label class="reddit-poll-option"><input type="radio" name={`poll-${post.id}`} value={option.id} checked={selectedOption === option.id} onchange={() => selectedOption = option.id} /><span>{option.text}</span></label>
					{/if}
				{/each}
				{#if !pollVoted}<button onclick={voteInPoll} disabled={!selectedOption || busy} class="reddit-poll-vote">Vote</button>{/if}
			</div>
		{/if}
		{#if notice}<p class="reddit-post-notice" role="status">{notice}</p>{/if}
		<div class="reddit-post-actions">
			<a href={`/post/${post.id}#comments`} class="reddit-action-button" title="Comments"><MessageCircle size={16} /><strong>{commentText}</strong><span>Comments</span></a>
			<button onclick={sharePost} class="reddit-action-button" title="Share post"><Share2 size={15} /><strong>Share</strong></button>
			<button onclick={toggleBookmark} aria-pressed={saved} class:action-saved={saved} class="reddit-action-button" title={saved ? 'Remove saved post' : 'Save post'}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /><strong>{saved ? 'Saved' : 'Save'}</strong></button>
			{#if canModerate && post.communityId}<div class="community-mod-menu"><button onclick={() => modMenuOpen = !modMenuOpen} class="reddit-more-button moderator-action" title="Community moderation" aria-label="Community moderation"><ShieldCheck size={16}/><span>Mod</span></button>{#if modMenuOpen}<div class="community-mod-dropdown" role="menu"><button role="menuitem" onclick={() => moderatePost(isPinned ? 'unpin' : 'pin')} disabled={busy}>{isPinned ? 'Unpin post' : 'Pin post'}</button><button role="menuitem" onclick={() => moderatePost(isLocked ? 'unlock' : 'lock')} disabled={busy}>{isLocked ? 'Unlock discussion' : 'Lock discussion'}</button><button role="menuitem" class="mod-danger" onclick={() => moderatePost('remove')} disabled={busy}>Remove post…</button></div>{/if}</div>{/if}<button onclick={reportPost} class="reddit-more-button" title="Report post" aria-label="Report post"><MoreHorizontal size={18} /></button>
		</div>
	</div>
</article>

<style>
	.reddit-post.moderated-hidden { display:none; }
	.community-mod-menu { position:relative; }
	.author-karma { color:#68758d; font-size:9px; white-space:nowrap; }
	.moderator-action { display:inline-flex; align-items:center; gap:4px; color:#9edfc9; }
	.moderator-action span { font-size:10px; font-weight:700; }
	.community-mod-dropdown { position:absolute; z-index:60; right:0; bottom:calc(100% + 6px); width:174px; padding:5px; border:1px solid var(--reddit-border,#2a393e); border-radius:9px; background:#101c20; box-shadow:0 12px 35px #0008; }
	.community-mod-dropdown button { display:block; width:100%; padding:9px 10px; border-radius:6px; text-align:left; color:var(--reddit-text,#d7dadc); font-size:11px; }
	.community-mod-dropdown button:hover { background:var(--reddit-hover,#223237); }
	.community-mod-dropdown .mod-danger { color:#ff9e91; }
	.reddit-post { content-visibility:auto; contain-intrinsic-size:auto 620px; display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 0; overflow: hidden; border: 1px solid var(--reddit-border, #343f42); border-radius: 12px; background: var(--reddit-card, #1a282d); color: var(--reddit-text, #d7dadc); transition: border-color .12s; }
	.reddit-post:hover { border-color: #506065; }
	.reddit-post-compact { grid-template-columns: 38px minmax(0, 1fr); }
	.reddit-vote-rail { display: flex; align-items: center; flex-direction: column; gap: 5px; padding: 13px 4px; background: rgba(0,0,0,.08); }
	.reddit-vote-button { display: flex; width: 30px; height: 28px; align-items: center; justify-content: center; border-radius: 6px; color: #829196; font-size: 15px; line-height: 1; }
	.reddit-vote-button:hover { background: rgba(255,255,255,.07); color: var(--reddit-orange, #ff4500); }
	.reddit-vote-button.downvote:hover { color: #7193ff; }
	.reddit-vote-button.vote-active-up { color: var(--reddit-orange, #ff4500); background: rgba(255,69,0,.12); }
	.reddit-vote-button.vote-active-down { color: #7193ff; background: rgba(100,130,255,.12); }
	.reddit-score { color: var(--reddit-text, #d7dadc); font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums; }
	.reddit-score.score-up { color: var(--reddit-orange, #ff4500); }
	.reddit-score.score-down { color: #7193ff; }
	.reddit-post-main { min-width: 0; padding: 12px 14px 10px 11px; }
	.reddit-post-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.reddit-community-avatar { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: 0 0 28px; border-radius: 50%; background: #ffb000; color: #1c292d; font-size: 16px; font-weight: 900; }
	.reddit-post-byline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; color: var(--reddit-muted, #829196); font-size: 11px; }
	.reddit-community-name { color: var(--reddit-text-strong, #f2f4f5); font-size: 12px; font-weight: 700; }
	.reddit-author { color: var(--reddit-muted, #829196); }
	.reddit-author:hover, .reddit-community-name:hover { text-decoration: underline; }
	.reddit-post-byline time { white-space: nowrap; }
	.meta-dot { color: #68777c; }
	.reddit-follow-link { margin-left: auto; flex: 0 0 auto; border-radius: 999px; padding: 5px 10px; background: var(--reddit-blue, #d7e7ea); color: #102126; font-size: 11px; font-weight: 800; }
	.reddit-follow-link:hover { filter: brightness(1.06); }
	.post-state-labels { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
	.post-state-labels span { border-radius: 4px; padding: 3px 6px; background: rgba(255,255,255,.06); color: var(--reddit-muted, #829196); font-size: 10px; }
	.post-state-labels .nsfw-label { background: rgba(255,69,0,.14); color: #ff9a77; }
	.reddit-post-title-link { display: block; margin-top: 8px; }
	.reddit-post-title-link h2 { color: var(--reddit-text-strong, #f2f4f5); font-size: 16px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
	.reddit-post-title-link:hover h2 { color: var(--reddit-blue, #d7e7ea); }
	.reddit-post-flair { display: inline-block; margin-top: 7px; border-radius: 4px; padding: 3px 7px; background: #334449; color: #d5e2e5; font-size: 10px; font-weight: 700; }
	.reddit-post-body { white-space: pre-line; margin-top: 8px; color: var(--reddit-text, #d7dadc); font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
	.reddit-post-body.body-compact { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
	.reddit-post-media { display: grid; gap: 8px; margin-top: 12px; justify-items: start; }
	.reddit-image-link { display: block; width: 100%; max-height: 600px; overflow: hidden; border: 1px solid rgba(255,255,255,.07); border-radius: 8px; background: #0d1518; text-align: center; }
	.reddit-image { display: block; width: 100%; max-height: 600px; object-fit: contain; margin: 0 auto; }
	.reddit-video { display: block; width: 100%; max-height: 580px; background: #060a0b; border-radius: 8px; }
	.reddit-audio { display: block; width: 100%; }
	.reddit-link-preview { display: flex; align-items: center; gap: 10px; min-width: 0; margin-top: 12px; border: 1px solid var(--reddit-border, #343f42); border-radius: 8px; padding: 10px; background: rgba(0,0,0,.08); }
	.reddit-link-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex: 0 0 32px; border-radius: 6px; background: rgba(215,231,234,.08); color: var(--reddit-blue, #d7e7ea); font-size: 19px; }
	.reddit-link-copy { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
	.reddit-link-copy strong { color: var(--reddit-text, #d7dadc); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.reddit-link-copy small { color: var(--reddit-muted, #829196); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.reddit-link-open { color: var(--reddit-blue, #d7e7ea); font-size: 10px; white-space: nowrap; }
	.reddit-poll { margin-top: 13px; border: 1px solid var(--reddit-border, #343f42); border-radius: 8px; padding: 11px; }
	.reddit-poll-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 9px; }
	.reddit-poll-header strong { color: var(--reddit-text-strong, #f2f4f5); font-size: 12px; }
	.reddit-poll-header span { color: var(--reddit-muted, #829196); font-size: 10px; }
	.reddit-poll-option { display: flex; align-items: center; gap: 9px; margin-top: 7px; border: 1px solid #47585e; border-radius: 7px; padding: 10px; color: var(--reddit-text, #d7dadc); font-size: 12px; cursor: pointer; }
	.reddit-poll-option:hover { border-color: var(--reddit-blue, #d7e7ea); }
	.reddit-poll-option input { accent-color: var(--reddit-blue, #d7e7ea); }
	.reddit-poll-result { position: relative; margin-top: 7px; overflow: hidden; border: 1px solid #47585e; border-radius: 7px; padding: 10px; }
	.reddit-poll-bar { position: absolute; inset: 0 auto 0 0; background: rgba(112,178,195,.17); }
	.reddit-poll-result-label { position: relative; display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
	.reddit-poll-result-label strong { color: var(--reddit-text-strong, #f2f4f5); }
	.reddit-poll-vote { margin-top: 9px; border-radius: 999px; padding: 8px 17px; background: var(--reddit-blue, #d7e7ea); color: #102126; font-size: 12px; font-weight: 800; }
	.reddit-poll-vote:disabled { opacity: .55; }
	.reddit-post-notice { margin-top: 8px; color: var(--reddit-blue, #d7e7ea); font-size: 11px; }
	.reddit-post-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 12px; }
	.reddit-action-button { display: inline-flex; align-items: center; gap: 6px; border-radius: 6px; padding: 7px 9px; color: var(--reddit-muted, #829196); font-size: 11px; }
	.reddit-action-button :global(svg) { flex: 0 0 auto; }
	.reddit-action-button strong { font-size: 11px; font-weight: 700; }
	.reddit-action-button:hover { background: rgba(255,255,255,.07); color: var(--reddit-text-strong, #f2f4f5); }
	.reddit-action-button.action-saved { color: var(--reddit-blue, #d7e7ea); }
	.reddit-more-button { margin-left: auto; border-radius: 6px; padding: 5px 8px; color: var(--reddit-muted, #829196); font-size: 13px; letter-spacing: 1px; }
	.reddit-more-button:hover { background: rgba(255,255,255,.07); }
	.reddit-more-button :global(svg) { display:block; }
	@media (max-width: 760px) { .reddit-post { grid-template-columns: 32px minmax(0,1fr); border-radius: 9px; } .reddit-vote-rail { padding: 10px 1px; gap: 4px; } .reddit-vote-button { width: 27px; } .reddit-post-main { padding: 10px 10px 8px 8px; } .reddit-post-title-link h2 { font-size: 15px; } .reddit-post-byline { font-size: 10px; } .reddit-community-name { font-size: 11px; } .reddit-community-avatar { width: 25px; height: 25px; flex-basis: 25px; } .reddit-link-open { display: none; } .reddit-action-button { padding: 7px 6px; gap: 4px; } }
</style>
