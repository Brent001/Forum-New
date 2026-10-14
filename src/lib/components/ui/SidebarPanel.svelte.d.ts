import type { SvelteComponentTyped } from 'svelte';

export interface SidebarPanelProps {
	title?: string;
	description?: string;
}

export default class SidebarPanel extends SvelteComponentTyped<SidebarPanelProps> {}
