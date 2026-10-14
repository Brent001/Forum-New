<script lang="ts">
	import { fly } from 'svelte/transition';
	import Dropdown, { type DropdownOption } from '$lib/components/ui/Dropdown.svelte';

	let step = $state(1);
	let saving = $state(false);
	let uploadingLogo = $state(false);
	let error = $state('');
	let success = $state('');
	let siteName = $state('Yappester');
	let tagline = $state('Find your people. Join the conversation.');
	let logoUrl = $state('');
	let brandColor = $state('#6d5dfc');
	let adminUsername = $state('');
	let adminEmail = $state('');
	let adminPassword = $state('');
	let adminConfirmPassword = $state('');
	let allowRegistration = $state(true);
	let inviteOnly = $state(false);
	let requireEmailVerification = $state(false);
	let enableNsfw = $state(false);
	let enableRealtimeFeed = $state(true);
	let defaultSort = $state('hot');
	const defaultSortOptions: DropdownOption[] = [{value:'hot',label:'Hot — popular and recent'},{value:'top',label:'Top — highest scoring'},{value:'new',label:'New — latest first'},{value:'best',label:'Best — quality weighted'},{value:'rising',label:'Rising — gaining momentum'}];
	let postRateLimitPerHour = $state(10);
	let logoInput = $state<HTMLInputElement | null>(null);
	const maxStep = 3;

	function validateStep() {
		if (step === 1) return siteName.trim().length > 0 && /^#[0-9a-fA-F]{6}$/.test(brandColor) && /^[a-zA-Z0-9_]{3,24}$/.test(adminUsername.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim()) && adminPassword.length >= 8 && adminPassword === adminConfirmPassword;
		if (step === 2) return Boolean(defaultSort) && Number(postRateLimitPerHour) >= 1 && Number(postRateLimitPerHour) <= 1000;
		return true;
	}
	function next() {
		error = '';
		success = '';
		if (!validateStep()) {
			error = step === 1 ? 'Check the site name, valid color, username (3–24 letters/numbers/underscores), email, and matching passwords (8+ characters).' : 'Check the feed settings and post limit (1–1000 per hour).';
			return;
		}
		if (step < maxStep) step += 1;
	}
	function back() { error = ''; if (step > 1) step -= 1; }

	async function uploadLogo(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		error = '';
		uploadingLogo = true;
		try {
			const form = new FormData();
			form.append('file', file);
			const response = await fetch('/api/setup/upload-logo', { method: 'POST', body: form });
			const result = await response.json();
			if (!response.ok || !result.ok) throw new Error(result.error ?? 'Logo upload failed.');
			logoUrl = result.url;
			success = 'Logo uploaded successfully.';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Logo upload failed.';
		} finally {
			uploadingLogo = false;
			input.value = '';
		}
	}

	async function launch() {
		if (!validateStep()) { error = 'Please resolve the remaining validation issues before launching.'; return; }
		saving = true;
		error = '';
		success = '';
		try {
			const response = await fetch('/api/setup/launch', {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ siteName, tagline, logoUrl, brandColor, adminUsername, adminEmail, adminPassword, allowRegistration, inviteOnly, requireEmailVerification, enableNsfw, enableRealtimeFeed, defaultSort, postRateLimitPerHour })
			});
			const result = await response.json();
			if (result.ok) {
				success = 'Setup complete. Opening your community…';
				window.location.href = '/';
			} else {
				error = result.error ?? 'Setup failed. Review the server log for details.';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not contact the setup service.';
		} finally { saving = false; }
	}
</script>

<svelte:head>
	<title>Welcome setup · {siteName || 'Yappester'}</title>
	<meta name="description" content="Set up your community platform." />
</svelte:head>

<div class="setup-page">
	<div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
	<header class="topbar">
		<div class="brand-mark" style={`--brand: ${/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#6d5dfc'}`}>
			{#if logoUrl}<img src={logoUrl} alt="" />{:else}<span>Y</span>{/if}
		</div>
		<div class="brand-copy"><strong>{siteName || 'Yappester'}</strong><span>COMMUNITY SETUP</span></div>
		<div class="secure-label"><span class="secure-dot"></span> Private setup session</div>
	</header>

	<main class="setup-layout">
		<section class="intro" in:fly={{ y: 12, duration: 300 }}>
			<div class="eyebrow"><span class="sparkle">✦</span> YOUR COMMUNITY STARTS HERE</div>
			<h1>Make a place<br />for <span>your people.</span></h1>
			<p>Give your community its identity, set your ground rules, and create the owner account. You can change these settings later.</p>
			<div class="preview-card">
				<div class="preview-cover" style={`--brand: ${/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#6d5dfc'}`}></div>
				<div class="preview-body">
					<div class="preview-logo" style={`--brand: ${/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#6d5dfc'}`}>
						{#if logoUrl}<img src={logoUrl} alt="Community logo preview" />{:else}<span>{(siteName.trim()[0] || 'Y').toUpperCase()}</span>{/if}
					</div>
					<div class="preview-name"><strong>{siteName || 'Your community'}</strong><span>{tagline || 'Your corner of the internet'}</span></div>
					<div class="preview-live"><i></i> Preview</div>
				</div>
				<div class="preview-footer"><span><b>◉</b> Conversations</span><span><b>♧</b> Communities</span><span><b>↗</b> Discover</span></div>
			</div>
			<div class="trust-note"><span>✧</span><div><strong>Your space, your rules.</strong><p>Owner controls and moderation tools are available after setup.</p></div></div>
		</section>

		<section class="wizard" aria-label="Platform setup wizard">
			<div class="wizard-head"><div><div class="eyebrow">INITIAL CONFIGURATION</div><h2>{step === 1 ? 'The essentials' : step === 2 ? 'Set the vibe' : 'Ready for launch?'}</h2><p>{step === 1 ? 'Identity and your owner account.' : step === 2 ? 'Choose how people join and interact.' : 'One last look before you open the doors.'}</p></div><div class="step-count">0{step}<span> / 0{maxStep}</span></div></div>
			<div class="step-track" aria-label={`Step ${step} of ${maxStep}`}><div class:active={step >= 1}></div><div class:active={step >= 2}></div><div class:active={step >= 3}></div></div>

			{#if error}<div class="notice error-notice" role="alert"><span>!</span><div><strong>Setup needs attention</strong><p>{error}</p></div></div>{/if}
			{#if success}<div class="notice success-notice" role="status"><span>✓</span><div><strong>All good</strong><p>{success}</p></div></div>{/if}

			<div class="wizard-content" in:fly={{ y: 8, duration: 180 }}>
				{#if step === 1}
					<div class="section-label"><span class="section-icon">✳</span><div><strong>Site identity</strong><small>How your platform appears to everyone.</small></div></div>
					<div class="field"><label for="siteName">Community name <em>Required</em></label><input id="siteName" bind:value={siteName} maxlength="48" placeholder="e.g. Yappester" autocomplete="organization" /></div>
					<div class="field"><label for="tagline">A short tagline <span>Optional</span></label><input id="tagline" bind:value={tagline} maxlength="100" placeholder="What brings your people together?" /></div>
					<div class="field"><div class="field-label"><span>Community logo</span><span>Optional · 2 MB max</span></div><div class="logo-uploader"><div class="logo-thumb" style={`--brand: ${/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#6d5dfc'}`}>{#if logoUrl}<img src={logoUrl} alt="Uploaded logo" />{:else}<span>✦</span>{/if}</div><div class="logo-upload-copy"><strong>{logoUrl ? 'Logo selected' : 'Add your own mark'}</strong><small>PNG, JPG, WebP, or GIF</small><button type="button" class="upload-button" onclick={() => logoInput?.click()} disabled={uploadingLogo}>{uploadingLogo ? 'Uploading…' : logoUrl ? 'Change logo' : 'Choose image'} <span>↑</span></button></div>{#if logoUrl}<button type="button" class="remove-logo" aria-label="Remove logo" onclick={() => logoUrl = ''}>×</button>{/if}</div><input id="communityLogoInput" aria-label="Upload community logo" bind:this={logoInput} class="hidden-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={uploadLogo} /></div>
					<div class="field"><label for="brandColor">Accent color <em>Required</em></label><div class="color-row"><input id="brandColor" type="color" value={/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#6d5dfc'} oninput={(event) => brandColor = (event.currentTarget as HTMLInputElement).value || '#6d5dfc'} /><input class="color-text" aria-label="Hex color" value={brandColor} oninput={(event) => brandColor = (event.currentTarget as HTMLInputElement).value} maxlength="7" /><span class="color-swatch" style={`background:${/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#6d5dfc'}`}></span></div></div>
					<div class="section-label owner-label"><span class="section-icon">♙</span><div><strong>Owner account</strong><small>This account receives full platform control.</small></div></div>
					<div class="field"><label for="adminUsername">Username <em>Required</em></label><input id="adminUsername" bind:value={adminUsername} placeholder="3–24 letters, numbers, underscores" autocomplete="username" maxlength="24" /><small class="hint">This will be your public handle.</small></div>
					<div class="field"><label for="adminEmail">Email address <em>Required</em></label><input id="adminEmail" bind:value={adminEmail} type="email" placeholder="you@example.com" autocomplete="email" /></div>
					<div class="field-grid"><div class="field"><label for="adminPassword">Password <em>Required</em></label><input id="adminPassword" bind:value={adminPassword} type="password" minlength="8" autocomplete="new-password" placeholder="8+ characters" /></div><div class="field"><label for="adminConfirmPassword">Confirm password <em>Required</em></label><input id="adminConfirmPassword" bind:value={adminConfirmPassword} type="password" autocomplete="new-password" placeholder="Repeat password" /></div></div>
					{#if adminConfirmPassword && adminPassword !== adminConfirmPassword}<p class="inline-warning">Passwords do not match yet.</p>{/if}
				{:else if step === 2}
					<div class="section-label"><span class="section-icon">☼</span><div><strong>Membership & safety</strong><small>Choose your starting community policy.</small></div></div>
					<div class="setting-row"><div class="setting-icon">♧</div><div class="setting-copy"><strong>Public registration</strong><small>Let new people create an account.</small></div><label class="switch"><input type="checkbox" bind:checked={allowRegistration} /><span></span></label></div>
					<div class="setting-row"><div class="setting-icon">⌑</div><div class="setting-copy"><strong>Invite-only access</strong><small>Restrict new membership to invitations.</small></div><label class="switch"><input type="checkbox" bind:checked={inviteOnly} /><span></span></label></div>
					<div class="setting-row"><div class="setting-icon">✓</div><div class="setting-copy"><strong>Email verification</strong><small>Require members to verify their email.</small></div><label class="switch"><input type="checkbox" bind:checked={requireEmailVerification} /><span></span></label></div>
					<div class="setting-row"><div class="setting-icon">◈</div><div class="setting-copy"><strong>NSFW communities</strong><small>Allow mature content spaces, subject to your rules and local law.</small></div><label class="switch"><input type="checkbox" bind:checked={enableNsfw} /><span></span></label></div>
					<div class="setting-row"><div class="setting-icon">⌁</div><div class="setting-copy"><strong>Live feed updates</strong><small>Enable realtime feed refresh features.</small></div><label class="switch"><input type="checkbox" bind:checked={enableRealtimeFeed} /><span></span></label></div>
					<div class="field field-spaced"><div class="field-label">Default feed ranking</div><Dropdown label="Default feed ranking" value={defaultSort} options={defaultSortOptions} onChange={(value) => defaultSort = value} fullWidth /></div>
					<div class="field"><label for="postRateLimitPerHour">Post limit per member <span>Posts per hour</span></label><input id="postRateLimitPerHour" type="number" min="1" max="1000" bind:value={postRateLimitPerHour} /></div>
					<div class="info-note"><span>ⓘ</span><p>These are initial defaults. You can refine moderation, community access, and account policies from the owner dashboard after launch.</p></div>
				{:else}
					<div class="section-label"><span class="section-icon">✦</span><div><strong>Your launch summary</strong><small>Everything here can be adjusted later.</small></div></div>
					<div class="summary-hero"><div class="summary-logo" style={`--brand:${/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#6d5dfc'}`}>{#if logoUrl}<img src={logoUrl} alt="" />{:else}<span>{(siteName.trim()[0] || 'Y').toUpperCase()}</span>{/if}</div><div><strong>{siteName}</strong><p>{tagline || 'Your community is ready to find its voice.'}</p></div><span class="ready-pill"><i></i> Ready</span></div>
					<div class="review-list"><div><span>Owner</span><strong>@{adminUsername}</strong></div><div><span>Email</span><strong>{adminEmail}</strong></div><div><span>Registration</span><strong>{inviteOnly ? 'Invite-only' : allowRegistration ? 'Public' : 'Closed'}</strong></div><div><span>Email verification</span><strong>{requireEmailVerification ? 'Required' : 'Optional'}</strong></div><div><span>Default feed</span><strong>{defaultSort[0].toUpperCase() + defaultSort.slice(1)}</strong></div><div><span>Post rate limit</span><strong>{postRateLimitPerHour} / hour</strong></div><div><span>Live updates</span><strong>{enableRealtimeFeed ? 'Enabled' : 'Disabled'}</strong></div><div><span>NSFW communities</span><strong>{enableNsfw ? 'Enabled' : 'Disabled'}</strong></div></div>
					<div class="info-note"><span>♢</span><p>Launching creates or verifies the owner account and saves your platform settings. Keep your database and authentication secret backed up.</p></div>
				{/if}
			</div>

			<footer class="wizard-footer"><button type="button" class="back-button" onclick={back} disabled={step === 1}>← <span>Back</span></button><div class="footer-right"><span class="step-caption">STEP {step} OF {maxStep}</span>{#if step < maxStep}<button type="button" class="continue-button" onclick={next}>Continue <span>→</span></button>{:else}<button type="button" class="continue-button launch-button" onclick={launch} disabled={saving}>{saving ? 'Launching…' : 'Launch community'} <span>↗</span></button>{/if}</div></footer>
		</section>
	</main>
	<footer class="page-footer"><span>✦ Built for communities, powered by people.</span><span>SETUP WIZARD · 1.0</span></footer>
</div>

<style>
	:global(body){margin:0;background:#0b0c12;color:#f3f4fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
	:global(*){box-sizing:border-box}
	.setup-page{min-height:100vh;position:relative;overflow:hidden;background:radial-gradient(ellipse at 12% 20%,rgba(109,93,252,.13),transparent 36%),radial-gradient(ellipse at 82% 78%,rgba(69,197,180,.08),transparent 35%),#0b0c12;padding:0 5vw 24px}
	.ambient{position:absolute;pointer-events:none;border-radius:50%;filter:blur(90px);opacity:.17}.ambient-one{width:260px;height:260px;background:#6d5dfc;top:16%;left:-160px}.ambient-two{width:300px;height:300px;background:#28bba8;bottom:2%;right:-210px}
	.topbar{height:86px;max-width:1320px;margin:0 auto;display:flex;align-items:center;gap:12px;position:relative;z-index:1;border-bottom:1px solid rgba(255,255,255,.075)}
	.brand-mark{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,var(--brand),#4bd8c4);color:#fff;font-size:21px;font-weight:850;box-shadow:0 7px 25px color-mix(in srgb,var(--brand),transparent 72%);overflow:hidden}.brand-mark img,.preview-logo img,.logo-thumb img,.summary-logo img{width:100%;height:100%;object-fit:cover}.brand-copy{display:flex;flex-direction:column;gap:2px}.brand-copy strong{font-size:15px;letter-spacing:-.3px}.brand-copy span,.secure-label,.eyebrow,.step-caption,.page-footer span:last-child{font-size:9px;letter-spacing:1.55px;font-weight:800;color:#85889b}.secure-label{margin-left:auto;display:flex;align-items:center;gap:8px;letter-spacing:.3px;font-size:11px;font-weight:600}.secure-dot,.preview-live i,.ready-pill i{width:6px;height:6px;border-radius:50%;background:#52d9b1;box-shadow:0 0 10px #52d9b188}
	.setup-layout{position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:54px 0 50px;display:grid;grid-template-columns:minmax(300px,.85fr) minmax(440px,1.05fr);gap:clamp(42px,7vw,108px);align-items:start}
	.intro{padding-top:26px}.eyebrow{display:flex;align-items:center;gap:8px;color:#a9a5ff;font-size:10px;letter-spacing:1.8px}.sparkle{font-size:16px;color:#b5adff}h1{font-size:clamp(38px,4.3vw,61px);line-height:1.04;letter-spacing:-3px;margin:25px 0 18px;font-weight:780}h1 span{background:linear-gradient(100deg,#b3aaff,#68e2cd);color:transparent;background-clip:text}.intro>p{font-size:14px;line-height:1.8;color:#9b9daf;max-width:405px;margin:0}
	.preview-card{margin-top:35px;border:1px solid rgba(255,255,255,.1);border-radius:18px;overflow:hidden;background:#12141d;box-shadow:0 25px 70px #0003}.preview-cover{height:83px;background:radial-gradient(ellipse at 20% 0%,color-mix(in srgb,var(--brand),transparent 20%),transparent 65%),linear-gradient(115deg,color-mix(in srgb,var(--brand),#151722 55%),#171923 75%);position:relative}.preview-cover:after{content:"";position:absolute;inset:0;background-image:radial-gradient(#ffffff12 1px,transparent 1px);background-size:12px 12px;opacity:.6}.preview-body{display:flex;align-items:center;gap:12px;padding:0 18px 17px}.preview-logo{width:51px;height:51px;margin-top:-24px;border:4px solid #12141d;border-radius:15px;background:var(--brand);display:grid;place-items:center;font-size:23px;font-weight:850;overflow:hidden;flex-shrink:0}.preview-name{min-width:0;display:flex;flex-direction:column;gap:4px;padding-top:8px}.preview-name strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.preview-name span{font-size:11px;color:#85899c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}.preview-live{margin-left:auto;align-self:flex-start;padding-top:12px;display:flex;align-items:center;gap:6px;color:#7dceb8;font-size:10px}.preview-footer{border-top:1px solid #ffffff0b;padding:13px 18px;display:flex;gap:19px;color:#8f93a7;font-size:10px}.preview-footer b{color:#aaa3ff;font-size:13px;margin-right:5px}.trust-note{display:flex;align-items:flex-start;gap:12px;margin-top:23px;color:#aaa5ff}.trust-note>span{font-size:20px}.trust-note strong{font-size:12px;color:#dedff0}.trust-note p{font-size:11px;color:#7f8295;line-height:1.6;margin:4px 0 0}
	.wizard{background:linear-gradient(145deg,#151722,#11121a);border:1px solid rgba(255,255,255,.1);border-radius:23px;box-shadow:0 30px 90px #0005;overflow:hidden}.wizard-head{padding:29px 30px 22px;display:flex;justify-content:space-between;gap:18px}.wizard-head h2{font-size:24px;letter-spacing:-.8px;margin:10px 0 6px}.wizard-head p{font-size:12px;color:#8c90a3;margin:0}.step-count{font-size:23px;font-weight:750;letter-spacing:-1px;color:#eeedff;white-space:nowrap}.step-count span{font-size:12px;color:#686c80;font-weight:500;letter-spacing:0}.step-track{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:0 30px}.step-track div{height:3px;border-radius:8px;background:#292b39}.step-track div.active{background:linear-gradient(90deg,#8274ff,#4ad8c2)}.wizard-content{padding:26px 30px 30px;min-height:440px}.section-label{display:flex;align-items:center;gap:12px;margin-bottom:22px}.section-icon{width:34px;height:34px;display:grid;place-items:center;border:1px solid #8075ff42;background:#8274ff12;border-radius:11px;color:#b4adff;font-size:17px}.section-label strong{display:block;font-size:13px}.section-label small{display:block;margin-top:3px;color:#777c91;font-size:11px}.owner-label{margin-top:29px;padding-top:22px;border-top:1px solid #ffffff0c}.field{margin-bottom:16px;min-width:0}.field label,.field-label{display:flex;align-items:center;gap:7px;justify-content:space-between;font-size:11px;font-weight:700;color:#dfe0ed;margin-bottom:8px}.field label em{font-style:normal;color:#9c96ff;font-size:9px;text-transform:uppercase;letter-spacing:.5px}.field label>span{font-size:10px;font-weight:500;color:#777c91}.field input:not([type=checkbox]):not([type=color]){width:100%;min-width:0;height:43px;border:1px solid #303241;background:#101119;color:#eff0fb;border-radius:10px;padding:0 13px;font:inherit;font-size:12px;outline:none;transition:border .15s,box-shadow .15s}.field input:focus{border-color:#8274ff;box-shadow:0 0 0 3px #8274ff1b}.field input::placeholder{color:#555a6f}.field small.hint{font-size:10px;color:#74798c;margin-top:6px;display:block}.logo-uploader{display:flex;align-items:center;gap:13px;padding:12px;border:1px dashed #38394b;background:#101119;border-radius:12px;position:relative}.logo-thumb{width:54px;height:54px;border-radius:13px;background:color-mix(in srgb,var(--brand),#151622 60%);display:grid;place-items:center;color:#d9d4ff;font-size:21px;overflow:hidden;flex-shrink:0}.logo-upload-copy{display:flex;flex-direction:column;align-items:flex-start;gap:4px}.logo-upload-copy strong{font-size:11px}.logo-upload-copy small{font-size:10px;color:#7b8094}.upload-button{margin-top:4px;border:1px solid #4a456e;background:#292442;color:#c7c1ff;border-radius:7px;padding:6px 9px;font-size:10px;font-weight:700;cursor:pointer}.upload-button span{margin-left:5px}.remove-logo{margin-left:auto;align-self:flex-start;border:0;background:transparent;color:#989caf;font-size:20px;cursor:pointer}.hidden-input{display:none}.color-row{display:flex;align-items:center;gap:10px}.color-row input[type=color]{width:46px;height:43px;border:1px solid #353747;border-radius:10px;background:#101119;padding:4px;cursor:pointer}.color-row .color-text{max-width:130px!important;text-transform:uppercase}.color-swatch{width:18px;height:18px;border-radius:6px;border:1px solid #ffffff2b}.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field-grid .field{margin-bottom:0}.inline-warning{font-size:10px;color:#ffb3a8;margin:8px 0}.setting-row{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #ffffff0b}.setting-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#ffffff08;color:#a8a2ff;font-size:17px;flex-shrink:0}.setting-copy{flex:1;min-width:0}.setting-copy strong{font-size:12px;display:block}.setting-copy small{font-size:10px;color:#7e8295;display:block;margin-top:4px;line-height:1.5}.switch{position:relative;display:inline-block;width:37px;height:21px;flex-shrink:0}.switch input{opacity:0;width:0;height:0}.switch span{position:absolute;inset:0;border-radius:20px;background:#343646;cursor:pointer;transition:.2s}.switch span:before{content:"";position:absolute;width:15px;height:15px;left:3px;top:3px;border-radius:50%;background:#aaaebe;transition:.2s}.switch input:checked+span{background:#6558dc}.switch input:checked+span:before{transform:translateX(16px);background:white}.field-spaced{margin-top:23px}.info-note{display:flex;gap:10px;padding:12px 13px;border:1px solid #8274ff25;background:#8274ff0b;border-radius:10px;margin-top:20px;color:#aaa2ff}.info-note>span{font-size:15px;flex-shrink:0}.info-note p{font-size:10px;line-height:1.65;color:#9b9db2;margin:0}.summary-hero{display:flex;align-items:center;gap:13px;padding:15px;background:#ffffff06;border:1px solid #ffffff0c;border-radius:13px}.summary-logo{width:46px;height:46px;display:grid;place-items:center;border-radius:13px;background:var(--brand);font-size:20px;font-weight:800;overflow:hidden;flex-shrink:0}.summary-hero>div:nth-child(2){min-width:0;flex:1}.summary-hero strong{font-size:13px}.summary-hero p{font-size:10px;color:#8b8fa3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:4px 0 0}.ready-pill{display:flex;align-items:center;gap:5px;font-size:9px;color:#74d6b6;background:#4ad8c212;border:1px solid #4ad8c226;border-radius:20px;padding:6px 8px}.review-list{margin-top:17px;border:1px solid #ffffff0b;border-radius:12px;padding:2px 14px}.review-list>div{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #ffffff0a;font-size:10px}.review-list>div:last-child{border-bottom:0}.review-list span{color:#85899c}.review-list strong{font-weight:650;color:#e2e3ef;text-align:right;overflow-wrap:anywhere}.notice{margin:0 30px 4px;padding:11px 12px;display:flex;gap:10px;border-radius:10px}.notice>span{width:20px;height:20px;display:grid;place-items:center;border-radius:50%;font-weight:800;font-size:11px;flex-shrink:0}.notice strong{font-size:11px}.notice p{font-size:10px;line-height:1.5;margin:3px 0 0;overflow-wrap:anywhere}.error-notice{background:#ff6c6c10;border:1px solid #ff6c6c30}.error-notice>span{background:#ff6c6c20;color:#ff9a9a}.error-notice p{color:#d8a2a7}.success-notice{background:#4ad8c20c;border:1px solid #4ad8c229}.success-notice>span{background:#4ad8c220;color:#76e0c2}.success-notice p{color:#9acdbf}.wizard-footer{display:flex;align-items:center;justify-content:space-between;padding:18px 30px;border-top:1px solid #ffffff0b;background:#0f1018}.back-button{border:0;background:transparent;color:#a2a5b8;cursor:pointer;font-size:13px}.back-button:disabled{opacity:.3;cursor:default}.footer-right{display:flex;align-items:center;gap:16px}.step-caption{font-size:9px;letter-spacing:1px}.continue-button{border:0;border-radius:10px;padding:12px 16px;background:linear-gradient(110deg,#796bfa,#6254dc);color:white;font-size:12px;font-weight:750;box-shadow:0 7px 22px #6558dc35;cursor:pointer;transition:transform .15s,filter .15s}.continue-button:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.1)}.continue-button span{margin-left:12px}.continue-button:disabled{opacity:.6;cursor:wait}.launch-button{background:linear-gradient(110deg,#6759e9,#3cbaa9)}.page-footer{max-width:1200px;margin:0 auto;display:flex;justify-content:space-between;gap:15px;padding:17px 0;border-top:1px solid #ffffff0b;color:#6f7387;font-size:10px}.page-footer span:first-child{letter-spacing:.2px}
	@media(max-width:950px){.setup-layout{grid-template-columns:1fr;max-width:620px;gap:30px;padding-top:35px}.intro{padding-top:0}.intro h1{font-size:48px}.preview-card{display:none}.trust-note{margin-top:16px}.intro>p{max-width:560px}.wizard-content{min-height:0}}
	@media(max-width:560px){.setup-page{padding:0 17px 18px}.topbar{height:70px}.secure-label{font-size:0}.secure-dot{width:7px;height:7px}.setup-layout{padding:26px 0 30px;gap:25px}.intro h1{font-size:41px;letter-spacing:-2px;margin:17px 0 12px}.intro>p{font-size:12px}.wizard-head{padding:22px 20px 18px}.wizard-head h2{font-size:21px}.step-track{padding:0 20px}.wizard-content{padding:22px 20px 24px}.wizard-footer{padding:16px 20px}.notice{margin:0 20px 4px}.field-grid{grid-template-columns:1fr;gap:0}.field-grid .field{margin-bottom:16px}.page-footer{font-size:9px}.page-footer span:last-child{font-size:8px}.step-caption{display:none}.footer-right{gap:0}.summary-hero{align-items:flex-start}.ready-pill{font-size:0}.ready-pill i{width:7px;height:7px}.review-list>div{align-items:flex-start}.review-list strong{max-width:58%}}

	/* Reddit-inspired setup: compact top bar, solid panels, restrained accent color. */
	.setup-page{min-height:100vh;background:#0b1416;color:#d7dadc;padding:0 24px 28px;isolation:isolate}
	.ambient{display:none!important}
	.topbar{position:sticky;top:0;z-index:20;height:66px;max-width:none;margin:0 -24px;padding:0 max(24px,calc((100vw - 1180px)/2));border-bottom:1px solid #2b3a3e;background:#0b1416;backdrop-filter:none}
	.brand-mark{width:35px;height:35px;border-radius:50%;background:#ff4500;color:#fff;box-shadow:none;border:0}.brand-mark img{border-radius:50%}.brand-copy strong{font-size:15px;letter-spacing:-.2px}.brand-copy span{color:#7f9398;letter-spacing:.08em;font-size:9px}
	.secure-label{border:1px solid #2d4146;border-radius:5px;background:#132024;color:#9db0b4;padding:7px 9px;font-size:10px}.secure-dot{background:#52bd8a;box-shadow:none}
	.setup-layout{display:block;max-width:760px;padding:28px 0 38px;margin:0 auto}.intro{display:none!important}
	.wizard{background:#152226;border:1px solid #34464b;border-radius:12px;box-shadow:none;overflow:visible}.wizard-head{padding:24px 26px 18px}.wizard-head .eyebrow{color:#9dafb4;letter-spacing:.12em}.wizard-head h2{font-size:23px;letter-spacing:-.35px;margin:7px 0 5px}.wizard-head p{font-size:12px;color:#91a1a5}.step-count{font-size:21px;color:#fff;letter-spacing:-.25px}.step-count span{color:#8ba0a5}.step-track{padding:0 26px;gap:4px}.step-track div{height:4px;background:#2b3a3e;border-radius:2px}.step-track div.active{background:#ff4500}
	.wizard-content{padding:23px 26px 28px;min-height:0}.section-label{gap:10px;margin-bottom:18px}.section-icon{width:31px;height:31px;border:1px solid #6b3828;background:#381f18;border-radius:7px;color:#ff875f;font-size:15px}.section-label strong{font-size:13px;color:#e9edef}.section-label small{color:#92a1a6;font-size:11px}.owner-label{margin-top:25px;padding-top:20px;border-top:1px solid #304145}
	.field label,.field-label{font-size:11px;color:#d7dadc}.field label em{color:#ff966d}.field label>span{color:#91a1a5}.field input:not([type=checkbox]):not([type=color]){height:42px;border:1px solid #35494f;background:#0e191c;color:#e8edef;border-radius:6px;font-size:12px}.field input:focus{border-color:#ff8054;box-shadow:0 0 0 2px #ff450022}.field input::placeholder{color:#65777c}
	.logo-uploader{border:1px dashed #42575d;background:#101d20;border-radius:8px}.logo-thumb{border-radius:8px;background:#35231e;color:#ffb094}.upload-button{border:1px solid #604130;background:#2c201b;color:#ffc2a9;border-radius:5px}.remove-logo{color:#9badb2}.color-row input[type=color]{border:1px solid #35494f;border-radius:6px;background:#0e191c}.setting-row{border-bottom:1px solid #293b3f}.setting-icon{background:#1d3034;color:#ff8b5f;border-radius:7px}.switch input:checked+span{background:#ff4500}.info-note{border:1px solid #663c2d;background:#2a1d18;border-radius:7px;color:#ff9e78}.info-note p{color:#c2a49a}
	.summary-hero{background:#101d20;border:1px solid #304247;border-radius:8px}.summary-logo{border-radius:8px;background:#ff4500;color:#fff}.ready-pill{border-radius:5px;color:#8ddbb5;background:#163025;border-color:#275240}.review-list{border-color:#304247;border-radius:8px}.review-list>div{border-bottom-color:#2b3e42}.review-list span{color:#93a3a7}.review-list strong{color:#e6ebec}
	.notice{margin:12px 26px 0;border-radius:7px}.error-notice{background:#321e1f;border:1px solid #633134}.success-notice{background:#142d25;border:1px solid #2c604c}.wizard-footer{padding:16px 26px;border-top:1px solid #304145;border-radius:0 0 12px 12px;background:#111d20}.back-button{color:#a3b2b6}.continue-button,.launch-button{border:0;border-radius:6px;padding:11px 15px;background:#ff4500;color:white;font-size:12px;box-shadow:none}.continue-button:hover:not(:disabled){transform:none;filter:brightness(1.08)}.launch-button{background:#ff4500}.step-caption{color:#839499}.page-footer{max-width:760px;border-top:1px solid #273a3f;color:#71858a}
	.dropdown-trigger{border-radius:6px;background:#0e191c}.dropdown-trigger:hover,.dropdown-trigger[aria-expanded=true]{border-color:#ff8054;background:#17282c}.dropdown-menu{border-radius:7px;background:#152226;border-color:#34464b}.dropdown-menu button:hover,.dropdown-menu button:focus-visible{background:#263b40}
	@media(max-width:950px){.setup-layout{max-width:760px;padding-top:24px;gap:0}.intro{display:none!important}.wizard-content{min-height:0}}
	@media(max-width:560px){.setup-page{padding:0 12px 18px}.topbar{height:58px;margin:0 -12px;padding:0 13px}.brand-copy span{display:none}.secure-label{font-size:0;border:0;background:transparent;padding:0}.secure-dot{width:8px;height:8px}.setup-layout{padding:16px 0 24px}.wizard{border-radius:9px}.wizard-head{padding:19px 17px 15px}.wizard-head h2{font-size:20px}.step-track{padding:0 17px}.wizard-content{padding:19px 17px 22px}.wizard-footer{padding:14px 17px}.notice{margin:12px 17px 0}.field-grid{grid-template-columns:1fr;gap:0}.field-grid .field{margin-bottom:16px}.footer-right{gap:0}.continue-button{padding:10px 12px}}
</style>
