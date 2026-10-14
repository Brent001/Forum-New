import type { SvelteComponentTyped } from 'svelte';

export interface ButtonProps {
	variant?: 'primary' | 'secondary' | 'ghost';
	type?: 'button' | 'submit' | 'reset';
	disabled?: boolean;
	href?: string;
}

export default class Button extends SvelteComponentTyped<ButtonProps> {}
