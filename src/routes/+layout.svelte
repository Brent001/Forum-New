<script lang="ts">
	import './layout.css';
	import Button from '$lib/components/ui/Button.svelte';
	import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
	import BackgroundTaskCenter from '$lib/components/ui/BackgroundTaskCenter.svelte';
	import { Bell, CalendarDays, ChevronDown, Compass, Home, LogOut, Mail, Paintbrush, Plus, Search, Settings } from '@lucide/svelte';

	const { data, children } = $props() as {
		data: {
			setupComplete: boolean;
			user?: { id?: string; name?: string; username?: string; email?: string; isOwner?: boolean; isAdmin?: boolean } | null;
			site?: { name?: string; tagline?: string; logoUrl?: string | null };
			pathname?: string;
		};
		children?: () => any;
	};
	const isSetupPage = $derived(data.pathname === '/setup' || data.pathname?.startsWith('/setup/'));
	const isHomePage = $derived(data.pathname === '/');
	const siteName = $derived(data.site?.name || 'Nexus');
	const userLabel = $derived(data.user?.name || data.user?.username || data.user?.email || 'Member');

	async function signOut() {
		await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
		window.location.href = '/';
	}
</script>

<div class="app-shell min-h-screen text-slate-100">
	{#if !isSetupPage}
		<header class="site-header sticky top-0 z-50">
			<div class="reddit-topbar">
				<div class="topbar-brand-group">
					<a href="/" class="brand-mark" aria-label={`${siteName} home`}>
						{#if data.site?.logoUrl}
							<img src={data.site.logoUrl} alt="" class="brand-image" />
						{:else}
							<span class="brand-icon">n.</span>
						{/if}
						<span class="brand-wordmark">{siteName}</span>
					</a>
					<a href="/communities" class="topbar-explore"><ChevronDown size={15} /><span>Communities</span></a>
					<a href="/events" class="topbar-explore topbar-feature-link"><CalendarDays size={15}/><span>Events</span></a>
					<a href="/place" class="topbar-explore topbar-feature-link"><Paintbrush size={15}/><span>Place</span></a>
				</div>
				<form action="/search" method="GET" class="topbar-search">
					<Search size={18} strokeWidth={1.8} aria-hidden="true" />
					<input type="search" name="q" placeholder="Search posts, communities, and people" />
				</form>
				<div class="topbar-actions">
					{#if data.user}
						<a href="/notifications" class="topbar-icon-link" aria-label="Notifications" title="Notifications"><Bell size={18} strokeWidth={1.8} /></a>
						<a href="/messages" class="topbar-icon-link" aria-label="Messages" title="Messages"><Mail size={18} strokeWidth={1.8} /></a>
						<a href={`/u/${encodeURIComponent(data.user.username || data.user.id || '')}`} class="topbar-profile" title="Your profile">
							<span class="avatar-mini">{(userLabel[0] || 'M').toUpperCase()}</span>
							<span class="topbar-user-label">{userLabel}</span><ChevronDown size={14} class="profile-chevron" />
						</a>
						{#if data.user.isOwner}<a href="/admin" class="topbar-icon-link owner-top-link" title="Owner dashboard" aria-label="Owner dashboard"><Settings size={18} strokeWidth={1.8} /></a>{/if}
						<button class="topbar-icon-link signout-link" onclick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={18} strokeWidth={1.8} /></button>
					{:else}
						<Button href="/login" variant="ghost">Log in</Button>
						<Button href="/login" variant="primary">Sign up</Button>
					{/if}
				</div>
			</div>
		</header>
	{/if}

	<main class:min-h-screen={isSetupPage} class:pt-5={!isSetupPage} class="relative">
		{@render children?.()}
	</main>
	{#if !isSetupPage}
		<nav class="mobile-bottom-nav" aria-label="Mobile primary navigation">
			<a href="/" class:mobile-nav-active={isHomePage} aria-label="Home"><Home size={19}/><span>Home</span></a>
			<a href="/communities" class:mobile-nav-active={data.pathname?.startsWith('/communities') || data.pathname?.startsWith('/c/')} aria-label="Communities"><Compass size={19}/><span>Explore</span></a>
			<a href={data.user ? '/?compose=1' : '/login'} onclick={(event) => { if (isHomePage && data.user) { event.preventDefault(); window.dispatchEvent(new Event('nexus:compose')); } }} class="mobile-nav-create" aria-label="Create post"><Plus size={22}/><span>Post</span></a>
			<a href={data.user ? '/notifications' : '/login'} class:mobile-nav-active={data.pathname?.startsWith('/notifications')} aria-label="Notifications"><Bell size={19}/><span>Activity</span></a>
			<a href={data.user ? '/messages' : '/login'} class:mobile-nav-active={data.pathname?.startsWith('/messages')} aria-label="Messages"><Mail size={19}/><span>Chat</span></a>
		</nav>
		<footer class:home-footer-hidden={isHomePage} class="border-t border-white/[0.06] px-4 py-7 text-center text-xs text-slate-600">
			<div>{siteName} · © 2026</div>
			<nav aria-label="Legal and support" class="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2"><a href="/terms" class="hover:text-slate-300">Terms</a><a href="/privacy" class="hover:text-slate-300">Privacy</a><a href="/support" class="hover:text-slate-300">Help center</a></nav>
		</footer>
	{/if}
	<ToastViewport />
	{#if !isSetupPage}<BackgroundTaskCenter />{/if}
</div>
