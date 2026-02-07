// FILE: src/routes/svelteframe/api/user/preferences/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserByUsername, saveUser } from '$routes/svelteframe/lib/server/auth';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUserByUsername(locals.user.username);
    if (!user) {
        return json({ error: 'User not found' }, { status: 404 });
    }

    // Return the preferences object (or empty object if none exist)
    return json(user.preferences || {});
};

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { key, value } = await request.json();

        // Validate allowed keys to prevent arbitrary data injection
        const allowedKeys = ['keepMenuActive', 'keepSidebarActive', 'theme', 'voiceEditModel'];
        if (!allowedKeys.includes(key)) {
            return json({ error: 'Invalid preference key' }, { status: 400 });
        }

        // Fetch fresh user record to avoid race conditions
        const user = await getUserByUsername(locals.user.username);
        if (!user) {
            return json({ error: 'User not found' }, { status: 404 });
        }

        // Initialize object if missing
        if (!user.preferences) {
            user.preferences = {};
        }

        // Update preference
        // @ts-ignore - Dynamic assignment to typed object
        user.preferences[key] = value;

        await saveUser(user);

        return json({ success: true });
    } catch (e: any) {
        console.error('Failed to save preference:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
