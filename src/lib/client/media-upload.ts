export type UploadPurpose = 'post' | 'avatar' | 'banner' | 'emote' | 'community-icon' | 'community-banner';
export type UploadProgress = { loaded: number; total: number; filename: string; fileIndex: number; fileCount: number };
export type UploadedAsset = { assetId: string; mediaKind: string; url: string; sizeBytes?: number };

type ProgressCallback = (progress: UploadProgress) => void;

async function responseJson(response: Response) {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status}).`);
  return value;
}

function putWithProgress(url: string, file: File, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', file.type);
    xhr.upload.onprogress = (event) => onProgress(event.lengthComputable ? event.loaded : 0);
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected ${file.name} (${xhr.status}). Check your Backblaze B2 CORS rules.`));
    xhr.onerror = () => reject(new Error(`Network error while uploading ${file.name}.`));
    xhr.onabort = () => reject(new Error(`Upload of ${file.name} was cancelled.`));
    xhr.send(file);
  });
}

export async function uploadMediaFile(
  file: File,
  purpose: UploadPurpose = 'post',
  options: { visibility?: 'public' | 'private'; communityId?: string; onProgress?: ProgressCallback; fileIndex?: number; fileCount?: number; onStage?: (stage: string) => void } = {}
): Promise<UploadedAsset> {
  options.onStage?.(`Preparing ${file.name}`);
  const startResponse = await fetch('/api/uploads/presign', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, purpose, visibility: options.visibility ?? 'public', communityId: options.communityId })
  });
  const signed = await responseJson(startResponse);
  options.onStage?.(`Uploading ${file.name}`);
  await putWithProgress(signed.uploadUrl, file, (loaded) => options.onProgress?.({
    loaded, total: file.size, filename: file.name, fileIndex: options.fileIndex ?? 0, fileCount: options.fileCount ?? 1
  }));
  options.onProgress?.({ loaded: file.size, total: file.size, filename: file.name, fileIndex: options.fileIndex ?? 0, fileCount: options.fileCount ?? 1 });
  options.onStage?.(`Verifying ${file.name}`);
  const completeResponse = await fetch('/api/uploads/complete', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objectKey: signed.objectKey, filename: file.name, visibility: options.visibility ?? 'public' })
  });
  return responseJson(completeResponse) as Promise<UploadedAsset>;
}

export async function uploadMediaFiles(
  files: File[],
  purpose: UploadPurpose = 'post',
  options: { visibility?: 'public' | 'private'; communityId?: string; onProgress?: ProgressCallback; onStage?: (stage: string) => void; onAssetComplete?: (asset: UploadedAsset, fileIndex: number) => void } = {}
): Promise<UploadedAsset[]> {
  if (!files.length) return [];
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const loadedByFile = files.map(() => 0);
  const assets = new Array<UploadedAsset>(files.length);
  let nextIndex = 0;
  let failure: unknown;

  const reportAggregate = (index: number) => {
    const loaded = loadedByFile.reduce((sum, current) => sum + current, 0);
    options.onProgress?.({
      loaded: Math.min(totalBytes, loaded), total: totalBytes,
      filename: files[index]?.name ?? '', fileIndex: index, fileCount: files.length
    });
  };

  // Three simultaneous transfers shorten large multi-attachment uploads without
  // flooding the browser's connection pool or Backblaze with all files at once.
  const worker = async () => {
    while (!failure) {
      const index = nextIndex++;
      if (index >= files.length) return;
      const file = files[index];
      try {
        assets[index] = await uploadMediaFile(file, purpose, {
          visibility: options.visibility,
          communityId: options.communityId,
          fileIndex: index,
          fileCount: files.length,
          onProgress: (progress) => {
            loadedByFile[index] = Math.min(file.size, Math.max(0, progress.loaded));
            reportAggregate(index);
          },
          onStage: (stage) => options.onStage?.(`${stage} · ${index + 1}/${files.length}`)
        });
        loadedByFile[index] = file.size;
        options.onAssetComplete?.(assets[index], index);
        reportAggregate(index);
      } catch (error) {
        failure = error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
  if (failure) throw failure;
  return assets;
}
