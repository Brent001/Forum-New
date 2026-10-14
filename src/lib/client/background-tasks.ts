import { writable, get } from 'svelte/store';
import { notify } from '$lib/client/notifications.js';
import { uploadMediaFiles, type UploadProgress } from '$lib/client/media-upload.js';

export type BackgroundTaskStatus = 'queued' | 'uploading' | 'publishing' | 'done' | 'error';
export type BackgroundTask = {
  id: string;
  title: string;
  status: BackgroundTaskStatus;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  currentFile: string;
  message: string;
  redirectTo?: string;
  createdAt: number;
};
export type BackgroundPostPayload = {
  title: string;
  body: string;
  url?: string;
  postType: string;
  communitySlug?: string;
  communityId?: string;
  pollOptions?: string[];
  mediaAssetIds?: string[];
};

export const backgroundTasks = writable<BackgroundTask[]>([]);
const retryActions = new Map<string, () => Promise<void>>();

function patchTask(id: string, patch: Partial<BackgroundTask>) {
  backgroundTasks.update((tasks) => tasks.map((task) => task.id === id ? { ...task, ...patch } : task));
}
export function dismissBackgroundTask(id: string) {
  retryActions.delete(id);
  backgroundTasks.update((tasks) => tasks.filter((task) => task.id !== id));
}

export function retryBackgroundTask(id: string) {
  const retry = retryActions.get(id);
  if (retry) void retry();
}

/**
 * Background tasks survive client-side route navigation because this manager
 * lives outside page components. The browser tab must stay open; reload/close
 * persistence requires a future service-worker/IndexedDB upload queue.
 */
export function queuePostWithMedia(payload: BackgroundPostPayload, files: File[]): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  backgroundTasks.update((tasks) => [...tasks, {
    id, title: payload.title, status: 'queued', progress: 0, loadedBytes: 0, totalBytes,
    currentFile: files[0]?.name ?? '', message: 'Waiting to start', createdAt: Date.now()
  }]);
  const stagedAssetsByIndex = new Map<number, string>();
  const runTask = async () => {
    const currentStatus = get(backgroundTasks).find((task) => task.id === id)?.status;
    if (currentStatus === 'uploading' || currentStatus === 'publishing') return;
    const previouslyUploadedBytes = files.reduce((sum, file, index) => sum + (stagedAssetsByIndex.has(index) ? file.size : 0), 0);
    const missingFiles = files.map((file, index) => ({ file, originalIndex: index })).filter(({ originalIndex }) => !stagedAssetsByIndex.has(originalIndex));
    patchTask(id, {
      status: missingFiles.length ? 'uploading' : 'publishing',
      progress: totalBytes ? Math.min(100, Math.round(previouslyUploadedBytes / totalBytes * 100)) : 100,
      loadedBytes: previouslyUploadedBytes,
      totalBytes,
      message: missingFiles.length ? (previouslyUploadedBytes ? 'Resuming remaining files…' : 'Starting upload…') : 'Retrying post publication…'
    });
    try {
      if (missingFiles.length) {
        await uploadMediaFiles(missingFiles.map(({ file }) => file), 'post', {
          communityId: payload.communityId,
          onProgress: (progress: UploadProgress) => {
            const loaded = Math.min(totalBytes, previouslyUploadedBytes + progress.loaded);
            patchTask(id, {
              loadedBytes: loaded,
              totalBytes,
              progress: totalBytes ? Math.min(100, Math.round(loaded / totalBytes * 100)) : 0,
              currentFile: progress.filename,
              message: `Uploading ${progress.filename} · ${stagedAssetsByIndex.size + 1} of ${files.length}`
            });
          },
          onAssetComplete: (asset, localIndex) => {
            const originalIndex = missingFiles[localIndex]?.originalIndex;
            if (originalIndex !== undefined) stagedAssetsByIndex.set(originalIndex, asset.assetId);
          },
          onStage: (stage) => patchTask(id, { message: stage })
        });
      }
      const stagedAssetIds = files.map((_, index) => stagedAssetsByIndex.get(index)).filter((assetId): assetId is string => Boolean(assetId));
      patchTask(id, { status: 'publishing', progress: 100, message: 'Publishing your post…', loadedBytes: totalBytes, totalBytes });
      const response = await fetch('/api/posts', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, clientRequestId: id, mediaAssetIds: [...(payload.mediaAssetIds ?? []), ...stagedAssetIds] })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Media uploaded, but the post could not be published.');
      retryActions.delete(id);
      patchTask(id, { status: 'done', message: 'Post published successfully.', redirectTo: result.redirectTo || `/post/${result.id}` });
      notify(`“${payload.title}” has been published.`, 'success', 'Upload complete');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The background upload failed.';
      patchTask(id, { status: 'error', message });
      notify(message, 'error', 'Background upload failed');
    }
  };
  retryActions.set(id, runTask);
  void runTask();
  notify('Upload added to background tasks. You can keep browsing while it finishes.', 'info', 'Working in the background');
  return id;
}

export function getBackgroundTask(id: string) {
  return get(backgroundTasks).find((task) => task.id === id);
}
