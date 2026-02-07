// FILE: src/routes/svelteframe/auth/verify-email/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import crypto from 'crypto'; // Import the crypto module
import {
  getUserByUsername,
  saveUser,
  listUserFiles,
  type User,
} from '$routes/svelteframe/lib/server/auth';
import { debugLog } from '$routes/svelteframe/lib/server/debug';
import type { PageServerLoad } from './$types';

const TOKEN_EXPIRATION_MS = 120 * 60 * 60 * 1000; // 120 hours

export const load: PageServerLoad = async ({ url, cookies }) => {
  const token = url.searchParams.get('token');
  if (!token) {
    throw error(400, 'Verification token is missing.');
  }

  const { active } = await listUserFiles();

  let foundUser: User | null = null;
  for (const file of active) {
    const username = file.replace('.json', '');
    const user = await getUserByUsername(username);
    if (user?.verificationToken === token) {
      foundUser = user;
      break;
    }
  }

  if (!foundUser) {
    throw error(404, 'Invalid or expired verification token.');
  }

  if (Date.now() - (foundUser.tokenTimestamp || 0) > TOKEN_EXPIRATION_MS) {
    throw error(400, 'Verification token has expired. Please request a new one.');
  }

  // --- FIX: Handle Link Pre-fetching (Idempotency with Grace Period) ---
  const GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 minutes

  if (foundUser.tokenConsumedTimestamp) {
    // Token has already been used. Check if it's within the grace period.
    const timeSinceConsumed = Date.now() - foundUser.tokenConsumedTimestamp;
    debugLog(`Token reused. Time since first consumption: ${timeSinceConsumed}ms. Grace period: ${GRACE_PERIOD_MS}ms`);

    if (timeSinceConsumed < GRACE_PERIOD_MS) {
      debugLog('Token reused within grace period (likely pre-fetch). Allowing.');
      // Proceed to generate ticket and redirect (idempotent success)
    } else {
      throw error(400, 'Verification token has already been used.');
    }
  } else {
    // First time using this token. Mark as consumed.
    foundUser.verified = true;
    foundUser.tokenConsumedTimestamp = Date.now();
    // DO NOT delete verificationToken yet, so we can find the user during grace period.
    // delete foundUser.verificationToken; 
    // delete foundUser.tokenTimestamp;
    debugLog('Verifying user and starting grace period.');
  }

  // --- FIX: Race Condition / Stability ---
  // If we are within the grace period, REUSE the existing session token if it's still valid.
  // This prevents a pre-fetch from rotating the token right before/after the user clicks,
  // which would invalidate the user's cookie.

  let sessionToken = foundUser.registrationSessionToken;
  const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes match generate-options

  let shouldSave = false;

  if (
    !sessionToken ||
    !foundUser.registrationSessionTimestamp ||
    (Date.now() - foundUser.registrationSessionTimestamp > SESSION_TIMEOUT_MS)
  ) {
    // Generate new token if missing or expired
    sessionToken = crypto.randomBytes(32).toString('hex');
    foundUser.registrationSessionToken = sessionToken;
    foundUser.registrationSessionTimestamp = Date.now();
    shouldSave = true;
    debugLog('Generated NEW session token for verified user.');
  } else {
    debugLog('Reusing EXISTING session token for verified user (Grace Period).');
  }

  if (shouldSave) {
    await saveUser(foundUser);
  }

  // --- FIX: Issue a cookie containing BOTH the username and the secret token ---
  const ticketPayload = JSON.stringify({
    username: foundUser.username,
    token: sessionToken,
  });
  cookies.set('registration-ticket', ticketPayload, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 15, // Ticket is valid for 15 minutes
  });

  // --- FIX: Redirect to the registration page, not the login page. ---
  throw redirect(
    303,
    `/svelteframe/auth/register?username=${encodeURIComponent(
      foundUser.username,
    )}&verified=true`,
  );
};
