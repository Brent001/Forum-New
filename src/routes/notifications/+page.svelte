<script lang="ts">
	type Notification = { id: string; type: string; message: string; url: string | null; isRead: boolean; createdAt: Date | string };
	const { data } = $props() as { data: { notifications: Notification[]; unread: number; viewer: { id: string; name: string } } };
	let rows = $state(data.notifications);
	let unread = $state(data.unread);
	let notice = $state('');
	function time(date: Date | string) { return new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
	function icon(type: string) { return ({ reply: '↳', follow: '◎', mention: '@', system: '✦', moderation: '⚑' } as Record<string, string>)[type] ?? '✦'; }
	async function markRead(id: string) {
		const item = rows.find((row) => row.id === id); if (!item || item.isRead) return;
		try { const response = await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not update notification.'); rows = rows.map((row) => row.id === id ? { ...row, isRead: true } : row); unread = Math.max(0, unread - 1); }
		catch (error) { notice = error instanceof Error ? error.message : 'Could not update notification.'; }
	}
	async function markAll() {
		try { const response = await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ all: true }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not mark notifications read.'); rows = rows.map((row) => ({ ...row, isRead: true })); unread = 0; notice = 'All notifications marked as read.'; }
		catch (error) { notice = error instanceof Error ? error.message : 'Could not update notifications.'; }
	}
</script>

<div class="mx-auto max-w-[900px] px-4 pb-14 sm:px-6">
	<div class="surface-card relative overflow-hidden rounded-[1.5rem] p-6 sm:p-8"><div class="absolute -right-10 -top-20 h-60 w-60 rounded-full bg-indigo-400/[0.08] blur-2xl"></div><div class="relative flex flex-wrap items-end justify-between gap-4"><div><p class="text-[10px] font-extrabold uppercase tracking-[.17em] text-indigo-200">INBOX</p><h1 class="mt-2 text-3xl font-extrabold tracking-[-.04em] text-white">Notifications<span class="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-indigo-300/15 px-2 align-middle text-xs text-indigo-100">{unread}</span></h1><p class="mt-2 text-sm text-slate-400">Replies, new followers, and the things happening around you.</p></div>{#if unread > 0}<button onclick={markAll} class="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-white/[0.08]">Mark all read</button>{/if}</div></div>
	{#if notice}<p class="mt-3 text-xs text-indigo-200" role="status">{notice}</p>{/if}
	<div class="surface-card mt-4 overflow-hidden rounded-[1.4rem]">
		{#each rows as item (item.id)}
			<div class={`notification-row flex items-start gap-4 border-b border-white/[0.055] p-4 sm:p-5 ${item.isRead ? 'opacity-65' : 'notification-unread'}`}>
				<div class="notification-icon">{icon(item.type)}</div>
				<div class="min-w-0 flex-1"><p class="text-sm leading-6 text-slate-200">{item.message}</p><p class="mt-1.5 text-[10px] text-slate-600">{time(item.createdAt)} <span class="mx-1">·</span>{item.type}</p><div class="mt-3 flex flex-wrap gap-2">{#if item.url}<a href={item.url} onclick={() => markRead(item.id)} class="text-xs font-bold text-indigo-200 hover:text-white">Open activity ↗</a>{/if}{#if !item.isRead}<button onclick={() => markRead(item.id)} class="text-xs font-semibold text-slate-500 hover:text-slate-200">Mark read</button>{/if}</div></div>
				{#if !item.isRead}<span class="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-300"></span>{/if}
			</div>
		{:else}
			<div class="px-6 py-14 text-center"><div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025] text-2xl text-indigo-200">✦</div><h2 class="mt-4 font-extrabold text-white">All quiet for now</h2><p class="mt-2 text-sm text-slate-500">When people reply or follow you, you’ll see it here.</p><a href="/" class="mt-5 inline-block text-xs font-bold text-indigo-200 hover:text-white">Back to the feed ↗</a></div>
		{/each}
	</div>
</div>
<style>
	.notification-row:last-child { border-bottom: 0; }
	.notification-unread { background: linear-gradient(90deg,rgba(129,140,248,.055),transparent 80%); }
	.notification-icon { display:flex; width:38px; height:38px; flex-shrink:0; align-items:center; justify-content:center; border:1px solid rgba(151,162,255,.12); border-radius:13px; background:rgba(129,140,248,.075); color:#b6c0ff; font-size:17px; }
</style>
