<script module lang="ts">
	export interface Props {
		title?: string;
		description?: string;
	}

	export interface Slots {
		default?: {};
	}
</script>

<script lang="ts">
	const { title = '', description = '', children } = $props() as Props & { children?: () => any };
</script>

<section class="rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-xl shadow-slate-950/10">
	<div class="flex items-center justify-between gap-4">
		<div>
			<p class="text-sm uppercase tracking-[0.2em] text-slate-500">{title}</p>
			{#if description}
				<p class="mt-2 text-sm text-slate-400">{description}</p>
			{/if}
		</div>
	</div>
	{@render children?.()}
</section>
