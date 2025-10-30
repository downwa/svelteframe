// FILE: src/routes/sveltepress/lib/server/startup.ts
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import {
  listUserFiles,
  getUserByUsername,
  saveUser,
} from '$routes/sveltepress/lib/server/auth';
import { sendVerificationEmail } from '$routes/sveltepress/lib/server/email';
// --- FIX: Import MODE for logging and debugLog ---
import { env } from '$env/dynamic/private';
import { debugLog } from '$routes/sveltepress/lib/server/debug';
import crypto from 'crypto';

let initPromise: Promise<void> | null = null;
let isInitialized = false;


/**
 * This function runs once on server startup. It handles the initial setup
 * of SveltePress, including creating the first admin user from .env variables
 * and sending the initial verification email.
 */
async function _initializeSveltePress(): Promise<boolean> {
  debugLog('SveltePress: Attempting Initialization...');

  // --- Logic to create initial admin user from .env if needed ---
  if (env.ADMINUSER) {
    debugLog('SveltePress: Initializing...');
    // --- FIX: Add the requested debug log messages ---
    debugLog('Server starting in mode:', process.env.NODE_ENV ?? import.meta.env.MODE,'; Admin user:', env.ADMINUSER);
    debugLog('Using origin:', env.ORIGIN, '; RPID:', (env.RPID ?? env.RPID), '; ORIGINPORT:', (env.ORIGINPORT ?? env.ORIGINPORT));

    try {
      const usersDir = path.resolve('users');
      const adminUserPath = path.join(usersDir, `${env.ADMINUSER}.json`);

      if (!existsSync(usersDir)) {
        await fs.mkdir(usersDir, { recursive: true });
      }

      if (!existsSync(adminUserPath)) {
        debugLog(`SveltePress: ADMINUSER environment variable found.`);
        debugLog(`SveltePress: Creating initial admin user file for '${env.ADMINUSER}'...`);

        const displayName = env.ADMIN_DISPLAY_NAME || env.ADMINUSER.split('@')[0];

        const initialAdmin = {
          username: env.ADMINUSER,
          displayName: displayName,
          credentials: [],
          acl: [
            {
              permission: 'W',
              path: 'src/',
            },
          ],
          verified: false,
        };

        await fs.writeFile(
          adminUserPath,
          JSON.stringify(initialAdmin, null, 2),
        );
        debugLog('SveltePress: Initial admin user file created successfully.');
        //return true;
      }
    } catch (e) {
      console.error('SveltePress: Error creating initial admin user file:', e);
      return false;
    }
  }

  // --- Existing Logic: Check for an unverified admin to kickstart the process ---
  if (!env.ORIGIN) {
    console.error(
      'SveltePress: ERROR - The ORIGIN environment variable is not set. Cannot send verification email.',
    );
    return false;
  }

  try {
    const { active, disabled } = await listUserFiles();

    if (active.length === 1 && disabled.length === 0) {
      const adminFilename = active[0];
      const adminUsername = adminFilename.replace('.json', '');
      const adminUser = await getUserByUsername(adminUsername);

      if (adminUser && !adminUser.verified) {
        debugLog(
          `SveltePress: Initial admin user '${adminUsername}' found and is not verified.`,
        );

        const token = crypto.randomBytes(32).toString('hex');
        adminUser.verificationToken = token;
        adminUser.tokenTimestamp = Date.now();
        await saveUser(adminUser);

        const verifyUrl = `${env.ORIGIN}/sveltepress/auth/verify-email?token=${token}`;
        await sendVerificationEmail(adminUser, verifyUrl);
        debugLog(
          `SveltePress: Sent initial verification email to ${adminUsername}.`,
        );
      }
    }
  } catch (e) {
    console.error('SveltePress: Error during initial admin check:', e);
    return false;
  }
  return true;
}

async function exclusiveInit() {
  // one-time initialization logic here
  return await _initializeSveltePress();
}

export async function initializeSveltePress() {
  if (!isInitialized) {
    if (!initPromise) {
      // First to arrive starts the init
      initPromise = (async () => {
        try {
          isInitialized = await exclusiveInit();
        } finally {
          //initPromise = null; // You can omit this if you don't want to allow re-init
        }
      })();
    }
    await initPromise;
  }
}

// Self-executing call
//initializeSveltePress();