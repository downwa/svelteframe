import { json } from '@sveltejs/kit';
import webauthnServer from '@webauthn/server';
const { generateLoginChallenge } = webauthnServer;

// Import the helper to convert a buffer to a Base64URL string
import { isoBase64URL } from '@simplewebauthn/server/helpers';

import { getUserByUsername, encodeUsernameForCookie } from '$routes/sveltepress/lib/server/auth';
import { env } from '$env/dynamic/private';
import { debugLog } from '$routes/sveltepress/lib/server/debug';

export async function POST({ request, cookies }) {
  const { username } = await request.json();

  debugLog(`Generating login options for user: ${username}`);

  const user = await getUserByUsername(username);
  debugLog('Retrieved user object:', user);

  if (!user || user.credentials.length === 0) {
    return json(
      { error: 'User not found or has no registered credentials.' },
      { status: 404 }
    );
  }

  const { challenge } = generateLoginChallenge({});

  // Manually construct the full options object for the client.
  const options = {
    challenge,
    rpId: env.RPID,
    // FIX: Convert the credentialID buffer (from getUserByUsername)
    // back into a Base64URL string for the client library.
    allowCredentials: user.credentials.map((cred) => ({
      id: isoBase64URL.fromBuffer(cred.credentialID),
      type: 'public-key',
      transports: cred.transports,
    })),
    userVerification: 'preferred',
  };

  const cookieName = `${encodeUsernameForCookie(username)}_login_challenge`;
  cookies.set(cookieName, options.challenge, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 5,
  });

  debugLog('Generated login options for client:', options);
  return json(options);
}