// FILE: src/routes/svelteframe/api/user/check-device-token/+server.ts
import { json, error } from '@sveltejs/kit';
import { getDeviceToken } from '$routes/svelteframe/lib/server/device-tokens';

export async function POST({ request, locals }) {
    const { user } = locals;

    // 1. Ensure the user is authenticated
    if (!user) {
        throw error(401, 'Authentication required.');
    }

    const { token } = await request.json();
    if (!token) {
        throw error(400, 'Token is required.');
    }

    // 2. Check the status of the token from the centralized store
    const tokenData = await getDeviceToken(token);

    if (!tokenData) {
        // If not found, it might have been cleaned up or invalid
        return json({ status: 'invalid' });
    }

    // Ensure this token belongs to the requesting user
    if (tokenData.userId !== user.id && tokenData.userId !== user.username) {
        // Note: userId might be UUID or username depending on legacy data, 
        // but createDeviceToken uses user.id (UUID) or updates it.
        // Let's be safe.
        // Actually, device-token endpoint ensures user.id exists.
        if (tokenData.userId !== user.id) {
            return json({ status: 'invalid' });
        }
    }

    return json({ status: tokenData.status });
}
