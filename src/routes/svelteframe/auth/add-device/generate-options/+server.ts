import { json } from '@sveltejs/kit';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { getDeviceToken, updateDeviceTokenStatus } from '$routes/svelteframe/lib/server/device-tokens';
import { getUserById, saveUser } from '$routes/svelteframe/lib/server/auth';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';

const RP_NAME = env.RP_NAME || 'SvelteFrame Portal';

export const POST: RequestHandler = async ({ request, url, cookies }) => {
    try {
        const { token } = await request.json();

        if (!token) {
            return json({ error: 'Token is required' }, { status: 400 });
        }

        const tokenData = await getDeviceToken(token);
        if (!tokenData) {
            return json({ error: 'Invalid token' }, { status: 401 });
        }

        if (tokenData.status !== 'pending') {
            return json({ error: 'Token is no longer valid' }, { status: 410 });
        }

        // Check expiration
        if (new Date(tokenData.expiresAt) < new Date()) {
            await updateDeviceTokenStatus(token, 'expired');
            return json({ error: 'Token expired' }, { status: 410 });
        }

        const user = await getUserById(tokenData.userId);
        if (!user) {
            return json({ error: 'User not found' }, { status: 404 });
        }

        // --- Handle missing user.id (Legacy users during transfer) ---
        if (!user.id) {
            user.id = crypto.randomUUID();
            await saveUser(user);
        }

        const rpID = env.RPID || url.hostname;

        // Generate registration options
        const options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID,
            userID: Buffer.from(user.id, 'utf-8'),
            userName: user.username,
            userDisplayName: user.displayName || user.username,
            attestationType: 'none',
            excludeCredentials: user.credentials.map(cred => ({
                id: isoBase64URL.fromBuffer(cred.credentialID as any),
                type: 'public-key',
                transports: cred.transports,
            })),
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'required',
            },
            supportedAlgorithmIDs: [-7, -35, -257], // ES256, ES384, RS256
            extensions: {
                prf: {
                    eval: {
                        // PRF salt needs to be JSON-safe string for the client
                        // Use consistent 32-byte zeroed buffer as in standard registration
                        first: isoBase64URL.fromBuffer(Buffer.alloc(32, 0))
                    }
                }
            } as any
        });

        // Set challenge cookie for verification
        cookies.set('reg_challenge', options.challenge, {
            path: '/',
            httpOnly: true,
            secure: url.protocol === 'https:',
            maxAge: 600 // 10 minutes
        });

        return json(options);
    } catch (e: any) {
        console.error('Error generating options:', e);
        return json({ error: e.message }, { status: 500 });
    }
};

