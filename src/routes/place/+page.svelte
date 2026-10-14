<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Paintbrush, Timer, Users, RefreshCw, CircleHelp } from '@lucide/svelte';
  import { featureApiJson } from '$lib/client/feature-api.js';
  import { notify } from '$lib/client/notifications.js';
  type CanvasMeta={id:string;slug:string;title:string;description:string|null;width:number;height:number;palette:string[];cooldownMs:number;startsAt:string|null;endsAt:string|null;isActive:boolean};
  type Cell={x:number;y:number;color:string;updated_at?:string;updatedAt?:string};
  type Change={id:number;x:number;y:number;color:string;placedAt:string};
  let canvasMeta=$state<CanvasMeta|null>(null); let cells=$state<Cell[]>([]); let selectedColor=$state('#E50000'); let loading=$state(true); let busy=$state(false); let error=$state(''); let notice=$state(''); let cursor=$state(0); let cooldownUntil=$state(0); let now=$state(Date.now()); let canvasElement:HTMLCanvasElement; let pollTimer:ReturnType<typeof setInterval>|undefined; let clockTimer:ReturnType<typeof setInterval>|undefined;
  let cellMap=new Map<string,string>();
  const pixelKey=(x:number,y:number)=>`${x}:${y}`;
  function rebuildMap(){cellMap=new Map(cells.map(c=>[pixelKey(c.x,c.y),c.color]));drawCanvas();}
  function drawCanvas(){
    if(!canvasElement||!canvasMeta)return;
    const ctx=canvasElement.getContext('2d');if(!ctx)return;
    const size=8;canvasElement.width=canvasMeta.width*size;canvasElement.height=canvasMeta.height*size;
    ctx.fillStyle='#f1f2f3';ctx.fillRect(0,0,canvasElement.width,canvasElement.height);
    for(const [key,color] of cellMap){const [x,y]=key.split(':').map(Number);ctx.fillStyle=color;ctx.fillRect(x*size,y*size,size,size);}
    ctx.beginPath();ctx.strokeStyle='rgba(0,0,0,.10)';ctx.lineWidth=.45;
    for(let x=0;x<=canvasMeta.width;x++){ctx.moveTo(x*size+.25,0);ctx.lineTo(x*size+.25,canvasElement.height);}
    for(let y=0;y<=canvasMeta.height;y++){ctx.moveTo(0,y*size+.25);ctx.lineTo(canvasElement.width,y*size+.25);}
    ctx.stroke();
  }
  async function load(){loading=true;error='';try{const r=await featureApiJson<{canvas:CanvasMeta;cells:Cell[];cursor:number}>('/place/nexus-place');canvasMeta=r.canvas;cells=r.cells;cursor=r.cursor;selectedColor=r.canvas.palette.find(c=>c.toLowerCase()==='#e50000')||r.canvas.palette[0]||'#E50000';rebuildMap();}catch(e){error=e instanceof Error?e.message:'Could not load the shared canvas.';}finally{loading=false;}}
  async function poll(){if(!canvasMeta)return;try{for(let batch=0;batch<5;batch++){const r=await featureApiJson<{changes:Change[];cursor:number;hasMore:boolean}>(`/place/${encodeURIComponent(canvasMeta.slug)}/updates?after=${cursor}`);if(r.changes.length){for(const change of r.changes)cellMap.set(pixelKey(change.x,change.y),change.color);cursor=r.cursor;drawCanvas();}if(!r.hasMore)break;}}catch{/* A transient polling failure should not interrupt the canvas. */}}
  async function placePixel(event:PointerEvent){if(!canvasMeta||!canvasMeta.isActive||busy||Date.now()<cooldownUntil)return;const rect=canvasElement.getBoundingClientRect();const x=Math.floor((event.clientX-rect.left)/rect.width*canvasMeta.width);const y=Math.floor((event.clientY-rect.top)/rect.height*canvasMeta.height);if(x<0||y<0||x>=canvasMeta.width||y>=canvasMeta.height)return;busy=true;notice='';error='';try{const r=await featureApiJson<{placement:Change;cooldownMs:number}>(`/place/${encodeURIComponent(canvasMeta.slug)}/pixels`,{method:'POST',body:JSON.stringify({x,y,color:selectedColor})});cellMap.set(pixelKey(x,y),selectedColor);cursor=Math.max(cursor,r.placement.id);cooldownUntil=Date.now()+r.cooldownMs;drawCanvas();notify(`Pixel placed at ${x}, ${y}.`,'success');}catch(e){const message=e instanceof Error?e.message:'Could not place pixel.';notice=message;if(/sign in|auth required/i.test(message))notify('Sign in to place pixels.','info');else notify(message,'error');}finally{busy=false;}}
  const remaining=$derived(Math.max(0,cooldownUntil-now));
  onMount(()=>{void load();pollTimer=setInterval(()=>void poll(),3000);clockTimer=setInterval(()=>now=Date.now(),250);});
  onDestroy(()=>{if(pollTimer)clearInterval(pollTimer);if(clockTimer)clearInterval(clockTimer);});
  $effect(()=>{if(canvasMeta && cells.length>=0)drawCanvas();});
</script>
<svelte:head><title>Nexus Place · Nexus</title><meta name="description" content="A shared pixel canvas where the community creates a picture one pixel at a time." /></svelte:head>
<div class="mx-auto w-full max-w-[1600px] px-3 pb-20 sm:px-6">
  <header class="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5"><div><div class="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-orange-300"><Paintbrush size={16}/> Community experiment</div><h1 class="text-3xl font-black tracking-tight text-white sm:text-4xl">Nexus Place</h1><p class="mt-2 max-w-3xl text-sm leading-6 text-slate-400">One shared canvas. One pixel per cooldown. Work together, make art, and see the board evolve live.</p></div><a href="/communities" class="rounded-full border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-200 hover:border-orange-300/40">Find a community</a></header>
  {#if loading}<div class="rounded-xl border border-white/10 bg-white/[.02] p-12 text-center text-sm text-slate-400">Loading canvas…</div>
  {:else if error}<div class="rounded-xl border border-rose-300/20 bg-rose-300/[.04] p-5"><p class="text-sm text-rose-200">{error}</p><button onclick={()=>void load()} class="mt-3 rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-white">Retry</button><p class="mt-3 text-xs leading-5 text-slate-500">If this is a new installation, run the schema update and `npm run seed:place` in the API directory first.</p></div>
  {:else if canvasMeta}<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <section class="min-w-0 rounded-xl border border-white/10 bg-[#101719] p-3 sm:p-5"><div class="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-extrabold text-white">{canvasMeta.title}</h2><p class="mt-1 text-xs text-slate-500">{canvasMeta.width} × {canvasMeta.height} pixels · updates every 3 seconds</p></div><div class="flex items-center gap-2 text-xs text-slate-400"><span class="h-2 w-2 rounded-full bg-emerald-400"></span>Shared board</div></div>
      <div class="overflow-hidden rounded-lg border border-white/10 bg-[#edf0f2] p-1 sm:p-2"><canvas bind:this={canvasElement} onpointerdown={placePixel} role="img" aria-label="Interactive collaborative pixel canvas. Choose a color, then tap a pixel to place it." class="pixel-canvas block max-h-[78vh] w-full cursor-crosshair touch-manipulation" style="aspect-ratio: {canvasMeta.width}/{canvasMeta.height}" /></div>
      <p class="mt-3 text-xs leading-5 text-slate-500"><CircleHelp size={13} class="mr-1 inline"/>Choose a color, then click or tap a tile. You need to sign in to place pixels. Please coordinate with others instead of overwriting community art.</p>
    </section>
    <aside class="grid content-start gap-3"><section class="rounded-xl border border-white/10 bg-[#101719] p-4"><h2 class="font-extrabold text-white">Choose a color</h2><p class="mt-1 text-xs text-slate-500">Your next pixel uses this color.</p><div class="mt-4 grid grid-cols-4 gap-2">{#each canvasMeta.palette as color (color)}<button onclick={()=>selectedColor=color} aria-label={`Select ${color}`} aria-pressed={selectedColor.toLowerCase()===color.toLowerCase()} class="palette-swatch" class:selected={selectedColor.toLowerCase()===color.toLowerCase()} style={`--swatch:${color}`}><span></span></button>{/each}</div><div class="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/15 p-3"><span class="h-6 w-6 rounded-md border border-white/20" style={`background:${selectedColor}`}></span><div><div class="text-xs font-extrabold text-white">{selectedColor.toUpperCase()}</div><div class="mt-0.5 text-[10px] text-slate-500">Selected color</div></div></div></section>
      <section class="rounded-xl border border-white/10 bg-[#101719] p-4"><h2 class="font-extrabold text-white">Pixel cooldown</h2><div class="mt-3 flex items-center gap-3"><div class="grid h-10 w-10 place-items-center rounded-lg bg-orange-400/10 text-orange-300"><Timer size={20}/></div><div><div class="text-lg font-black text-white">{remaining>0?`${Math.ceil(remaining/1000)}s`:'Ready'}</div><div class="text-xs text-slate-500">{remaining>0?'Until your next placement':`${canvasMeta.cooldownMs/1000}s between placements`}</div></div></div><div class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-orange-400 transition-all" style={`width:${remaining?Math.max(0,100-remaining/canvasMeta.cooldownMs*100):100}%`}></div></div>{#if busy}<p class="mt-2 text-xs text-orange-200">Sending pixel…</p>{/if}{#if notice}<p class="mt-3 text-xs text-rose-200" role="status">{notice}</p>{/if}</section>
      <section class="rounded-xl border border-white/10 bg-[#101719] p-4"><div class="flex items-center gap-2 font-extrabold text-white"><Users size={17} class="text-orange-300"/>Canvas etiquette</div><ul class="mt-3 grid gap-2 text-xs leading-5 text-slate-400"><li>• Coordinate with your community before big changes.</li><li>• Do not target or harass individual users.</li><li>• Abuse can be rate-limited and reported under site rules.</li><li>• Board updates are shared, but the preview refreshes on a short polling interval.</li></ul><button onclick={()=>void load()} class="mt-4 inline-flex items-center gap-2 text-xs font-bold text-orange-300"><RefreshCw size={13}/> Refresh canvas</button></section></aside>
  </div>{/if}
</div>
<style>
.pixel-canvas { image-rendering: pixelated; image-rendering: crisp-edges; }
.palette-swatch { position:relative; aspect-ratio:1; border:2px solid transparent; border-radius:8px; padding:2px; background:transparent; }
.palette-swatch span { display:block; width:100%; height:100%; border:1px solid rgba(0,0,0,.18); border-radius:5px; background:var(--swatch); }
.palette-swatch.selected { border-color:#ff6b35; box-shadow:0 0 0 1px #ff6b35; }
</style>
