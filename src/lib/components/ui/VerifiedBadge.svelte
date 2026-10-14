<script lang="ts">
	import { BadgeCheck } from '@lucide/svelte';
	let { size = 15, label = 'Nexus verified account' } = $props<{ size?: number; label?: string }>();
</script>

<span class="verified-badge" role="img" aria-label={label} title={label}>
	<BadgeCheck size={size} strokeWidth={2.7} aria-hidden="true" />
</span>

<style>
	.verified-badge { display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; color:#55b9ff; vertical-align:middle; filter:drop-shadow(0 1px 5px rgba(56,189,248,.18)); }
</style>
