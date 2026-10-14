<script lang="ts">
	import { Flame, MessageSquareText, TrendingUp } from '@lucide/svelte';
	let { total = 0, post = 0, comment = 0, compact = false } = $props<{ total?: number; post?: number; comment?: number; compact?: boolean }>();
	const tiers = [
		{ min: 0, name: 'Newcomer', next: 100 },
		{ min: 100, name: 'Contributor', next: 500 },
		{ min: 500, name: 'Regular', next: 2000 },
		{ min: 2000, name: 'Trusted Contributor', next: 10000 },
		{ min: 10000, name: 'Veteran', next: 50000 },
		{ min: 50000, name: 'Legend', next: null }
	];
	const tier = $derived([...tiers].reverse().find((item) => total >= item.min) ?? tiers[0]);
	const progress = $derived(tier.next === null ? 100 : Math.max(0, Math.min(100, ((total - tier.min) / (tier.next - tier.min)) * 100)));
	function fmt(value: number) { return new Intl.NumberFormat('en', { notation:'compact', maximumFractionDigits:1 }).format(Math.trunc(value || 0)); }
</script>

<section class="karma-panel" class:karma-compact={compact} aria-label="Community karma">
	<div class="karma-top">
		<div><p class="karma-eyebrow">COMMUNITY REPUTATION</p><div class="karma-total-row"><strong class="karma-total">{fmt(total)}</strong><span class="karma-label">karma</span></div></div>
		<div class="karma-tier"><Flame size={15} /> {tier.name}</div>
	</div>
	{#if tier.next !== null}
		<div class="karma-progress-track" role="progressbar" aria-label={`Progress to ${tier.next} karma`} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={`width:${progress}%`}></span></div>
		<p class="karma-next">{fmt(tier.next - total)} to {tiers[tiers.indexOf(tier) + 1]?.name ?? 'the next tier'}</p>
	{:else}<p class="karma-next">Top reputation tier reached.</p>{/if}
	<div class="karma-breakdown">
		<div><span class="karma-stat-label"><TrendingUp size={13}/> Post karma</span><strong>{fmt(post)}</strong></div>
		<div><span class="karma-stat-label"><MessageSquareText size={13}/> Comment karma</span><strong>{fmt(comment)}</strong></div>
	</div>
	<p class="karma-note">Reputation is community feedback, not a moderation role or verification status.</p>
</section>

<style>
	.karma-panel{border:1px solid rgba(255,255,255,.07);border-radius:16px;background:rgba(255,255,255,.025);padding:16px;color:#e2e8f0}
	.karma-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.karma-eyebrow{font-size:9px;font-weight:800;letter-spacing:.15em;color:#758199}.karma-total-row{display:flex;align-items:baseline;gap:6px;margin-top:4px}.karma-total{font-size:28px;letter-spacing:-.045em;font-weight:900;color:#f8fafc}.karma-label{font-size:11px;color:#8792a8}.karma-tier{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(251,191,36,.16);border-radius:999px;background:rgba(251,191,36,.055);padding:6px 9px;color:#fcd879;font-size:10px;font-weight:800;white-space:nowrap}
	.karma-progress-track{height:5px;margin-top:12px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.07)}.karma-progress-track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#a5b4fc,#5eead4);transition:width .25s}.karma-next{margin-top:6px;color:#77839a;font-size:10px}.karma-breakdown{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:13px}.karma-breakdown>div{display:flex;align-items:center;justify-content:space-between;gap:6px;border:1px solid rgba(255,255,255,.055);border-radius:10px;padding:10px}.karma-breakdown strong{font-size:12px;color:#f1f5f9}.karma-stat-label{display:inline-flex;align-items:center;gap:4px;color:#94a3b8;font-size:10px}.karma-note{margin-top:11px;color:#657087;font-size:9px;line-height:1.5}.karma-compact{padding:12px}.karma-compact .karma-total{font-size:23px}.karma-compact .karma-breakdown{grid-template-columns:1fr;gap:6px}.karma-compact .karma-note{font-size:9px}
</style>
