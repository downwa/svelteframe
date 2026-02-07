import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types';
import { createBackup, writeFileAtomic } from '$routes/svelteframe/lib/server/file-utils';

export const POST: RequestHandler = async ({ request }: any) => {
    try {
        const { filePath, start, end, newContent, outputSuffix = '', fullReplace = false } = await request.json();

        if (!filePath || newContent === undefined) {
            return json({ success: false, error: 'Missing parameters' }, { status: 400 });
        }

        if (!fullReplace && (start === undefined || end === undefined)) {
            return json({ success: false, error: 'Missing range for partial patch' }, { status: 400 });
        }

        const absolutePath = join(process.cwd(), filePath);

        // 1. Read Original (needed for partial patch or size validation)
        const originalContent = await readFile(absolutePath, 'utf-8');

        if (!fullReplace && (start < 0 || end > originalContent.length || start > end)) {
            return json({ success: false, error: 'Invalid range' }, { status: 400 });
        }

        console.log(`[PATCH] ${fullReplace ? 'Full Replace' : 'Partial Patch'} File:`, filePath);

        // 2. Create Backup (if overwriting actual file)
        if (!outputSuffix) {
            const backupPath = await createBackup(absolutePath);
            if (backupPath) {
                console.log(`[PATCH] Backup created: ${backupPath}`);
            }
        }

        // 3. Determine Content
        const patchedContent = fullReplace ? newContent : originalContent.slice(0, start) + newContent + originalContent.slice(end);

        // 4. Determine Output Path
        const outputPath = outputSuffix ? absolutePath + outputSuffix : absolutePath;

        // 5. Atomic Write
        await writeFileAtomic(outputPath, patchedContent);

        return json({
            success: true,
            outputPath: outputPath.substring(process.cwd().length + 1).replace(/\\/g, '/')
        });
    } catch (e: any) {
        console.error('Error patching component:', e);
        return json({ success: false, error: e.message }, { status: 500 });
    }
};

