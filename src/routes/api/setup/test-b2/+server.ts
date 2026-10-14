import { json, type RequestHandler } from '@sveltejs/kit';
import { normalizeEndpoint } from '$lib/storage/b2.js';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

function errorToString(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}

	if (typeof error === 'object' && error !== null) {
		try {
			return JSON.stringify(error);
		} catch {
			return String(error);
		}
	}

	return String(error);
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const keyId = String(body?.keyId ?? '').trim();
	const appKey = String(body?.appKey ?? '').trim();
	const bucket = String(body?.bucketName ?? '').trim();
	const endpoint = String(body?.endpoint ?? '').trim();

	if (!keyId || !appKey || !bucket || !endpoint) {
		return json({ ok: false, error: 'All Backblaze B2 fields are required.' }, { status: 400 });
	}

	const normalizedEndpoint = normalizeEndpoint(endpoint);
	const client = new S3Client({
		region: String(body?.region ?? 'us-west-004'),
		endpoint: normalizedEndpoint,
		credentials: {
			accessKeyId: keyId,
			secretAccessKey: appKey
		},
		forcePathStyle: true
	});

	try {
		await client.send(new HeadBucketCommand({ Bucket: bucket }));
		return json({ ok: true });
	} catch (error) {
		return json({ ok: false, error: errorToString(error) });
	}
};
