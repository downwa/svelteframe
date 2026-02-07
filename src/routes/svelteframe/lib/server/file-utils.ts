// FILE: src/routes/svelteframe/lib/server/file-utils.ts

import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';

/**
 * Generates a local timestamp string in YYYY-MM-DD_HH-mm-ss format.
 */
export function getLocalTimestamp(date: Date = new Date()): string {
    const pad = (num: number) => num.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Creates a backup of a file using the naming convention:
 * backup-YYYY-MM-DD_HH-mm-ss_<filename>
 * 
 * @param filePath - The absolute path to the file to backup
 */
export async function createBackup(filePath: string): Promise<string | null> {
    try {
        const dir = path.dirname(filePath);
        const fileName = path.basename(filePath);
        const timestamp = getLocalTimestamp();
        const backupFileName = `backup-${timestamp}_${fileName}`;
        const backupPath = path.join(dir, backupFileName);

        const content = await fs.readFile(filePath, 'utf-8');
        await fs.writeFile(backupPath, content, 'utf-8');

        return backupPath;
    } catch (error: any) {
        if (error.code !== 'ENOENT') {
            console.warn(`Failed to create backup for ${filePath}:`, error);
        }
        return null;
    }
}


/**
 * Atomically write data to a file using temp file + rename pattern.
 * This prevents partial writes from corrupting the file.
 * 
 * The rename operation is atomic on most filesystems, meaning the file
 * will either be fully written or not written at all - no partial writes.
 * 
 * @param filePath - The target file path
 * @param data - The data to write (string or Buffer)
 * @param encoding - The encoding to use (default: 'utf-8')
 */
export async function writeFileAtomic(
    filePath: string,
    data: string | Buffer,
    encoding: BufferEncoding = 'utf-8'
): Promise<void> {
    const tempPath = `${filePath}.tmp`;

    try {
        // Write to temp file
        if (typeof data === 'string') {
            await fs.writeFile(tempPath, data, encoding);
        } else {
            await fs.writeFile(tempPath, data);
        }

        // Atomic rename (this is the key operation)
        // On most filesystems, this is guaranteed to be atomic
        await fs.rename(tempPath, filePath);
    } catch (error) {
        // Clean up temp file if it exists
        try {
            await fs.unlink(tempPath);
        } catch {
            // Ignore cleanup errors - temp file might not exist
        }
        throw error;
    }
}

/**
 * Synchronous version of writeFileAtomic for cases where async is not possible.
 * 
 * @param filePath - The target file path
 * @param data - The data to write (string or Buffer)
 * @param encoding - The encoding to use (default: 'utf-8')
 */
export function writeFileAtomicSync(
    filePath: string,
    data: string | Buffer,
    encoding: BufferEncoding = 'utf-8'
): void {
    const tempPath = `${filePath}.tmp`;

    try {
        if (typeof data === 'string') {
            fsSync.writeFileSync(tempPath, data, encoding);
        } else {
            fsSync.writeFileSync(tempPath, data);
        }

        fsSync.renameSync(tempPath, filePath);
    } catch (error) {
        try {
            fsSync.unlinkSync(tempPath);
        } catch {
            // Ignore cleanup errors
        }
        throw error;
    }
}

/**
 * In-memory lock for preventing concurrent writes to the same file.
 * Only needed for single-server deployments.
 * 
 * This prevents race conditions where two operations try to write to
 * the same file simultaneously.
 */
const fileLocks = new Map<string, Promise<void>>();

/**
 * Execute a function with an exclusive lock on a given key.
 * 
 * This ensures that only one operation can execute at a time for a given key.
 * Useful for preventing concurrent writes to the same file.
 * 
 * @param key - A unique key to lock on (e.g., "user:email@example.com")
 * @param fn - The function to execute while holding the lock
 * @returns The result of the function
 * 
 * @example
 * await withFileLock('user:john@example.com', async () => {
 *   await writeFileAtomic('data/users/john@example.com.json', data);
 * });
 */
export async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Wait for any existing lock on this key
    while (fileLocks.has(key)) {
        await fileLocks.get(key);
    }

    // Create new lock
    let resolve: () => void;
    const lock = new Promise<void>((r) => (resolve = r));
    fileLocks.set(key, lock);

    try {
        return await fn();
    } finally {
        fileLocks.delete(key);
        resolve!();
    }
}
