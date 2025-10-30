// FILE: src/routes/sveltepress/useradmin/+page.server.ts
import { fail } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import { existsSync } from 'fs'; // Import existsSync for the saveUser check
import path from 'path';
import crypto from 'crypto';
import type { PageServerLoad, Actions } from './$types';
import {
  getAllUsers,
  getUserByUsername,
  saveUser,
  type User,
} from '$routes/sveltepress/lib/server/auth';
import { sendVerificationEmail } from '$routes/sveltepress/lib/server/email';

export const load: PageServerLoad = async () => {
  const users = await getAllUsers();
  return { users };
};

export const actions: Actions = {
  saveUser: async ({ request, url }) => {
    const data = await request.formData();
    const userPayload = data.get('user') as string;
    const originalUsername = data.get('originalUsername') as string | null;

    if (!userPayload) {
      return fail(400, { error: 'User data is missing.' });
    }

    const user: User = JSON.parse(userPayload);

    if (originalUsername !== user.username) {
      const activePath = path.join('users', `${user.username}.json`);
      const disabledPath = path.join('users', `${user.username}.json.disabled`);
      if (existsSync(activePath) || existsSync(disabledPath)) {
        return fail(400, {
          error: `User with email ${user.username} already exists (active or disabled).`,
        });
      }
    }

    if (originalUsername && originalUsername !== user.username) {
      try {
        await fs.rename(
          path.join('users', `${originalUsername}.json`),
          path.join('users', `${user.username}.json`),
        );
      } catch (e: any) {
        return fail(500, { error: `Failed to rename user file: ${e.message}` });
      }
    }

    if (!originalUsername) {
      const token = crypto.randomBytes(32).toString('hex');
      user.verificationToken = token;
      user.tokenTimestamp = Date.now();
      // --- FIX: Call the real email function ---
      const verifyUrl = `${url.origin}/sveltepress/auth/verify-email?token=${token}`;
      await sendVerificationEmail(user, verifyUrl);
    }

    await saveUser(user);

    return {
      success: true,
      message: `User ${user.displayName} has been saved successfully.`,
    };
  },

  // --- FIX: Robust delete logic using Promise.allSettled ---
  deleteUser: async ({ request }) => {
    const data = await request.formData();
    const username = data.get('username') as string;
    const activePath = path.join('users', `${username}.json`);
    const disabledPath = path.join('users', `${username}.json.disabled`);

    // Attempt to delete both possible files.
    const results = await Promise.allSettled([
      fs.unlink(activePath),
      fs.unlink(disabledPath),
    ]);

    // Check for any "real" errors (i.e., not just "file not found").
    const realError = results.find(
      (result) =>
        result.status === 'rejected' && result.reason.code !== 'ENOENT',
    );

    if (realError) {
      const reason = (realError as PromiseRejectedResult).reason;
      return fail(500, { error: `Failed to delete user: ${reason.message}` });
    }

    return { success: true, message: `User ${username} deleted.` };
  },

  disableUser: async ({ request }) => {
    const data = await request.formData();
    const username = data.get('username') as string;
    try {
      await fs.rename(
        path.join('users', `${username}.json`),
        path.join('users', `${username}.json.disabled`),
      );
      return { success: true, message: `User ${username} disabled.` };
    } catch (e: any) {
      return fail(500, { error: `Failed to disable user: ${e.message}` });
    }
  },

  enableUser: async ({ request }) => {
    const data = await request.formData();
    const username = data.get('username') as string;
    try {
      await fs.rename(
        path.join('users', `${username}.json.disabled`),
        path.join('users', `${username}.json`),
      );
      return { success: true, message: `User ${username} enabled.` };
    } catch (e: any) {
      return fail(500, { error: `Failed to enable user: ${e.message}` });
    }
  },

  resendVerification: async ({ request, url }) => {
    const data = await request.formData();
    const username = data.get('username') as string;
    const user = await getUserByUsername(username);
    if (!user) {
      return fail(404, { error: 'User not found.' });
    }
    if (user.verified) {
      return fail(400, { error: 'User is already verified.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.verificationToken = token;
    user.tokenTimestamp = Date.now();
    await saveUser(user);

    // --- FIX: Call the real email function ---
    const verifyUrl = `${url.origin}/sveltepress/auth/verify-email?token=${token}`;
    await sendVerificationEmail(user, verifyUrl);

    return {
      success: true,
      message: `Verification email resent to ${username}.`,
    };
  },
};