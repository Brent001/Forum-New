import type { SvelteComponentTyped } from 'svelte';

export interface PostCardProps {
	post: {
		community: string;
		author: string;
		title: string;
		description: string;
		score: number;
		comments: number;
		time: string;
		isPinned?: boolean;
	};
}

export default class PostCard extends SvelteComponentTyped<PostCardProps> {}
