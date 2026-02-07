// FILE: src/routes/svelteframe/lib/server/key-wrappers.ts

import { promises as fs } from 'fs';
import path from 'path';
import { writeFileAtomic, withFileLock } from './file-utils';

const DATA_USERS_DIR = path.join(process.cwd(), 'data/users');
// Helper to get key wrappers path
const getKeyWrappersPath = (username: string) => path.join(DATA_USERS_DIR, `keys-${username}.json`);

export interface KeyWrapper {
    id: string;
    type: 'PRF' | 'RECOVERY_PASSWORD' | 'BACKUP';
    wrappedKeyBytes: string; // Base64 encoded
    salt?: string; // Base64 encoded, for RECOVERY_PASSWORD type
    credentialId?: string; // For PRF type - which credential this is tied to
    createdAt: string; // ISO timestamp
    lastUsedAt: string; // ISO timestamp
}

interface KeyWrappersFile {
    userId: string; // User ID for validation
    wrappers: KeyWrapper[];
}

/**
 * Get all key wrappers for a user.
 * 
 * @param username - The user's email/username
 * @returns Array of key wrappers (empty if file doesn't exist)
 */
export async function getKeyWrappers(username: string): Promise<KeyWrapper[]> {
    const keysPath = getKeyWrappersPath(username);
    console.log(`[KeyWrappers] Getting wrappers for ${username} from ${keysPath}`);
    try {
        const data = await fs.readFile(keysPath, 'utf-8');
        const file: KeyWrappersFile = JSON.parse(data);
        return file.wrappers;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log(`[KeyWrappers] File not found: ${keysPath}`);
            return [];
        }
        console.error(`[KeyWrappers] Error reading file ${keysPath}:`, error);
        throw error;
    }
}

/**
 * Save a new key wrapper for a user.
 * 
 * @param username - The user's email/username
 * @param userId - The user's ID (for validation)
 * @param wrapper - The key wrapper to save
 */
export async function saveKeyWrapper(
    username: string,
    userId: string,
    wrapper: KeyWrapper
): Promise<void> {
    const keysPath = getKeyWrappersPath(username);

    await withFileLock(`keys:${username}`, async () => {
        const wrappers = await getKeyWrappers(username);
        wrappers.push(wrapper);

        const file: KeyWrappersFile = { userId, wrappers };

        await writeFileAtomic(keysPath, JSON.stringify(file, null, 2));
    });
}

/**
 * Delete a key wrapper by ID.
 * 
 * @param username - The user's email/username
 * @param wrapperId - The ID of the wrapper to delete
 */
export async function deleteKeyWrapper(username: string, wrapperId: string): Promise<void> {
    const keysPath = getKeyWrappersPath(username);

    await withFileLock(`keys:${username}`, async () => {
        const data = await fs.readFile(keysPath, 'utf-8');
        const file: KeyWrappersFile = JSON.parse(data);

        file.wrappers = file.wrappers.filter((w) => w.id !== wrapperId);

        await writeFileAtomic(keysPath, JSON.stringify(file, null, 2));
    });
}

/**
 * Update the lastUsedAt timestamp for a key wrapper.
 * 
 * @param username - The user's email/username
 * @param wrapperId - The ID of the wrapper to update
 */
export async function updateKeyWrapperLastUsed(
    username: string,
    wrapperId: string
): Promise<void> {
    const keysPath = getKeyWrappersPath(username);

    await withFileLock(`keys:${username}`, async () => {
        const data = await fs.readFile(keysPath, 'utf-8');
        const file: KeyWrappersFile = JSON.parse(data);

        const wrapper = file.wrappers.find((w) => w.id === wrapperId);
        if (wrapper) {
            wrapper.lastUsedAt = new Date().toISOString();
        }

        await writeFileAtomic(keysPath, JSON.stringify(file, null, 2));
    });
}

/**
 * Get a specific key wrapper by credential ID (for PRF wrappers).
 * 
 * @param username - The user's email/username
 * @param credentialId - The credential ID to search for
 * @returns The key wrapper, or null if not found
 */
export async function getKeyWrapperByCredentialId(
    username: string,
    credentialId: string
): Promise<KeyWrapper | null> {
    const wrappers = await getKeyWrappers(username);
    return wrappers.find((w) => w.type === 'PRF' && w.credentialId === credentialId) || null;
}
