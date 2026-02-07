// FILE: src/routes/svelteframe/auth/register/generate-options/+server.ts
import { json, error } from '@sveltejs/kit';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { env } from '$env/dynamic/private';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import crypto from 'node:crypto';
import {
  getUserByUsername,
  saveUser,
  encodeUsernameForCookie
} from '$routes/svelteframe/lib/server/auth';
import { debugLog } from '$routes/svelteframe/lib/server/debug';

const REGISTRATION_SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function POST({ request, cookies }) {
  const ticketPayload = cookies.get('registration-ticket');
  if (!ticketPayload) {
    throw error(403, 'Missing registration ticket. Please verify your email again.');
  }

  let ticket: { username: string; token: string };
  try {
    ticket = JSON.parse(ticketPayload);
  } catch {
    throw error(400, 'Malformed registration ticket.');
  }

  const { username, token } = ticket;
  if (!username || !token) {
    throw error(400, 'Invalid registration ticket payload.');
  }

  const user = await getUserByUsername(username);
  if (!user) {
    throw error(404, 'User not found.');
  }

  if (user.registrationSessionToken !== token) {
    throw error(403, 'Invalid session token. Please verify your email again.');
  }

  if (Date.now() - (user.registrationSessionTimestamp || 0) > REGISTRATION_SESSION_TIMEOUT_MS) {
    throw error(403, 'Registration session has expired. Please verify your email again.');
  }

  // --- THE FIX: Remove the blocking check ---
  // This block is removed because a valid registration-ticket now authorizes
  // both first-time registration AND adding a new device to an existing account.
  /*
    if (user.credentials.length > 0) {
      debugLog('generate-options: User has already registered a passkey.');
      throw error(409, 'This user has already registered a passkey.');
    }
    */

  let clientDisplayName: string | undefined;
  try {
    const body = await request.json();
    clientDisplayName = body.displayName;
  } catch (e) {
    // Ignore JSON parse errors if body is empty
  }

  const finalDisplayName = clientDisplayName || user.displayName || user.username;

  // --- FIX: Ensure user has a stable UUID for WebAuthn ---
  if (!user.id) {
    user.id = crypto.randomUUID();
    await saveUser(user);
  }

  const options = await generateRegistrationOptions({
    rpName: env.RP_NAME || 'SvelteFrame',
    rpID: env.RPID,
    userID: Buffer.from(user.id, 'utf-8'),
    userName: finalDisplayName,
    userDisplayName: finalDisplayName,
    attestationType: 'none',

    // --- BEST PRACTICE: Exclude existing credentials ---
    // This tells the browser which keys are already registered for this user,
    // preventing the user from accidentally re-registering the same device.
    excludeCredentials: user.credentials.map((cred) => ({
      id: isoBase64URL.fromBuffer(cred.credentialID),
      type: 'public-key',
      transports: cred.transports
    })),

    supportedAlgorithmIDs: [-7, -35, -257], // ES256, ES384, RS256
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred'
    },
    extensions: {
      prf: {
        eval: {
          first: isoBase64URL.fromBuffer(Buffer.alloc(32, 0))
        }
      }
    } as any
  });

  const cookieName = `${encodeUsernameForCookie(username)}_registration_challenge`;
  cookies.set(cookieName, options.challenge, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 5
  });

  return json(options);
}
