// FILE: src/routes/sveltepress/auth/register/generate-options/+server.ts
import { json, error } from '@sveltejs/kit';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { env } from '$env/dynamic/private';
import {
  getUserByUsername,
  encodeUsernameForCookie,
} from '$routes/sveltepress/lib/server/auth';

const REGISTRATION_SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function POST({ cookies }) {
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

  if (
    Date.now() - (user.registrationSessionTimestamp || 0) >
    REGISTRATION_SESSION_TIMEOUT_MS
  ) {
    throw error(403, 'Registration session has expired. Please verify your email again.');
  }

  if (user.credentials.length > 0) {
    throw error(409, 'This user has already registered a passkey.');
  }

  // --- FIX: DO NOT consume the ticket here. ---
  // This endpoint is now a read-only validation step. It does not modify
  // the user file, which prevents the HMR reload from interrupting the client.

  const userIDBuffer = Buffer.from(user.username, 'utf-8');

  const options = await generateRegistrationOptions({
    rpName: env.RP_NAME || 'SveltePress',
    rpID: env.RPID,
    userID: userIDBuffer,
    userName: user.displayName,
    attestationType: 'none',
    excludeCredentials: [],
  });

  const cookieName = `${encodeUsernameForCookie(
    username,
  )}_registration_challenge`;
  cookies.set(cookieName, options.challenge, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 5,
  });

  return json(options);
}