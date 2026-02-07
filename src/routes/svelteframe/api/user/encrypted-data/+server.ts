// FILE: src/routes/svelteframe/api/user/encrypted-data/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    getSession,
    getEncryptedData,
    saveEncryptedData,
} from '$routes/svelteframe/lib/server/auth';

/**
 * GET /svelteframe/api/user/encrypted-data
 * Fetch encrypted data blob for the authenticated user.
 */
export const GET: RequestHandler = async ({ cookies }) => {
    const sessionId = cookies.get('sessionId');
    if (!sessionId) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await getSession(sessionId);
    if (!session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const data = await getEncryptedData(session.username);

        if (!data) {
            return json({ encryptedData: null, iv: null });
        }

        // Return all fields including legacy flag
        return json(data);
    } catch (error: any) {
        console.error('Error fetching encrypted data:', error);
        return json({ error: 'Failed to fetch encrypted data' }, { status: 500 });
    }
};

/**
 * POST /svelteframe/api/user/encrypted-data
 * Update encrypted data blob for the authenticated user.
 */
export const POST: RequestHandler = async ({ cookies, request }) => {
    const sessionId = cookies.get('sessionId');
    if (!sessionId) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await getSession(sessionId);
    if (!session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { encryptedData, iv } = await request.json();

        if (!encryptedData || !iv) {
            return json({ error: 'Missing encrypted data or IV' }, { status: 400 });
        }

        await saveEncryptedData(session.username, encryptedData, iv);

        return json({ success: true });
    } catch (error: any) {
        console.error('Error saving encrypted data:', error);
        return json({ error: 'Failed to save encrypted data' }, { status: 500 });
    }
};
