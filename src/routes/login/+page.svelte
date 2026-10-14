<script lang="ts">
	import { goto } from '$app/navigation';
	let mode = $state('login');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let message = $state('');
	let error = $state('');
	function resetForm() { error = ''; message = ''; }
	function destination() {
		const requested = new URLSearchParams(window.location.search).get('callbackURL') || '/';
		return requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
	}
	async function handleSubmit(event: Event) {
		event.preventDefault(); loading = true; error = ''; message = '';
		try {
			const endpoint = mode === 'login' ? '/api/auth/sign-in/email' : '/api/auth/sign-up/email';
			const payload: Record<string, unknown> = { email: email.trim(), password, callbackURL: destination() };
			if (mode === 'register') payload.name = name.trim() || email.split('@')[0];
			const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result?.message || 'Unable to complete authentication.');
			message = mode === 'login' ? 'You are signed in. Opening your feed…' : 'Account created. Welcome to the community…';
			await goto(destination());
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to complete authentication.';
		} finally { loading = false; }
	}
</script>

<div class="login-shell relative min-h-[calc(100vh-5rem)] overflow-hidden px-4 py-10 text-slate-100 sm:px-6 lg:py-16">
	<div class="login-glow login-glow-one"></div><div class="login-glow login-glow-two"></div>
	<div class="relative mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.05fr_.95fr] lg:items-stretch">
		<section class="login-story surface-card relative flex min-h-[370px] flex-col justify-between overflow-hidden rounded-[1.8rem] p-7 sm:p-10 lg:p-12">
			<div><a href="/" class="inline-flex items-center gap-3 text-sm font-extrabold tracking-tight text-white"><span class="login-brand">n.</span> NEXUS SOCIAL</a>
				<div class="mt-14 inline-flex items-center gap-2 rounded-full border border-indigo-300/15 bg-indigo-300/[0.07] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.17em] text-indigo-100"><span class="h-1.5 w-1.5 rounded-full bg-emerald-300"></span> One network. Many interests.</div>
				<h1 class="mt-5 max-w-xl text-4xl font-black leading-[1.04] tracking-[-.055em] text-white sm:text-5xl">Good conversations change everything.</h1>
				<p class="mt-5 max-w-lg text-sm leading-7 text-slate-400">Follow people, explore communities, share what you are thinking, and shape a feed that feels like yours.</p>
			</div>
			<div class="mt-14 grid grid-cols-3 gap-3 border-t border-white/[0.07] pt-5">
				<div><span class="login-feature-icon">✦</span><p class="mt-2 text-xs font-bold text-slate-200">Your feed</p><p class="mt-1 text-[10px] leading-4 text-slate-600">Personalized or latest</p></div>
				<div><span class="login-feature-icon">◉</span><p class="mt-2 text-xs font-bold text-slate-200">Your people</p><p class="mt-1 text-[10px] leading-4 text-slate-600">Follow and connect</p></div>
				<div><span class="login-feature-icon">⌘</span><p class="mt-2 text-xs font-bold text-slate-200">Your space</p><p class="mt-1 text-[10px] leading-4 text-slate-600">Build communities</p></div>
			</div>
		</section>

		<form class="surface-card rounded-[1.8rem] p-6 sm:p-9 lg:p-10" onsubmit={handleSubmit}>
			<div class="mb-7"><p class="text-[10px] font-extrabold uppercase tracking-[.2em] text-indigo-200">{mode === 'login' ? 'Welcome back' : 'Join the network'}</p><h2 class="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{mode === 'login' ? 'Sign in to Nexus.' : 'Create your account.'}</h2><p class="mt-2 text-sm leading-6 text-slate-500">{mode === 'login' ? 'Pick up where the conversation left off.' : 'A profile is all you need to get started.'}</p></div>
			{#if error}<div class="mb-4 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-4 py-3 text-sm text-rose-200" role="alert">{error}</div>{/if}
			{#if message}<div class="mb-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-sm text-emerald-100" role="status">{message}</div>{/if}
			<div class="space-y-4">
				{#if mode === 'register'}<label class="auth-label">Display name<input bind:value={name} name="name" type="text" autocomplete="name" maxlength="60" placeholder="What should people call you?" required class="auth-input" /></label>{/if}
				<label class="auth-label">Email address<input bind:value={email} name="email" type="email" autocomplete="email" placeholder="you@example.com" required class="auth-input" /></label>
				<label class="auth-label">Password<input bind:value={password} name="password" type="password" autocomplete={mode === 'login' ? 'current-password' : 'new-password'} minlength="8" placeholder="At least 8 characters" required class="auth-input" /></label>
			</div>
			<button type="submit" disabled={loading} class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-300 px-5 py-3.5 text-sm font-extrabold text-slate-950 transition hover:bg-indigo-200 disabled:cursor-wait disabled:opacity-60">{loading ? 'Please wait…' : mode === 'login' ? 'Sign in to your feed' : 'Create account'} <span aria-hidden="true">↗</span></button>
			<div class="my-6 flex items-center gap-3"><span class="h-px flex-1 bg-white/[0.07]"></span><span class="text-[10px] text-slate-600">OR</span><span class="h-px flex-1 bg-white/[0.07]"></span></div>
			<p class="text-center text-sm text-slate-500">{mode === 'login' ? 'New to Nexus?' : 'Already have an account?'} <button type="button" class="font-bold text-indigo-200 transition hover:text-white" onclick={() => { mode = mode === 'login' ? 'register' : 'login'; resetForm(); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
			<p class="mt-8 text-center text-[10px] leading-5 text-slate-600">Be thoughtful with what you post. Profiles are public by default; avoid adding private contact details to your profile.</p>
		</form>
	</div>
</div>

<style>
	.login-shell { background:radial-gradient(ellipse at 50% 0,rgba(70,80,176,.12),transparent 42%); }
	.login-glow { position:absolute; width:320px; height:320px; border-radius:50%; filter:blur(2px); pointer-events:none; }
	.login-glow-one { top:8%; left:-190px; background:radial-gradient(circle,rgba(60,217,193,.08),transparent 68%); }
	.login-glow-two { right:-180px; bottom:4%; background:radial-gradient(circle,rgba(150,115,255,.11),transparent 68%); }
	.login-brand { display:flex; height:32px; width:32px; align-items:center; justify-content:center; border-radius:10px; background:linear-gradient(135deg,#b8c0ff,#76ded1); color:#0b1020; font-size:16px; }
	.login-feature-icon { display:inline-flex; height:30px; width:30px; align-items:center; justify-content:center; border:1px solid rgba(170,180,255,.13); border-radius:10px; color:#bbc2ff; background:rgba(140,150,255,.06); }
	.auth-label { display:grid; gap:8px; color:#aeb7ca; font-size:11px; font-weight:750; }
	.auth-input { width:100%; border:1px solid rgba(255,255,255,.09); border-radius:12px; background:rgba(4,7,13,.32); padding:12px 13px; color:#f0f2fc; font-size:13px; font-weight:400; outline:none; transition:border-color .18s,box-shadow .18s; }
	.auth-input:focus { border-color:rgba(163,172,255,.48); box-shadow:0 0 0 3px rgba(129,140,248,.07); }
	.auth-input::placeholder { color:#59647a; }
</style>
