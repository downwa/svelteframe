
import { json, error } from '@sveltejs/kit';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import {
    getUserByUsername,
    createUser,
    saveUser,
} from '$routes/svelteframe/lib/server/auth';
import { sendVerificationEmail } from '$routes/svelteframe/lib/server/nodemailer-email';
import { debugLog } from '$routes/svelteframe/lib/server/debug';

async function verifyTurnstile(token: string | null) {
    if (!token) return false;
    const form = new URLSearchParams();
    form.set('secret', env.TURNSTILE_SECRET_KEY || '');
    form.set('response', token);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form
    });

    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return data.success;
}

export async function POST({ request, url }) {
    try {
        const { username, turnstileToken } = await request.json();

        if (!username) {
            throw error(400, 'Username (email) is required.');
        }

        debugLog('register/initiate: Checking Turnstile. Secret Key Exists:', !!env.TURNSTILE_SECRET_KEY);
        const isHuman = await verifyTurnstile(turnstileToken);

        if (!isHuman) {
            debugLog('register/initiate: Turnstile verification failed. Token:', turnstileToken);
            throw error(400, 'Human verification failed. Please try again.');
        }

        debugLog('register/initiate: Received request for', username);

        let user = await getUserByUsername(username);

        // If user exists and is verified, they should just login.
        if (user && user.verified) {
            debugLog('register/initiate: User already verified.');
            throw error(409, 'User with this email already exists and is verified. Please log in.');
        }

        // If user does not exist, create a pending user.
        if (!user) {
            debugLog('register/initiate: Creating new pending user.');
            // Use username as displayName initially
            user = await createUser(username, username.split('@')[0]);
        } else {
            debugLog('register/initiate: User exists but not verified. Resending token.');
        }

        // Generate verification token
        const token = crypto.randomBytes(32).toString('hex');
        user.verificationToken = token;
        user.tokenTimestamp = Date.now();
        await saveUser(user);
        debugLog('register/initiate: User saved with token.');

        // Send email
        const verifyUrl = `${url.origin}/svelteframe/auth/verify-email?token=${token}`;
        debugLog('register/initiate: Sending email to', username, verifyUrl);

        const emailResult = await sendVerificationEmail(user, verifyUrl);

        if (!emailResult.success) {
            debugLog('register/initiate: Email failed', emailResult.error);
            throw error(500, 'Failed to send verification email. Please contact support.');
        }

        debugLog('register/initiate: Email sent successfully.');
        return json({ success: true, message: 'Verification email sent.' });

    } catch (err: any) {
        console.error('register/initiate CRITICAL ERROR:', err);
        debugLog('register/initiate CRITICAL ERROR', err.message, err.stack);

        // If it's already a SvelteKit error, rethrow it
        if (err.status && err.body) throw err;

        throw error(500, `Internal Error: ${err.message}`);
    }
}
