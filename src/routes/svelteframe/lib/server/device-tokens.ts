// FILE: src/routes/svelteframe/lib/server/device-tokens.ts

import { promises as fs } from 'fs';
import path from 'path';
import { writeFileAtomic } from './file-utils';

const DEVICE_TOKENS_DIR = path.join(process.cwd(), 'data/device-tokens');

export interface DeviceToken {
    id: string; // UUID (same as filename)
    userId: string; // User ID this token belongs to
    token: string; // The token itself (for validation)
    wrappedMEK?: string; // Base64 encoded MEK wrapped with session key
    status: 'pending' | 'consumed' | 'expired';
    expiresAt: string; // ISO timestamp
    createdAt: string; // ISO timestamp
}

/**
 * Create a new device migration token.
 * 
 * @param token - The device token to create
 */
export async function createDeviceToken(token: DeviceToken): Promise<void> {
    await fs.mkdir(DEVICE_TOKENS_DIR, { recursive: true });

    const tokenPath = path.join(DEVICE_TOKENS_DIR, `${token.id}.json`);
    await writeFileAtomic(tokenPath, JSON.stringify(token, null, 2));
}

/**
 * Get a device token by ID.
 * 
 * @param tokenId - The token ID to retrieve
 * @returns The device token, or null if not found
 */
export async function getDeviceToken(tokenId: string): Promise<DeviceToken | null> {
    const cleanTokenId = tokenId.trim();
    const tokenPath = path.join(DEVICE_TOKENS_DIR, `${cleanTokenId}.json`);

    try {
        const data = await fs.readFile(tokenPath, 'utf-8');
        return JSON.parse(data);
    } catch (error: any) {
        if (error.code === 'ENOENT') return null;
        console.error(`[getDeviceToken] Error reading token ${cleanTokenId}:`, error);
        throw error;
    }
}

/**
 * Update the status of a device token.
 * 
 * @param tokenId - The token ID to update
 * @param status - The new status
 */
export async function updateDeviceTokenStatus(
    tokenId: string,
    status: 'consumed' | 'expired'
): Promise<void> {
    const tokenPath = path.join(DEVICE_TOKENS_DIR, `${tokenId}.json`);

    const data = await fs.readFile(tokenPath, 'utf-8');
    const token: DeviceToken = JSON.parse(data);
    token.status = status;

    await writeFileAtomic(tokenPath, JSON.stringify(token, null, 2));
}

/**
 * Clean up expired device tokens.
 * This should be called periodically (e.g., via a cron job or on server startup).
 */
export async function cleanupExpiredTokens(): Promise<void> {
    try {
        const files = await fs.readdir(DEVICE_TOKENS_DIR);
        const now = new Date();

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const tokenPath = path.join(DEVICE_TOKENS_DIR, file);
            try {
                const data = await fs.readFile(tokenPath, 'utf-8');
                const token: DeviceToken = JSON.parse(data);

                if (new Date(token.expiresAt) < now) {
                    await fs.unlink(tokenPath);
                }
            } catch (e) {
                // Skip files that can't be read or parsed
                console.error(`Error processing token file ${file}:`, e);
            }
        }
    } catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
        // Directory doesn't exist yet, which is fine
    }
}
