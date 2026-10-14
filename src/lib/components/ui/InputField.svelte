<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();
	const {
		label = '',
		type = 'text',
		value = '',
		placeholder = '',
		help = '',
		name = '',
		required = false
	} = $props<{
		label?: string;
		type?: 'text' | 'email' | 'password' | 'search';
		value?: string;
		placeholder?: string;
		help?: string;
		name?: string;
		required?: boolean;
	}>();

	function handleInput(event: Event) {
		dispatch('input', (event.currentTarget as HTMLInputElement).value);
	}
</script>

<div class="space-y-2">
	{#if label}
		<label class="text-sm font-semibold text-slate-200" for={name}>{label}</label>
	{/if}
	<input
		id={name}
		name={name}
		type={type}
		value={value}
		oninput={handleInput}
		placeholder={placeholder}
		required={required}
		class="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30"
	/>
	{#if help}
		<p class="text-xs text-slate-400">{help}</p>
	{/if}
</div>
