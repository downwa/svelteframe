// FILE: src/routes/svelteframe/api/user/device-token/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession, getUserByUsername, getUserById, saveUser } from '$routes/svelteframe/lib/server/auth';
import {
    createDeviceToken,
    getDeviceToken,
    updateDeviceTokenStatus,
} from '$routes/svelteframe/lib/server/device-tokens';
import crypto from 'node:crypto';

/**
 * POST /svelteframe/api/user/device-token
 * Create a new device migration token.
 */
export const POST: RequestHandler = async ({ cookies, request }) => {
    const sessionId = cookies.get('sessionId');
    if (!sessionId) {
        return json({ error: 'Unauthorized (No Session)' }, { status: 401 });
    }

    const session = await getSession(sessionId);
    if (!session) {
        return json({ error: 'Unauthorized (Invalid Session)' }, { status: 401 });
    }

    try {
        const { wrappedMEK, duration = 900 } = await request.json(); // Default 15 minutes
        console.log(`[DeviceToken:POST] Creating token for ${session.username}`);

        const user = await getUserByUsername(session.username);
        if (!user) {
            console.error(`[DeviceToken:POST] User ${session.username} not found in DB`);
            return json({ error: 'User not found' }, { status: 404 });
        }

        // Backfill ID if missing (migration support)
        if (!user.id) {
            user.id = crypto.randomUUID();
            await saveUser(user);
            console.log(`[DeviceToken:POST] Backfilled ID for user ${user.username}`);
        }

        const tokenId = crypto.randomUUID();
        const token = {
            id: tokenId,
            userId: user.id,
            token: tokenId,
            wrappedMEK,
            status: 'pending' as const,
            expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
            createdAt: new Date().toISOString(),
        };

        console.log(`[DeviceToken:POST] Storing token ${tokenId} for user ${user.id}`);
        await createDeviceToken(token);
        console.log(`[DeviceToken:POST] Successfully created token: ${tokenId}`);

        return json({ token: tokenId, expiresAt: token.expiresAt });
    } catch (error: any) {
        console.error('[DeviceToken:POST] Error creating device token:', error);
        return json({ error: 'Failed to create device token: ' + error.message }, { status: 500 });
    }
};

/**
 * GET /svelteframe/api/user/device-token?token=<TOKEN>
 * Fetch device token details.
 */
export const GET: RequestHandler = async ({ url }) => {
    const rawTokenId = url.searchParams.get('token') || '';
    const tokenId = rawTokenId.trim();
    console.log(`[DeviceToken:GET] Fetching token: "${tokenId}"`);

    if (!tokenId) {
        return json({ error: 'Token required' }, { status: 400 });
    }

    try {
        const token = await getDeviceToken(tokenId);

        if (!token) {
            console.warn(`[DeviceToken:GET] Token "${tokenId}" NOT FOUND on disk or already used`);
            return json({ error: 'Token not found or already used' }, { status: 404 });
        }

        console.log(`[DeviceToken:GET] Found token ${tokenId}, status: ${token.status}, userId: ${token.userId}`);

        if (new Date(token.expiresAt) < new Date()) {
            console.warn(`[DeviceToken:GET] Token ${tokenId} has expired`);
            await updateDeviceTokenStatus(tokenId, 'expired');
            return json({ error: 'Token expired' }, { status: 410 });
        }

        const user = await getUserById(token.userId);
        if (!user) {
            console.error(`[DeviceToken:GET] User ${token.userId} associated with token not found`);
            return json({ error: 'User associated with token not found' }, { status: 404 });
        }

        const { hasRecoveryPassword } = await import('$routes/svelteframe/lib/server/auth');
        const hasRecovery = await hasRecoveryPassword(user.username);

        return json({
            wrappedMEK: token.wrappedMEK,
            status: token.status,
            username: user.username,
            displayName: user.displayName,
            hasRecoveryPassword: hasRecovery
        });
    } catch (error: any) {
        console.error('[DeviceToken:GET] Error fetching device token:', error);
        return json({ error: 'Failed to fetch device token' }, { status: 500 });
    }
};

/**
 * PATCH /svelteframe/api/user/device-token
 * Mark token as consumed.
 */
export const PATCH: RequestHandler = async ({ request }) => {
    try {
        const { token } = await request.json();

        if (!token) {
            return json({ error: 'Token required' }, { status: 400 });
        }

        const tokenData = await getDeviceToken(token);

        if (!tokenData) {
            return json({ error: 'Token not found' }, { status: 404 });
        }

        await updateDeviceTokenStatus(token, 'consumed');

        return json({ success: true });
    } catch (error: any) {
        console.error('Error updating device token:', error);
        return json({ error: 'Failed to update device token' }, { status: 500 });
    }
};
