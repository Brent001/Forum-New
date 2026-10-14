<script lang="ts">
	import { onMount } from 'svelte';
	import { Video } from '@lucide/svelte';

	let { src, title = 'Community video', poster = undefined }: { src: string; title?: string; poster?: string } = $props();
	let container: HTMLDivElement;
	let failed = $state(false);
	let loading = $state(true);
	let started = $state(false);

	onMount(() => {
		let player: any;
		let disposed = false;
		let observer: IntersectionObserver | undefined;
		const startPlayer = () => {
			if (started || disposed || !container) return;
			started = true;
			void import('artplayer').then(({ default: Artplayer }) => {
				if (disposed || !container) return;
				player = new Artplayer({ container, url: src, title, poster, theme: '#ff4500', volume: 0.75, autoplay: false, muted: false, playsInline: true, hotkey: true, mutex: true, setting: true, playbackRate: true, aspectRatio: true, fullscreen: true, fullscreenWeb: true, pip: true, autoSize: false, airplay: true, lang: 'en', moreVideoAttr: { playsInline: true, preload: 'metadata', controlsList: 'nodownload' } });
				player.on('ready', () => { loading = false; });
				player.on('video:canplay', () => { loading = false; });
				player.on('video:error', () => { player?.destroy(false); player = undefined; failed = true; loading = false; });
			}).catch(() => { failed = true; loading = false; });
		};
		if (typeof IntersectionObserver === 'undefined') startPlayer();
		else {
			observer = new IntersectionObserver((entries) => {
				if (entries.some((entry) => entry.isIntersecting)) { startPlayer(); observer?.disconnect(); }
			}, { rootMargin: '700px 0px', threshold: 0.01 });
			observer.observe(container);
		}
		return () => { disposed = true; observer?.disconnect(); player?.destroy(false); };
	});
</script>

<div class="nexus-video-shell" aria-label={title}>
	<div class="nexus-video-brand"><span class="brand-mark"><Video size={13} strokeWidth={2.5} /></span><span>NEXUS VIDEO</span></div>
	{#if failed}
		<video class="native-fallback" src={src} poster={poster} controls playsinline preload="metadata" aria-label={title}></video>
	{:else}
		<div bind:this={container} class="nexus-artplayer" aria-label={title}></div>
	{/if}
	{#if loading && !failed}<div class="video-loading"><span class="loading-dot"></span><span>{started ? 'Preparing video' : 'Video loads when nearby'}</span></div>{/if}
</div>

<style>
	.nexus-video-shell { position: relative; isolation: isolate; width: 100%; aspect-ratio: 16 / 9; min-height: 190px; overflow: hidden; background: #090a0c; border: 1px solid var(--border, #303238); border-radius: 12px; box-shadow: 0 8px 24px rgb(0 0 0 / 16%); }
	.nexus-artplayer { position: absolute; inset: 0; width: 100%; height: 100%; }
	.nexus-video-brand { position: absolute; z-index: 3; top: 10px; left: 10px; display: flex; align-items: center; gap: 6px; padding: 5px 8px; border: 1px solid rgb(255 255 255 / 12%); border-radius: 6px; background: rgb(12 13 15 / 76%); color: #f4f4f5; font-size: 9px; font-weight: 800; letter-spacing: .12em; pointer-events: none; backdrop-filter: blur(8px); }
	.brand-mark { display: inline-flex; color: #ff5b25; }
	.video-loading { position: absolute; z-index: 2; right: 10px; top: 10px; display: flex; align-items: center; gap: 7px; padding: 5px 8px; border-radius: 6px; background: rgb(12 13 15 / 72%); color: #c7c9ce; font-size: 11px; pointer-events: none; }
	.loading-dot { width: 6px; height: 6px; border-radius: 50%; background: #ff5b25; box-shadow: 0 0 0 3px rgb(255 69 0 / 18%); animation: pulse 1.1s ease-in-out infinite; }
	.native-fallback { display: block; width: 100%; height: 100%; object-fit: contain; background: #090a0c; }
	:global(.nexus-artplayer .art-video-player) { width: 100% !important; height: 100% !important; --art-theme: #ff4500; font-family: inherit; }
	:global(.nexus-artplayer .art-bottom) { padding: 0 12px 8px !important; }
	:global(.nexus-artplayer .art-control) { color: #f4f4f5 !important; }
	:global(.nexus-artplayer .art-control:hover) { color: #ff6a3d !important; }
	:global(.nexus-artplayer .art-progress) { height: 4px !important; }
	:global(.nexus-artplayer .art-progress:hover) { height: 6px !important; }
	:global(.nexus-artplayer .art-layer) { border-radius: 10px; }
	@keyframes pulse { 50% { opacity: .45; transform: scale(.85); } }
	@media (max-width: 600px) { .nexus-video-shell { min-height: 170px; border-radius: 9px; } .nexus-video-brand { top: 7px; left: 7px; font-size: 8px; } }
	@media (prefers-reduced-motion: reduce) { .loading-dot { animation: none; } }
</style>
