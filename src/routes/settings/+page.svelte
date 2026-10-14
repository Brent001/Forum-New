<script lang="ts">
	import Dropdown, { type DropdownOption } from '$lib/components/ui/Dropdown.svelte';
	import VerifiedBadge from '$lib/components/ui/VerifiedBadge.svelte';
	import KarmaProgress from '$lib/components/ui/KarmaProgress.svelte';
	import { uploadMediaFile } from '$lib/client/media-upload.js';
	import { notify } from '$lib/client/notifications.js';
	const { data } = $props() as { data: { verification: { isVerified: boolean; latest: { id: string; reason: string; status: string; reviewerNote: string | null; createdAt: Date | string } | null }; profile: { username: string; displayName: string; bio: string; avatarUrl: string; bannerUrl: string; profileVisibility: string; dmPolicy: string; discoverable: boolean; preferredFeed: string; mutedKeywords: string[]; isNsfwEnabled: boolean; isOwner: boolean; karma: number; postKarma: number; commentKarma: number } } };
	let displayName = $state(data.profile.displayName);
	let bio = $state(data.profile.bio);
	let avatarUrl = $state(data.profile.avatarUrl);
	let bannerUrl = $state(data.profile.bannerUrl);
	let profileVisibility = $state(data.profile.profileVisibility);
	let dmPolicy = $state(data.profile.dmPolicy);
	let discoverable = $state(data.profile.discoverable);
	let uploading = $state(false);
	let uploadProgress = $state(0);
	let uploadStage = $state('');
	let preferredFeed = $state(data.profile.preferredFeed);
	let mutedKeywordsText = $state(data.profile.mutedKeywords.join(', '));
	let isNsfwEnabled = $state(data.profile.isNsfwEnabled);
	let saving = $state(false);
	let notice = $state('');
	let failed = $state(false);
	let verificationReason = $state('');
	let verificationEvidence = $state('');
	let verificationBusy = $state(false);
	let verificationNotice = $state('');
	const feedOptions: DropdownOption[] = [{value:'for-you',label:'For you — personalized'},{value:'following',label:'Following — my network'},{value:'latest',label:'Latest — newest first'},{value:'trending',label:'Trending — rising conversations'},{value:'best',label:'Best — confidence-weighted votes'},{value:'top',label:'Top — highest score'},{value:'hot',label:'Hot — Reddit-style hot score'}];
	const visibilityOptions: DropdownOption[] = [{value:'public',label:'Public profile'},{value:'private',label:'Private profile (only me and site owner)'}];
	const dmOptions: DropdownOption[] = [{value:'everyone',label:'Everyone'},{value:'following',label:'People I follow'},{value:'none',label:'Nobody'}];
	async function uploadImage(file: File, kind: 'avatar' | 'banner') {
		uploading = true; uploadProgress = 0; uploadStage = `Preparing ${kind}`; notice = '';
		try {
			const result = await uploadMediaFile(file, kind, {
				visibility: profileVisibility,
				onProgress: (progress) => { uploadProgress = progress.total ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : 0; },
				onStage: (stage) => { uploadStage = stage; }
			});
			if (kind === 'avatar') avatarUrl = result.url; else bannerUrl = result.url;
			notice = 'Image uploaded. Save changes to apply it.'; failed = false; notify(notice, 'success');
		} catch (error) { notice = error instanceof Error ? error.message : 'Upload failed.'; failed = true; notify(notice, 'error'); }
		finally { uploading = false; uploadStage = ''; }
	}

	async function requestVerification() {
		if (verificationBusy) return;
		verificationBusy = true; verificationNotice = '';
		try {
			const response = await fetch('/api/verification-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: verificationReason, evidenceUrl: verificationEvidence }) });
			const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not submit verification request.');
			verificationNotice = 'Request submitted. It will appear as pending until the site owner reviews it.';
			window.location.reload();
		} catch (error) { verificationNotice = error instanceof Error ? error.message : 'Could not submit verification request.'; }
		finally { verificationBusy = false; }
	}
	async function save() {
		saving = true; notice = '';
		try {
			const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName, bio, avatarUrl, bannerUrl, profileVisibility, dmPolicy, discoverable, preferredFeed, mutedKeywords: mutedKeywordsText.split(',').map((word) => word.trim()).filter(Boolean), isNsfwEnabled }) });
			const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not save settings.');
			notice = 'Your profile and feed preferences have been saved.'; failed = false; notify(notice, 'success');
		} catch (error) { notice = error instanceof Error ? error.message : 'Could not save settings.'; failed = true; notify(notice, 'error'); }
		finally { saving = false; }
	}
</script>

<div class="mx-auto max-w-[950px] px-4 pb-14 sm:px-6">
	<div class="surface-card relative overflow-hidden rounded-[1.55rem] p-6 sm:p-8"><div class="settings-glow"></div><div class="relative"><p class="text-[10px] font-extrabold uppercase tracking-[.17em] text-indigo-200">YOUR CONTROL ROOM</p><h1 class="mt-2 text-3xl font-extrabold tracking-[-.045em] text-white">Make Nexus yours.</h1><p class="mt-2 max-w-xl text-sm leading-6 text-slate-400">Shape how people see you and tune your feed toward the conversations you care about.</p></div></div>
	<form onsubmit={(event) => { event.preventDefault(); save(); }} class="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
		<div class="space-y-5">
			<section class="surface-card rounded-[1.4rem] p-5 sm:p-6"><div><p class="text-[10px] font-bold uppercase tracking-[.16em] text-slate-600">IDENTITY</p><h2 class="mt-1.5 text-lg font-extrabold text-white">Profile details</h2></div><div class="mt-5 grid gap-4"><label class="setting-label">Display name<input bind:value={displayName} maxlength="60" minlength="2" required class="setting-input"/></label><label class="setting-label">Profile image URL<input bind:value={avatarUrl} type="url" placeholder="https://…" class="setting-input"/><span class="-mt-2 text-[10px] font-normal text-slate-600">Use an image URL you own or have permission to use. Leave empty to use the default avatar.</span></label><div class="setting-label">Upload profile photo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" disabled={uploading} onchange={(event) => { const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (file) uploadImage(file, 'avatar'); }} class="setting-input"/><span class="-mt-2 text-[10px] font-normal text-slate-600">Private Backblaze B2 storage; maximum 15 MB.</span></div>{#if avatarUrl}<img src={avatarUrl} alt="Profile photo preview" loading="lazy" class="profile-avatar-preview" />{/if}<label class="setting-label">Profile banner URL<input bind:value={bannerUrl} type="url" placeholder="https://… or upload below" class="setting-input"/></label><div class="setting-label">Upload profile banner<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" disabled={uploading} onchange={(event) => { const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (file) uploadImage(file, 'banner'); }} class="setting-input"/></div>{#if bannerUrl}<img src={bannerUrl} alt="Profile banner preview" loading="lazy" class="profile-banner-preview" />{/if}<label class="setting-label">Bio<textarea bind:value={bio} maxlength="280" rows="4" placeholder="A few words about what you care about…" class="setting-input"></textarea><span class="-mt-2 text-right text-[10px] font-normal text-slate-600">{bio.length}/280</span></label></div>{#if uploading}<div class="profile-upload-progress" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin="0" aria-valuemax="100"><div><span>{uploadStage || 'Uploading profile image…'}</span><b>{uploadProgress}%</b></div><span><i style={`width:${uploadProgress}%`}></i></span></div>{/if}</section>
			<section class="surface-card rounded-[1.4rem] p-5 sm:p-6"><div><p class="text-[10px] font-bold uppercase tracking-[.16em] text-slate-600">TRUST & REPUTATION</p><h2 class="mt-1.5 text-lg font-extrabold text-white">Verification and karma</h2><p class="mt-1 text-xs leading-5 text-slate-500">Verification is reviewed by the site owner. Karma reflects community votes and does not grant special permissions.</p></div><div class="mt-4"><KarmaProgress total={data.profile.karma} post={data.profile.postKarma} comment={data.profile.commentKarma} compact/></div><div class="mt-5 rounded-xl border border-white/[0.07] bg-black/10 p-4">{#if data.verification.isVerified}<div class="flex items-center gap-2 text-sm font-bold text-sky-200"><VerifiedBadge size={19}/> Your account is verified</div><p class="mt-2 text-xs leading-5 text-slate-500">The badge confirms your identity or public presence has been reviewed. It is separate from karma and does not imply endorsement.</p>{:else if data.verification.latest?.status === 'pending'}<p class="text-sm font-bold text-amber-200">Verification request pending</p><p class="mt-2 text-xs leading-5 text-slate-500">Submitted {new Date(data.verification.latest.createdAt).toLocaleDateString()}. The owner will review your request.</p>{:else}<p class="text-sm font-bold text-slate-200">Request a verified badge</p><p class="mt-1 text-xs leading-5 text-slate-500">Explain why people should be able to distinguish your account as authentic. Do not submit passwords, government ID numbers, or other highly sensitive documents in this form.</p>{#if data.verification.latest?.status === 'rejected' && data.verification.latest.reviewerNote}<p class="mt-2 text-xs text-amber-200">Previous review: {data.verification.latest.reviewerNote}</p>{/if}<label class="setting-label mt-4">Why should this account be verified?<textarea bind:value={verificationReason} rows="3" maxlength="1200" minlength="30" placeholder="Describe your public identity, creator/community role, or impersonation risk…" class="setting-input"></textarea><span class="text-[10px] font-normal text-slate-600">30–1,200 characters.</span></label><label class="setting-label mt-3">Public supporting link (optional)<input bind:value={verificationEvidence} type="url" placeholder="https://your-official-site.example" class="setting-input"/><span class="text-[10px] font-normal text-slate-600">Use a public profile or website that helps verify your association.</span></label><button type="button" onclick={requestVerification} disabled={verificationBusy || verificationReason.trim().length < 30} class="mt-4 rounded-xl bg-sky-300 px-4 py-2.5 text-xs font-extrabold text-slate-950 disabled:opacity-40">{verificationBusy ? 'Submitting…' : 'Submit verification request'}</button>{/if}{#if verificationNotice}<p class="mt-3 text-xs text-indigo-200" role="status">{verificationNotice}</p>{/if}</div></section>
			<section class="surface-card rounded-[1.4rem] p-5 sm:p-6"><div><p class="text-[10px] font-bold uppercase tracking-[.16em] text-slate-600">PERSONALIZATION</p><h2 class="mt-1.5 text-lg font-extrabold text-white">Tune your feed</h2><p class="mt-1 text-xs leading-5 text-slate-500">These settings influence your personal feed, not other users’ timelines.</p></div><div class="mt-5 grid gap-4"><label class="setting-label">Default feed<Dropdown label="Default feed" value={preferredFeed} options={feedOptions} onChange={(value) => preferredFeed = value} fullWidth /></label><label class="setting-label">Mute keywords<input bind:value={mutedKeywordsText} placeholder="spoilers, crypto, topic name" class="setting-input"/><span class="-mt-2 text-[10px] font-normal leading-4 text-slate-600">Separate terms with commas. Matching posts will be hidden from your main feed.</span></label><label class="setting-toggle"><span><span class="block text-sm font-bold text-slate-200">Show sensitive posts</span><span class="mt-1 block text-xs leading-5 text-slate-500">Allow posts marked 18+ or sensitive to appear in your feed.</span></span><input type="checkbox" bind:checked={isNsfwEnabled} class="setting-checkbox"/></label></div></section>
			<section class="surface-card rounded-[1.4rem] p-5 sm:p-6"><div><p class="text-[10px] font-bold uppercase tracking-[.16em] text-slate-600">PRIVACY & CONTACT</p><h2 class="mt-1.5 text-lg font-extrabold text-white">You control your audience</h2></div><div class="mt-5 grid gap-4"><label class="setting-label">Profile visibility<Dropdown label="Profile visibility" value={profileVisibility} options={visibilityOptions} onChange={(value) => profileVisibility = value} fullWidth /></label><label class="setting-label">Who can start a DM?<Dropdown label="Who can start a DM?" value={dmPolicy} options={dmOptions} onChange={(value) => dmPolicy = value} fullWidth /></label><label class="setting-toggle"><span><span class="block text-sm font-bold text-slate-200">Allow discovery</span><span class="mt-1 block text-xs leading-5 text-slate-500">Let others find your account in public search.</span></span><input type="checkbox" bind:checked={discoverable} class="setting-checkbox"/></label><div class="flex flex-wrap gap-3 text-xs"><a class="text-indigo-200 hover:text-white" href="/privacy">Privacy notice & data rights ↗</a><a class="text-indigo-200 hover:text-white" href="/terms">Terms of service ↗</a><a class="text-indigo-200 hover:text-white" href="/support">Contact support ↗</a></div><p class="text-[10px] leading-5 text-slate-600">Encrypted DMs are designed so the database stores ciphertext, not message text. Keep your browser key safe; key recovery and multi-device sync are not yet provided.</p></div></section>
			{#if notice}<p class={`rounded-xl border px-4 py-3 text-xs ${failed ? 'border-rose-300/10 bg-rose-300/[0.04] text-rose-200' : 'border-emerald-300/10 bg-emerald-300/[0.04] text-emerald-100'}`} role="status">{notice}</p>{/if}
			<div class="flex flex-wrap items-center justify-between gap-3"><p class="text-[10px] text-slate-600">Signed in as @{data.profile.username}</p><button type="submit" disabled={saving} class="rounded-xl bg-indigo-300 px-5 py-3 text-xs font-extrabold text-slate-950 transition hover:bg-indigo-200 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes ↗'}</button></div>
		</div>
		<aside class="space-y-4"><div class="surface-card rounded-[1.35rem] p-4"><p class="text-[10px] font-bold uppercase tracking-[.15em] text-slate-600">FEED TRANSPARENCY</p><h3 class="mt-2 text-sm font-extrabold text-white">Why a post appears</h3><p class="mt-2 text-xs leading-5 text-slate-500">For you uses smoothed estimates of likes, replies, shares, saves, clicks and attention, then adjusts for recency, followed authors, community membership, and repeated posts from the same author.</p><p class="mt-3 text-xs leading-5 text-slate-500">Negative feedback such as reports and mutes is handled separately from eligibility checks. The ranking is heuristic and explainable, not a trained replica of X's Phoenix model.</p></div><div class="rounded-[1.35rem] border border-indigo-300/10 bg-indigo-300/[0.035] p-4"><p class="text-xs font-extrabold text-indigo-100">Your account</p><p class="mt-2 text-[11px] leading-5 text-slate-500">Profiles are public by default. Never add private contact information or share credentials in your bio.</p>{#if data.profile.isOwner}<a href="/admin" class="mt-3 inline-flex text-xs font-bold text-indigo-200 hover:text-white">Open owner studio ↗</a>{/if}</div></aside>
	</form>
</div>
<style>
	.settings-glow { position:absolute; right:-70px; top:-170px; height:350px; width:350px; border-radius:50%; background:radial-gradient(circle,rgba(131,140,255,.17),transparent 68%); }
	.setting-label { display:grid; gap:8px; color:#a6b0c4; font-size:11px; font-weight:700; }
	.setting-input { width:100%; border:1px solid rgba(255,255,255,.08); border-radius:12px; background:rgba(0,0,0,.19); padding:11px 12px; color:#e4e8f6; font-size:13px; font-weight:400; outline:none; }
	.setting-input:focus { border-color:rgba(156,167,255,.35); box-shadow:0 0 0 3px rgba(129,140,248,.05); }
	.setting-input::placeholder { color:#566176; }
	.setting-toggle { display:flex; align-items:center; justify-content:space-between; gap:16px; border:1px solid rgba(255,255,255,.06); border-radius:13px; background:rgba(255,255,255,.018); padding:13px; }
	.setting-checkbox { height:20px; width:20px; flex-shrink:0; border-color:#46516a; background-color:#111725; color:#a5b4fc; }

	.profile-upload-progress{margin-top:14px;padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(0,0,0,.14)}.profile-upload-progress>div{display:flex;justify-content:space-between;gap:10px;color:#a7b7bb;font-size:10px}.profile-upload-progress b{color:#ff8150}.profile-upload-progress>span{display:block;height:5px;margin-top:8px;overflow:hidden;border-radius:99px;background:#2a393d}.profile-upload-progress i{display:block;height:100%;border-radius:inherit;background:#ff6b35;transition:width .12s linear}

	.profile-avatar-preview{width:64px;height:64px;object-fit:cover;border:1px solid rgba(255,255,255,.1);border-radius:12px}.profile-banner-preview{width:100%;max-width:520px;height:100px;object-fit:cover;border:1px solid rgba(255,255,255,.1);border-radius:10px}
</style>
