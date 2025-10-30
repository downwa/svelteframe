// FILE: src/routes/sveltepress/lib/server/auth.ts
import { promises as fs } from 'fs';
import path from 'path';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { debugLog } from './debug';

export interface AclEntry {
  permission: 'R' | 'W' | 'D';
  path: string;
}

export interface User {
  username: string; // This should be the user's email address
  displayName: string;
  credentials: any[];
  acl: AclEntry[];
  verified?: boolean;
  verificationToken?: string;
  tokenTimestamp?: number;
  // --- NEW: Fields for the secure registration session ---
  registrationSessionToken?: string;
  registrationSessionTimestamp?: number;  
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

export async function getUserByUsername(
  username: string,
): Promise<User | null> {
  const usersDir = path.resolve('users');
  const userPath = path.join(usersDir, `${username}.json`);
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

export async function saveUser(user: User): Promise<void> {
  const usersDir = path.resolve('users');
  const userPath = path.join(usersDir, `${user.username}.json`);

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

  debugLog(`[saveUser] Saving user data to ${userPath}:`, userToSave);

  await fs.writeFile(userPath, JSON.stringify(userToSave, null, 2));
}

// --- NEW: Helper function to list user files by status ---
/**
 * Scans the users directory and returns a list of active and disabled user files.
 * @returns An object with arrays of active and disabled filenames.
 */
export async function listUserFiles(): Promise<{ active: string[]; disabled: string[] }> {
  const usersDir = path.resolve('users');
  try {
    const dirents = await fs.readdir(usersDir, { withFileTypes: true });
    const active: string[] = [];
    const disabled: string[] = [];
    for (const dirent of dirents) {
      if (dirent.isFile()) {
        if (dirent.name.endsWith('.json')) {
          active.push(dirent.name);
        } else if (dirent.name.endsWith('.json.disabled')) {
          disabled.push(dirent.name);
        }
      }
    }
    return { active, disabled };
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      // The users directory doesn't exist, which is fine on first run.
      return { active: [], disabled: [] };
    }
    throw e; // Re-throw other errors
  }
}

export async function getAllUsers() {
  const { active, disabled } = await listUserFiles();
  const allUsers: (User & { status: string })[] = [];

  for (const file of active) {
    const username = file.replace('.json', '');
    const user = await getUserByUsername(username);
    if (user) {
      allUsers.push({
        ...user,
        status: user.verified ? 'Verified' : 'Unverified',
      });
    }
  }

  const usersDir = path.resolve('users');
  for (const file of disabled) {
    const username = file.replace('.json.disabled', '');
    try {
      const userPath = path.join(usersDir, file);
      const userFile = await fs.readFile(userPath, 'utf-8');
      const user: User = JSON.parse(userFile);
      allUsers.push({ ...user, status: 'Disabled' });
    } catch (e) {
      console.error(`Could not read disabled user file ${file}`, e);
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
    displayName,
    credentials: [],
    acl: [],
    verified: false,
  };
  await saveUser(newUser);
  return newUser;
}

// --- Session Management ---
const sessions = new Map<string, { username: string }>();

export function createSession(username: string): string {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { username });
  return sessionId;
}

export function getSession(sessionId: string): { username: string } | undefined {
  return sessions.get(sessionId);
}