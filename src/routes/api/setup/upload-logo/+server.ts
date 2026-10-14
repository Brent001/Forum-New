import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
const MAX_BYTES = 2 * 1024 * 1024;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ ok: false, error: 'Choose an image file first.' }, { status: 400 });
    const extension = ALLOWED[file.type];
    if (!extension) return json({ ok: false, error: 'Use a PNG, JPEG, WebP, or GIF image.' }, { status: 415 });
    if (file.size < 1 || file.size > MAX_BYTES) return json({ ok: false, error: 'Logo must be smaller than 2 MB.' }, { status: 413 });

    const bytes = Buffer.from(await file.arrayBuffer());
    // Verify file signatures rather than trusting the browser-supplied MIME type.
    const signatures: Record<string, (b: Buffer) => boolean> = {
      png: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
      webp: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
      gif: (b) => ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6))
    };
    if (!signatures[extension](bytes)) return json({ ok: false, error: 'The uploaded file does not match its image type.' }, { status: 415 });

    const folder = resolve(process.cwd(), 'static', 'uploads', 'branding');
    await mkdir(folder, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(resolve(folder, filename), bytes, { flag: 'wx' });
    return json({ ok: true, url: `/uploads/branding/${filename}` });
  } catch (error) {
    console.error('[setup logo upload]', error);
    return json({ ok: false, error: 'Logo upload failed. Check that the app can write to its static/uploads folder.' }, { status: 500 });
  }
};
