// FILE: src/routes/svelteframe/auth/login/generate-options/+server.ts
import { json } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';

// Import the helper to convert a buffer to a Base64URL string
import { isoBase64URL } from '@simplewebauthn/server/helpers';

import {
  getUserByUsername,
  encodeUsernameForCookie,
} from '$routes/svelteframe/lib/server/auth';
import { env } from '$env/dynamic/private';
import { debugLog } from '$routes/svelteframe/lib/server/debug';

export async function POST({ request, cookies }) {
  const { username } = await request.json();

  debugLog(`Generating login options for user: ${username}`);

  const user = await getUserByUsername(username);
  debugLog('Retrieved user object:', user);

  if (!user || user.credentials.length === 0) {
    return json(
      { error: 'User not found or has no registered credentials.' },
      { status: 404 },
    );
  }

  // Use @simplewebauthn/server's generateAuthenticationOptions
  const options = await generateAuthenticationOptions({
    rpID: env.RPID,
    allowCredentials: user.credentials.map((cred) => ({
      id: isoBase64URL.fromBuffer(cred.credentialID),
      type: 'public-key',
      transports: cred.transports,
      // --- FIX: Pass the supportsPRF flag to the library ---
      // This is required for the library to include the PRF extension in its response.
      supportsPRF: cred.supportsPRF,
    })),
    userVerification: 'preferred',
    // Request PRF values on login. A fixed salt is used for deterministic key derivation.
    extensions: {
      prf: {
        eval: {
          first: isoBase64URL.fromBuffer(Buffer.alloc(32, 0)), // 32 bytes of zeros matching registration
        },
      },
    } as any,
  });

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
