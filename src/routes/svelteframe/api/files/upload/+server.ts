import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';
import { hasPermission } from '$routes/svelteframe/lib/client/access';
import { debugWarn } from '$routes/svelteframe/lib/server/debug';

export const POST: RequestHandler = async ({ request, locals }) => {
    const { user } = locals;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const targetDir = formData.get('targetDir') as string;

    if (!targetDir) {
        return json({ error: 'Target directory is required.' }, { status: 400 });
    }

    // Permission check
    // The user must have Write permission to the specific directory.
    let checkPath = targetDir;
    if (!checkPath.endsWith('/')) checkPath += '/';

    const canUpload = hasPermission(user, checkPath, 'W');

    if (!user || !canUpload) {
        debugWarn('Unauthorized upload attempt by user:', user?.username, 'to', checkPath);
        return json({ error: 'You do not have permission to upload to this directory.' }, { status: 403 });
    }

    if (!file || file.size === 0) {
        return json({ error: 'Please select a file to upload.' }, { status: 400 });
    }

    try {
        // Resolve absolute path relative to project root
        // If targetDir starts with /, strip it to ensure it's relative
        const relativeTarget = targetDir.replace(/^\//, '');
        const absoluteDir = path.resolve(process.cwd(), relativeTarget);

        console.log(`[Upload API] Target Dir: ${targetDir}`);
        console.log(`[Upload API] Process CWD: ${process.cwd()}`);
        console.log(`[Upload API] Resolving to: ${absoluteDir}`);

        await fs.mkdir(absoluteDir, { recursive: true });

        const sanitizedFilename = path.basename(file.name);
        const destinationPath = path.join(absoluteDir, sanitizedFilename);
        const buffer = Buffer.from(await file.arrayBuffer());

        console.log(`[Upload API] Writing file to: ${destinationPath}`);

        // Use atomic write to prevent corruption during upload
        const { writeFileAtomic } = await import('$routes/svelteframe/lib/server/file-utils');
        await writeFileAtomic(destinationPath, buffer);

        console.log(`[Upload API] Write complete.`);

        return json({ success: true, message: `'${file.name}' uploaded successfully.` });

    } catch (e: any) {
        console.error('File upload failed:', e);
        return json({ error: `Could not save file: ${e.message}` }, { status: 500 });
    }
};
