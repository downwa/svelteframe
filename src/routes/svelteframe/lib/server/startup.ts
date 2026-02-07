// FILE: src/routes/svelteframe/lib/server/startup.ts
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import {
  listUserFiles,
  getUserByUsername,
  saveUser,
  createUser,
  cleanupSessions
} from '$routes/svelteframe/lib/server/auth';
import { cleanupExpiredTokens } from '$routes/svelteframe/lib/server/device-tokens';
import { sendVerificationEmail } from '$routes/svelteframe/lib/server/nodemailer-email';
// --- FIX: Import MODE for logging and debugLog ---
import { env } from '$env/dynamic/private';
import { debugLog } from '$routes/svelteframe/lib/server/debug';
import crypto from 'node:crypto';

let initPromise: Promise<void> | null = null;
let isInitialized = false;


/**
 * This function runs once on server startup. It handles the initial setup
 * of SvelteFrame, ensuring an admin user exists with proper permissions
 * and providing a verification link via console for Docker environments.
 */
async function _initializeSvelteFrame(): Promise<boolean> {
  debugLog('SvelteFrame: Attempting Initialization...');

  const adminUsername = env.ADMINUSER || 'admin';
  debugLog('Server starting in mode:', process.env.NODE_ENV ?? import.meta.env.MODE, '; Target Admin:', adminUsername);
  debugLog('Using origin:', env.ORIGIN, '; RPID:', (env.RPID ?? env.RPID), '; ORIGINPORT:', (env.ORIGINPORT ?? env.ORIGINPORT));

  try {
    let user = await getUserByUsername(adminUsername);
    let isNewOrModified = false;

    // 1. Create user if missing
    if (!user) {
      debugLog(`SvelteFrame: Admin user '${adminUsername}' not found. Creating...`);
      // Use part before @ as display name, or the whole string
      const displayName = env.ADMIN_DISPLAY_NAME || adminUsername.split('@')[0] || adminUsername;
      user = await createUser(adminUsername, displayName);
      isNewOrModified = true;
    }

    // 2. Ensure Admin Privileges (Write access to src/)
    if (!user.acl) user.acl = [];
    const hasSrcAccess = user.acl.some((entry) => entry.path === 'src/' && entry.permission === 'W');

    if (!hasSrcAccess) {
      debugLog(`SvelteFrame: Granting 'src/' write access to admin user '${adminUsername}'.`);
      user.acl.push({ permission: 'W', path: 'src/' });
      isNewOrModified = true;
    }

    // Save if we modified ACL or just created it (createUser saves, but we might have added ACL)
    // Actually createUser saves with empty ACL. So we MUST save again if we added ACL.
    if (isNewOrModified) {
      await saveUser(user);
      debugLog(`SvelteFrame: Saved updates for admin user '${adminUsername}'.`);
    }

    // 3. Verification (The Docker User Experience)
    if (!user.verified) {
      debugLog(`SvelteFrame: Admin user '${adminUsername}' is unverified.`);

      const token = crypto.randomBytes(32).toString('hex');
      user.verificationToken = token;
      user.tokenTimestamp = Date.now();
      await saveUser(user);

      // Construct URL. Default to localhost if ORIGIN is missing (dev mode fallback)
      const baseUrl = env.ORIGIN || 'http://localhost:3000';
      const verifyUrl = `${baseUrl}/svelteframe/auth/verify-email?token=${token}`;

      // --- CRITICAL: Log URL to Console for Docker/Manual Setup ---
      console.log('\n================================================================');
      console.log(' svelteframe ADMIN SETUP REQUIRED');
      console.log('================================================================');
      console.log(` Admin User:  '${adminUsername}'`);
      console.log(' Status:      Unverified');
      console.log(' Action:      To verify this account and create your passkey,');
      console.log('              please access the following URL:');
      console.log('');
      console.log(` ${verifyUrl}`);
      console.log('');
      console.log('================================================================\n');

      // Also attempt to send email if configured, but don't fail init if it fails
      if (env.ORIGIN) {
        try {
          await sendVerificationEmail(user, verifyUrl);
          debugLog(`SvelteFrame: Verification email sent to ${adminUsername}.`);
        } catch (emailErr) {
          console.error('SvelteFrame: Failed to send verification email (check console logs for URL instead):', emailErr);
        }
      }
    } else {
      debugLog(`SvelteFrame: Admin user '${adminUsername}' is already verified.`);
    }

    return true;

  } catch (e) {
    console.error('SvelteFrame: Critical Error during initialization:', e);
    return false;
  }
}

async function exclusiveInit() {
  // 4. Initial cleanup of stale data
  debugLog('SvelteFrame: Running initial cleanup of expired sessions and tokens...');
  cleanupSessions().catch(console.error);
  cleanupExpiredTokens().catch(console.error);

  // 5. Schedule periodic cleanup (every 1 hour)
  setInterval(() => {
    debugLog('SvelteFrame: Running periodic cleanup of expired sessions and tokens...');
    cleanupSessions().catch(console.error);
    cleanupExpiredTokens().catch(console.error);
  }, 1000 * 60 * 60);

  // one-time initialization logic here
  return await _initializeSvelteFrame();
}

export async function initializeSvelteFrame() {
  if (!isInitialized) {
    debugLog('SvelteFrame: Attempting Initialization...', { isInitialized });
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
initializeSvelteFrame();
