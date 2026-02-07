import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { debugLog } from './debug';
import crypto from 'node:crypto';

export interface AclEntry {
  permission: 'R' | 'W' | 'D';
  path: string;
}

export interface DecryptedUserData {
  displayName: string;
  acl: AclEntry[];
}

export interface User {
  username: string;      // Email address
  id?: string;           // UUID to prevent authenticator collisions on re-registration
  displayName?: string;
  acl?: AclEntry[];
  credentials: any[];
  verified?: boolean;
  verificationToken?: string;
  tokenTimestamp?: number;
  tokenConsumedTimestamp?: number;
  registrationSessionToken?: string;
  registrationSessionTimestamp?: number;
  encryptedData?: string; // Base64 encoded string
  permissions?: {
    canEditHtml: boolean;
    canEditProps: boolean;
    canEditStyle: boolean;
    canEditSource: boolean;
  };

  // --- Zero-Knowledge Encrypted Data Blob (MEK-based) ---
  encryptedDataBlob?: string; // Base64 encoded encrypted data
  encryptedDataIV?: string; // Base64 encoded IV

  preferences?: {
    keepMenuActive?: boolean;
    keepSidebarActive?: boolean;
    // Add other UI prefs here in the future (e.g. theme: 'dark' | 'light')
  };
}

/**
 * Encodes a username (email) into a URL-safe Base64 string to be used
 * as a valid cookie name, preventing errors with special characters like '@'.
 * @param username The user's email address.
 * @returns A cookie-safe string.
 */
export function encodeUsernameForCookie(username: string): string {
  return Buffer.from(username).toString('base64url');
}

// --- CONSTANT: User Data Directory ---
const DATA_USERS_DIR = path.join(process.cwd(), 'data/users');

// (Internal getUserPath moved below to be exported)

export async function getUserByUsername(
  username: string,
): Promise<User | null> {
  const userPath = getUserPath(username);
  try {
    const userFile = await fs.readFile(userPath, 'utf-8');
    const user: User = JSON.parse(userFile);

    if (user.credentials) {
      user.credentials = user.credentials.map((cred) => ({
        ...cred,
        credentialID: isoBase64URL.toBuffer(cred.credentialID),
        credentialPublicKey: Uint8Array.from(
          Object.values(cred.credentialPublicKey),
        ),
      }));
    }

    return user;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    console.error(`Error reading or parsing user ${username}:`, error);
    return null;
  }
}

/**
 * Finds a user by their unique ID.
 * Warning: This iterates through all active user files, so it may be slow for large user bases.
 * @param id The UUID of the user.
 */
export async function getUserById(id: string): Promise<User | null> {
  const { active } = await listUserFiles();
  for (const username of active) {
    const user = await getUserByUsername(username);
    if (user && user.id === id) {
      return user;
    }
  }
  return null;
}

export async function saveUser(user: User): Promise<void> {
  const userPath = getUserPath(user.username);

  const userToSave = JSON.parse(JSON.stringify(user));

  if (userToSave.credentials && userToSave.credentials.length > 0) {
    userToSave.credentials = user.credentials.map((cred) => {
      // --- FIX: Only convert binary data, not strings ---
      const finalCredentialID =
        typeof cred.credentialID === 'string'
          ? cred.credentialID
          : isoBase64URL.fromBuffer(cred.credentialID);

      const finalPublicKey =
        cred.credentialPublicKey instanceof Array
          ? cred.credentialPublicKey
          : Array.from(cred.credentialPublicKey);

      return {
        ...cred,
        credentialID: finalCredentialID,
        credentialPublicKey: finalPublicKey,
      };
    });
  }

  //debugLog(`[saveUser] Saving user data to ${userPath}:`, userToSave);

  // Ensure directory exists
  await fs.mkdir(DATA_USERS_DIR, { recursive: true });

  // Use file lock to prevent concurrent writes to the same user file
  // and atomic write to prevent partial writes from corrupting the file
  const { writeFileAtomic, withFileLock } = await import('./file-utils');
  await withFileLock(`user:${user.username}`, async () => {
    await writeFileAtomic(userPath, JSON.stringify(userToSave, null, 2));
  });
}

// --- NEW: Helper functions to get paths (Internal but exported for admin actions) ---
export const getUserPath = (username: string) => path.join(DATA_USERS_DIR, `user-${username}.json`);
export const getUserKeysPath = (username: string) => path.join(DATA_USERS_DIR, `keys-${username}.json`);

// --- NEW: Helper function to list user files by status ---
/**
 * Scans the users directory and returns a list of active and disabled user files.
 * @returns An object with arrays of active and disabled usernames.
 */
export async function listUserFiles(): Promise<{
  active: string[];
  disabled: string[];
}> {
  try {
    if (!existsSync(DATA_USERS_DIR)) {
      return { active: [], disabled: [] };
    }
    const files = await fs.readdir(DATA_USERS_DIR);

    const activeFiles = files.filter(f => f.startsWith('user-') && f.endsWith('.json'));
    const disabledFiles = files.filter(f => f.startsWith('user-') && f.endsWith('.json.disabled'));

    const active = activeFiles.map(f => f.replace(/^user-/, '').replace(/\.json$/, ''));
    const disabled = disabledFiles.map(f => f.replace(/^user-/, '').replace(/\.json\.disabled$/, ''));

    return { active, disabled };
  } catch (error) {
    console.error('Error listing user files:', error);
    return { active: [], disabled: [] };
  }
}

export async function getAllUsers() {
  const { active, disabled } = await listUserFiles();
  const allUsers: (User & { status: string })[] = [];

  for (const username of active) {
    const user = await getUserByUsername(username);
    if (user) {
      allUsers.push({
        ...user,
        status: user.verified ? 'Verified' : 'Unverified',
      });
    }
  }

  for (const username of disabled) {
    try {
      const userPath = path.join(DATA_USERS_DIR, `user-${username}.json.disabled`);
      const userFile = await fs.readFile(userPath, 'utf-8');
      const user: User = JSON.parse(userFile);
      allUsers.push({ ...user, status: 'Disabled' });
    } catch (e) {
      console.error(`Could not read disabled user file for ${username}`, e);
    }
  }
  return allUsers;
}

export async function createUser(
  email: string,
  displayName: string,
): Promise<User> {
  const newUser: User = {
    username: email,
    id: crypto.randomUUID(), // Assign unique ID
    displayName,
    credentials: [],
    acl: [],
    verified: false,
  };
  await saveUser(newUser);
  return newUser;
}

// --- Session Management ---
const SESSIONS_FILE = path.join(DATA_USERS_DIR, '../sessions.json');

interface SessionData {
  username: string;
  expiresAt: number;
}

// In-memory cache for performance, but allows reload from disk
let sessionsCache: Map<string, SessionData> | null = null;

async function loadSessions(): Promise<Map<string, SessionData>> {
  if (sessionsCache) return sessionsCache;

  try {
    const data = await fs.readFile(SESSIONS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    sessionsCache = new Map(Object.entries(parsed));
  } catch (error) {
    sessionsCache = new Map();
  }
  return sessionsCache;
}

async function saveSessions(): Promise<void> {
  if (!sessionsCache) return;
  const obj = Object.fromEntries(sessionsCache);
  const { writeFileAtomic, withFileLock } = await import('./file-utils');

  await withFileLock('sessions', async () => {
    await writeFileAtomic(SESSIONS_FILE, JSON.stringify(obj, null, 2));
  });
}

/**
 * Removes expired sessions from the sessions file to prevent it from growing indefinitely.
 */
export async function cleanupSessions(): Promise<void> {
  const sessions = await loadSessions();
  const now = Date.now();
  let modified = false;

  for (const [sessionId, data] of sessions.entries()) {
    if (now > data.expiresAt) {
      sessions.delete(sessionId);
      modified = true;
    }
  }

  if (modified) {
    debugLog(`[cleanupSessions] Removed expired sessions. Remaining: ${sessions.size}`);
    await saveSessions();
  }
}

export async function createSession(username: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const sessions = await loadSessions();

  sessions.set(sessionId, {
    username,
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  });

  await saveSessions();
  return sessionId;
}

export async function getSession(sessionId: string): Promise<{ username: string } | undefined> {
  // Always ensure cache is loaded
  const sessions = await loadSessions();
  const session = sessions.get(sessionId);

  if (!session) return undefined;

  // Check expiration
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    saveSessions().catch(console.error); // Fire and forget cleanup
    return undefined;
  }

  return { username: session.username };
}

// --- Encrypted Data Blob Management ---

/**
 * Save encrypted data blob for a user.
 * 
 * @param username - The user's email/username
 * @param encryptedData - Base64 encoded encrypted data
 * @param iv - Base64 encoded IV
 */
export async function saveEncryptedData(
  username: string,
  encryptedData: string,
  iv: string
): Promise<void> {
  const user = await getUserByUsername(username);
  if (!user) throw new Error('User not found');

  user.encryptedDataBlob = encryptedData;
  user.encryptedDataIV = iv;

  await saveUser(user);
}


/**
 * Get encrypted data blob for a user.
 * 
 * @param username - The user's email/username
 * @returns Object with encrypted data and IV, or null if not found
 */
export async function getEncryptedData(
  username: string
): Promise<{ encryptedData: string; iv: string } | null> {
  const user = await getUserByUsername(username);
  if (!user || !user.encryptedDataBlob || !user.encryptedDataIV) {
    return null;
  }

  return {
    encryptedData: user.encryptedDataBlob,
    iv: user.encryptedDataIV,
  };
}

/**
 * Checks if a user has a recovery password wrapper.
 */
export async function hasRecoveryPassword(username: string): Promise<boolean> {
  const { getKeyWrappers } = await import('./key-wrappers');
  const wrappers = await getKeyWrappers(username);
  return wrappers.some((w) => w.type === 'RECOVERY_PASSWORD');
}

