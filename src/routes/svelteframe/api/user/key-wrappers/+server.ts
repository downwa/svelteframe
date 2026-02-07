// FILE: src/routes/svelteframe/api/user/key-wrappers/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, getUserByUsername } from '$routes/svelteframe/lib/server/auth';
import {
    getKeyWrappers,
    saveKeyWrapper,
    deleteKeyWrapper,
} from '$routes/svelteframe/lib/server/key-wrappers';

/**
 * GET /svelteframe/api/user/key-wrappers
 * Fetch all key wrappers for the authenticated user.
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
        console.log(`[API:key-wrappers] Fetching for user: ${session.username}`);
        const wrappers = await getKeyWrappers(session.username);
        console.log(`[API:key-wrappers] Found ${wrappers.length} wrappers`);
        return json({ wrappers });
    } catch (error: any) {
        console.error('Error fetching key wrappers:', error);
        return json({ error: 'Failed to fetch key wrappers' }, { status: 500 });
    }
};

/**
 * POST /svelteframe/api/user/key-wrappers
 * Add a new key wrapper for the authenticated user.
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
        const { type, wrappedKeyBytes, salt, credentialId } = await request.json();

        if (!type || !wrappedKeyBytes) {
            return json({ error: 'Missing required fields' }, { status: 400 });
        }

        const user = await getUserByUsername(session.username);
        if (!user || !user.id) {
            return json({ error: 'User not found' }, { status: 404 });
        }

        const wrapper = {
            id: crypto.randomUUID(),
            type,
            wrappedKeyBytes,
            salt,
            credentialId,
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
        };

        await saveKeyWrapper(session.username, user.id, wrapper);

        return json({ success: true, wrapperId: wrapper.id });
    } catch (error: any) {
        console.error('Error saving key wrapper:', error);
        return json({ error: 'Failed to save key wrapper' }, { status: 500 });
    }
};

/**
 * DELETE /svelteframe/api/user/key-wrappers
 * Remove a key wrapper for the authenticated user.
 */
export const DELETE: RequestHandler = async ({ cookies, request }) => {
    const sessionId = cookies.get('sessionId');
    if (!sessionId) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await getSession(sessionId);
    if (!session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { wrapperId } = await request.json();

        if (!wrapperId) {
            return json({ error: 'Wrapper ID required' }, { status: 400 });
        }

        await deleteKeyWrapper(session.username, wrapperId);

        return json({ success: true });
    } catch (error: any) {
        console.error('Error deleting key wrapper:', error);
        return json({ error: 'Failed to delete key wrapper' }, { status: 500 });
    }
};
