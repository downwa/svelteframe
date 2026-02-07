// FILE: src/routes/svelteframe/useradmin/+page.server.ts
import { fail } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { PageServerLoad, Actions } from './$types';
import {
  getAllUsers,
  getUserByUsername,
  saveUser,
  getUserPath,
  getUserKeysPath,
  type User
} from '$routes/svelteframe/lib/server/auth';
import { deleteKeyWrapper, getKeyWrappers } from '$routes/svelteframe/lib/server/key-wrappers';
import { writeFileAtomic, withFileLock } from '$routes/svelteframe/lib/server/file-utils';
import { sendVerificationEmail } from '$routes/svelteframe/lib/server/nodemailer-email';

export const load: PageServerLoad = async () => {
  const users = await getAllUsers();
  const { isoBase64URL } = await import('@simplewebauthn/server/helpers');

  // Merge lastUsedAt from key-wrappers into credentials
  for (const user of users) {
    if (user.credentials && user.credentials.length > 0) {
      try {
        const wrappers = await getKeyWrappers(user.username);
        for (const cred of user.credentials) {
          const credIdStr = isoBase64URL.fromBuffer(cred.credentialID);
          // Convert to string for client-side consumption
          cred.credentialID = credIdStr;

          const wrapper = wrappers.find(w => w.credentialId === credIdStr);
          if (wrapper) {
            cred.lastUsedAt = wrapper.lastUsedAt;
          }
        }
      } catch (e) {
        console.error(`[load] Error fetching wrappers for ${user.username}:`, e);
      }
    }
  }

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

    const userFromClient: User = JSON.parse(userPayload);

    // --- FIX: Prevent Credential Corruption ---
    // If editing an existing user, fetch the original user data from the server
    // to ensure we don't overwrite critical credential information.
    if (originalUsername) {
      const originalUser = await getUserByUsername(originalUsername);
      if (!originalUser) {
        return fail(404, { error: `Original user ${originalUsername} not found.` });
      }

      // Merge safe fields from the client onto the trusted server version
      originalUser.displayName = userFromClient.displayName;
      originalUser.username = userFromClient.username;
      originalUser.acl = userFromClient.acl;

      // Now save the merged, uncorrupted user object
      await saveUser(originalUser);

      // Handle username change (renaming the file)
      if (originalUsername !== userFromClient.username) {
        try {
          const oldUserPath = getUserPath(originalUsername);
          const newUserPath = getUserPath(userFromClient.username);
          if (existsSync(oldUserPath)) {
            await fs.rename(oldUserPath, newUserPath);
          }

          const oldKeysPath = getUserKeysPath(originalUsername);
          const newKeysPath = getUserKeysPath(userFromClient.username);
          if (existsSync(oldKeysPath)) {
            await fs.rename(oldKeysPath, newKeysPath);
          }
        } catch (e: any) {
          return fail(500, { error: `Failed to rename user files: ${e.message}` });
        }
      }
    } else {
      // This is a new user, so we can save the client object directly
      // as it has no pre-existing credentials to corrupt.
      const token = crypto.randomBytes(32).toString('hex');
      userFromClient.verificationToken = token;
      userFromClient.tokenTimestamp = Date.now();
      const verifyUrl = `${url.origin}/svelteframe/auth/verify-email?token=${token}`;
      await sendVerificationEmail(userFromClient, verifyUrl);
      await saveUser(userFromClient);
    }

    return {
      success: true,
      message: `User ${userFromClient.displayName} has been saved successfully.`
    };
  },

  // ... (deleteUser, disableUser, etc. actions are fine and unchanged)
  deleteUser: async ({ request }) => {
    const data = await request.formData();
    const username = data.get('username') as string;

    const activePath = getUserPath(username);
    const keysPath = getUserKeysPath(username);
    const disabledPath = `${activePath}.disabled`;
    const disabledKeysPath = `${keysPath}.disabled`;

    const results = await Promise.allSettled([
      fs.unlink(activePath),
      fs.unlink(keysPath),
      fs.unlink(disabledPath),
      fs.unlink(disabledKeysPath)
    ]);

    const realError = results.find(
      (result) => result.status === 'rejected' && result.reason.code !== 'ENOENT'
    );

    if (realError) {
      const reason = (realError as PromiseRejectedResult).reason;
      return fail(500, { error: `Failed to delete user: ${reason.message}` });
    }

    return { success: true, message: `User ${username} deleted.` };
  },

  deleteCredential: async ({ request }) => {
    const data = await request.formData();
    const username = data.get('username') as string;
    const credentialId = data.get('credentialId') as string;

    if (!username || !credentialId) {
      return fail(400, { error: 'Username and Credential ID are required.' });
    }

    try {
      // 1. Update User File
      const user = await getUserByUsername(username);
      if (!user) {
        return fail(404, { error: 'User not found.' });
      }

      const { isoBase64URL } = await import('@simplewebauthn/server/helpers');
      const initialCredCount = user.credentials?.length || 0;
      user.credentials = (user.credentials || []).filter((c: any) => {
        const id = typeof c.credentialID === 'string'
          ? c.credentialID
          : isoBase64URL.fromBuffer(c.credentialID);
        return id !== credentialId;
      });

      if (user.credentials.length === initialCredCount) {
        // Fallback check if the above didn't match (e.g. format differences)
        user.credentials = (user.credentials || []).filter((c: any) => c.id !== credentialId);
      }

      await saveUser(user);

      // 2. Update Keys File (remove linked PRF wrappers)
      const wrappers = await getKeyWrappers(username);
      // Ensure we match the credentialId correctly, handling potential format differences
      // Normalizing both sides by removing base64 padding to be absolutely sure
      const normalizedTarget = credentialId.replace(/=+$/, '');
      const wrappersToDelete = wrappers.filter(w => {
        if (w.type !== 'PRF' || !w.credentialId) return false;
        const normalizedWId = w.credentialId.replace(/=+$/, '');
        return normalizedWId === normalizedTarget;
      });

      if (wrappersToDelete.length > 0) {
        for (const w of wrappersToDelete) {
          await deleteKeyWrapper(username, w.id);
        }
      }

      return { success: true, message: 'Credential deleted successfully.' };
    } catch (e: any) {
      console.error('[deleteCredential] Error:', e);
      return fail(500, { error: `Failed to delete credential: ${e.message}` });
    }
  },

  disableUser: async ({ request }) => {
    const data = await request.formData();
    const username = data.get('username') as string;
    try {
      const userPath = getUserPath(username);
      if (existsSync(userPath)) {
        await fs.rename(userPath, `${userPath}.disabled`);
      }
      const keysPath = getUserKeysPath(username);
      if (existsSync(keysPath)) {
        await fs.rename(keysPath, `${keysPath}.disabled`);
      }
      return { success: true, message: `User ${username} disabled.` };
    } catch (e: any) {
      return fail(500, { error: `Failed to disable user: ${e.message}` });
    }
  },

  enableUser: async ({ request }) => {
    const data = await request.formData();
    const username = data.get('username') as string;
    try {
      const userPath = getUserPath(username);
      const disabledPath = `${userPath}.disabled`;
      if (existsSync(disabledPath)) {
        await fs.rename(disabledPath, userPath);
      }
      const keysPath = getUserKeysPath(username);
      const disabledKeysPath = `${keysPath}.disabled`;
      if (existsSync(disabledKeysPath)) {
        await fs.rename(disabledKeysPath, keysPath);
      }
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

    const token = crypto.randomBytes(32).toString('hex');
    user.verificationToken = token;
    user.tokenTimestamp = Date.now();
    user.tokenConsumedTimestamp = undefined; // Clear previous consumption
    user.verified = false; // Reset verification status to allow fresh flow
    await saveUser(user);

    const verifyUrl = `${url.origin}/svelteframe/auth/verify-email?token=${token}`;
    await sendVerificationEmail(user, verifyUrl);

    return {
      success: true,
      message: `Verification email resent to ${username}.`
    };
  }
};
