<script lang="ts">
  import { onMount } from 'svelte';
  import { backgroundTasks, dismissBackgroundTask, retryBackgroundTask } from '$lib/client/background-tasks.js';
  import { CheckCircle2, CircleAlert, ExternalLink, UploadCloud, X } from '@lucide/svelte';
  onMount(() => {
    const unsubscribe = backgroundTasks.subscribe((tasks) => {
      const active = tasks.some((task) => ['queued', 'uploading', 'publishing'].includes(task.status));
      if (active) window.addEventListener('beforeunload', warnActiveUpload);
      else window.removeEventListener('beforeunload', warnActiveUpload);
    });
    return () => { unsubscribe(); window.removeEventListener('beforeunload', warnActiveUpload); };
  });
  function warnActiveUpload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
  function sizeLabel(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
</script>

{#if $backgroundTasks.length}
  <aside class="task-center" aria-label="Background tasks">
    <header><div class="task-title"><UploadCloud size={17}/><strong>Background tasks</strong><span>{$backgroundTasks.filter((task) => !['done','error'].includes(task.status)).length}</span></div><span class="task-hint">Keeps running while you browse</span></header>
    <div class="task-list">
      {#each $backgroundTasks as task (task.id)}
        <article class="task-row">
          <div class="task-row-head">
            <span class="task-state-icon">{#if task.status === 'done'}<CheckCircle2 size={17}/>{:else if task.status === 'error'}<CircleAlert size={17}/>{:else}<UploadCloud size={17}/>{/if}</span>
            <div class="task-main"><strong>{task.title || 'Untitled post'}</strong><small>{task.message}{#if task.currentFile && task.status === 'uploading'} · {task.currentFile}{/if}</small></div>
            {#if task.status === 'done' && task.redirectTo}<a href={task.redirectTo} aria-label="Open published post" title="Open post"><ExternalLink size={15}/></a>{/if}
            {#if task.status === 'done' || task.status === 'error'}<button type="button" aria-label="Dismiss task" onclick={() => dismissBackgroundTask(task.id)}><X size={15}/></button>{/if}
          </div>
          {#if !['done','error'].includes(task.status)}
            <div class="task-progress" role="progressbar" aria-valuenow={task.progress} aria-valuemin="0" aria-valuemax="100" aria-label={`Upload progress for ${task.title}`}><span style={`width:${task.progress}%`}></span></div>
            <div class="task-progress-meta"><span>{task.status === 'publishing' ? 'Publishing' : `${task.progress}%`}</span><span>{sizeLabel(task.loadedBytes)} / {sizeLabel(task.totalBytes)}</span></div>
          {:else if task.status === 'error'}
            <p class="task-error">{task.message}</p><button type="button" class="task-retry" onclick={() => retryBackgroundTask(task.id)}>Retry upload / publish</button>
          {/if}
        </article>
      {/each}
    </div>
    <p class="task-footer">Keep this browser tab open until active uploads finish.</p>
  </aside>
{/if}

<style>
  .task-center{position:fixed;z-index:80;right:16px;bottom:80px;width:min(420px,calc(100vw - 24px));overflow:hidden;border:1px solid var(--reddit-border,#35464b);border-radius:11px;background:#142125;color:#e9edef;box-shadow:0 18px 50px #0007}
  .task-center>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-bottom:1px solid #ffffff0c;background:#1b2a2f}.task-title{display:flex;align-items:center;gap:7px;font-size:12px;color:#dfe8ea}.task-title>span{min-width:19px;border-radius:50px;background:#34474d;padding:2px 5px;text-align:center;font-size:10px}.task-hint{color:#87999f;font-size:9px;text-align:right}
  .task-list{max-height:300px;overflow:auto}.task-row{padding:12px 13px;border-bottom:1px solid #ffffff0b}.task-row:last-child{border-bottom:0}.task-row-head{display:flex;align-items:flex-start;gap:9px}.task-state-icon{display:grid;place-items:center;color:#83b9c3;padding-top:1px}.task-row:has(.task-state-icon svg) .task-main{flex:1;min-width:0}.task-row:has(.task-progress) .task-state-icon{color:#ff8a45}.task-row:has(.task-error) .task-state-icon{color:#ff9189}.task-row:has(.task-row-head a) .task-state-icon{color:#6fdbad}.task-main strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.task-main small{display:block;margin-top:3px;color:#96a5a9;font-size:10px;line-height:1.4;overflow-wrap:anywhere}.task-row-head>a,.task-row-head>button{display:grid;place-items:center;width:23px;height:23px;border-radius:5px;color:#9dafb4}.task-row-head>a:hover,.task-row-head>button:hover{background:#2a3b40;color:white}
  .task-progress{height:5px;margin-top:10px;overflow:hidden;border-radius:99px;background:#2a393d}.task-progress span{display:block;height:100%;border-radius:inherit;background:#ff6b35;transition:width .12s linear}.task-progress-meta{display:flex;justify-content:space-between;gap:10px;margin-top:5px;color:#8a9a9f;font-size:9px}.task-error{margin:8px 0 0;color:#ffaaa4;font-size:10px;line-height:1.5}.task-retry{margin-top:8px;padding:6px 9px;border:1px solid #66513c;border-radius:5px;color:#ffd4a2;font-size:10px;font-weight:750}.task-retry:hover{background:#30261f}.task-footer{padding:9px 13px;border-top:1px solid #ffffff0b;color:#6f8389;font-size:9px}
  @media(max-width:600px){.task-center{right:9px;bottom:78px;width:calc(100vw - 18px)}}
</style>
