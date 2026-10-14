import { json, type RequestHandler } from '@sveltejs/kit';
import postgres from 'postgres';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const connectionString = String(body?.connectionString ?? '').trim();

	if (!connectionString) {
		return json({ ok: false, error: 'Database URL is required.' }, { status: 400 });
	}

	let client;
	try {
		client = postgres(connectionString, { ssl: 'require' });
		await client`SELECT 1`;
		return json({ ok: true });
	} catch (error) {
		return json({ ok: false, error: String(error) });
	} finally {
		await client?.end();
	}
};
