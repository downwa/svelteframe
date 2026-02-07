import { json } from '@sveltejs/kit';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { getDeviceToken, updateDeviceTokenStatus } from '$routes/svelteframe/lib/server/device-tokens';
import { getUserById, saveUser, createSession, encodeUsernameForCookie } from '$routes/svelteframe/lib/server/auth';
import { saveKeyWrapper } from '$routes/svelteframe/lib/server/key-wrappers';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';

// Use dynamic RPID and ORIGIN from environment or request URL
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
    try {
        const body = await request.json();
        const { token, attestation, wrappedMEK, wrapperType } = body;

        // Dynamic origin check
        const origin = url.origin;
        const rpID = url.hostname;

        const tokenData = await getDeviceToken(token);
        if (!tokenData || tokenData.status !== 'pending') {
            return json({ error: 'Invalid or expired token' }, { status: 400 });
        }

        // Verify challenge cookie
        const expectedChallenge = cookies.get('reg_challenge');
        if (!expectedChallenge) {
            return json({ error: 'Session expired (missing challenge)' }, { status: 400 });
        }

        const user = await getUserById(tokenData.userId);
        if (!user) {
            return json({ error: 'User not found' }, { status: 404 });
        }

        // Verify authentication response
        const verification = await verifyRegistrationResponse({
            response: attestation,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true,
        });

        const { verified, registrationInfo } = verification;

        if (!verified || !registrationInfo) {
            return json({ error: 'Verification failed' }, { status: 400 });
        }

        const { id, publicKey, counter } = registrationInfo.credential;
        const { credentialDeviceType, credentialBackedUp } = registrationInfo;

        // Save new credential
        user.credentials.push({
            credentialID: id,
            credentialPublicKey: publicKey,
            counter,
            transports: attestation.response.transports || [],
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp
        });

        await saveUser(user);

        // Save wrapped MEK if provided
        if (wrappedMEK && wrapperType !== 'NONE') {
            const wrapper = {
                id: crypto.randomUUID(),
                type: (wrapperType || 'PRF') as 'PRF' | 'RECOVERY_PASSWORD',
                wrappedKeyBytes: wrappedMEK,
                salt: body.salt, // Include salt for RECOVERY_PASSWORD
                createdAt: new Date().toISOString(),
                lastUsedAt: new Date().toISOString(),
                credentialId: id
            };
            await saveKeyWrapper(user.username, user.id!, wrapper);
        }

        // Consume token
        await updateDeviceTokenStatus(token, 'consumed');

        // Cleanup challenge cookie
        cookies.delete('reg_challenge', { path: '/' });

        // Create session
        const sessionId = await createSession(user.username);
        cookies.set('sessionId', sessionId, {
            path: '/',
            httpOnly: true,
            secure: url.protocol === 'https:',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30 // 30 days
        });

        // Set username cookie (client-side convenience)
        cookies.set('username', encodeUsernameForCookie(user.username), {
            path: '/',
            httpOnly: false, // Accessible to JS
            secure: url.protocol === 'https:',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30
        });

        return json({ success: true });
    } catch (e: any) {
        console.error('Verification error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
