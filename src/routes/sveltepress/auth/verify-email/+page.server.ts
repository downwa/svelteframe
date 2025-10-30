// FILE: src/routes/sveltepress/auth/verify-email/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import crypto from 'crypto'; // Import the crypto module
import {
  getUserByUsername,
  saveUser,
  type User,
} from '$routes/sveltepress/lib/server/auth';
import type { PageServerLoad } from './$types';

const TOKEN_EXPIRATION_MS = 120 * 60 * 60 * 1000; // 120 hours

export const load: PageServerLoad = async ({ url, cookies }) => {
  const token = url.searchParams.get('token');
  if (!token) {
    throw error(400, 'Verification token is missing.');
  }

  const userFiles = (await fs.readdir('users')).filter((f) =>
    f.endsWith('.json'),
  );

  let foundUser: User | null = null;
  for (const file of userFiles) {
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

  // Success! Verify the user.
  foundUser.verified = true;
  delete foundUser.verificationToken;
  delete foundUser.tokenTimestamp;
  
  // --- FIX: Generate and store a secure, single-use session token ---
  const sessionToken = crypto.randomBytes(32).toString('hex');
  foundUser.registrationSessionToken = sessionToken;
  foundUser.registrationSessionTimestamp = Date.now();
  await saveUser(foundUser);

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
    `/sveltepress/auth/register?username=${encodeURIComponent(
      foundUser.username,
    )}&verified=true`,
  );
};