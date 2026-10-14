<script module lang="ts">
	export interface Props {
		variant?: 'primary' | 'secondary' | 'ghost';
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		href?: string;
	}

	export interface Slots {
		default?: {};
	}
</script>

<script lang="ts">
	const { variant = 'primary', type = 'button', disabled = false, href, children } = $props() as Props & { children?: () => any };
</script>

{#if href}
	<a href={href} aria-disabled={disabled} class="app-button {variant === 'primary' ? 'app-button-primary' : variant === 'secondary' ? 'app-button-secondary' : 'app-button-ghost'}">{@render children?.()}</a>
{:else}
	<button type={type} disabled={disabled} class="app-button {variant === 'primary' ? 'app-button-primary' : variant === 'secondary' ? 'app-button-secondary' : 'app-button-ghost'}">
		{@render children?.()}
	</button>
{/if}
