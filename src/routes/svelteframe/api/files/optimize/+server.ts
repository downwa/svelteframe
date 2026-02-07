import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
import type { RequestHandler } from './$types';
import { hasPermission } from '$routes/svelteframe/lib/client/access';
import { writeFileAtomic } from '$routes/svelteframe/lib/server/file-utils';

const MAX_WIDTH = 1600; // Reasonable default for web resolution
const QUALITY = 80;

export const POST: RequestHandler = async ({ request, locals }) => {
    const { user } = locals;
    const { filePath } = await request.json();

    if (!filePath) {
        return json({ error: 'File path is required.' }, { status: 400 });
    }

    // 1. Resolve path securely (relative to cwd)
    // filePath comes from the frontend, e.g. "static/images/foo.png"
    // Ensure it doesn't try to escape project root
    const relativePath = filePath.replace(/^\//, '').replace(/^\\/, '');
    const absolutePath = path.resolve(process.cwd(), relativePath);

    if (!absolutePath.startsWith(process.cwd())) {
        return json({ error: 'Invalid file path.' }, { status: 403 });
    }

    // 2. Permission Check
    // Access check should use the relative path logic expected by ACLs
    // which usually expects paths starting with src/routes or static... 
    // We'll normalize to ensure it matches the upload logic.
    const checkPath = relativePath.startsWith('static/') ? relativePath : `static/${relativePath}`;
    // We need Write permission to the folder containing the file
    const dirCheckPath = path.dirname(checkPath) + '/';

    const canWrite = hasPermission(user, dirCheckPath, 'W');
    if (!user || !canWrite) {
        return json({ error: 'Permission denied.' }, { status: 403 });
    }

    try {
        // 3. Process Image
        const image = sharp(absolutePath);
        const metadata = await image.metadata();

        if (!metadata.width) {
            return json({ error: 'Could not read image metadata.' }, { status: 500 });
        }

        const results: string[] = [];
        const widths = [1600, 1000, 800, 500];
        const dir = path.dirname(absolutePath);
        const ext = path.extname(absolutePath);
        const name = path.basename(absolutePath, ext); // "Inez-Webb"

        for (const width of widths) {

            // Validate resize (dont verify here, just use withoutEnlargement in sharp)
            const resizeOptions = {
                width: width,
                withoutEnlargement: true
            };

            // Generate WebP
            // e.g. Inez-Webb-p-800.webp
            const webpFilename = `${name}-p-${width}.webp`;
            const webpPath = path.join(dir, webpFilename);

            const webpBuffer = await image
                .clone()
                .resize(resizeOptions)
                .webp({ quality: QUALITY })
                .toBuffer();

            await writeFileAtomic(webpPath, webpBuffer);
            results.push(webpFilename);

            // Generate JPG
            // e.g. Inez-Webb-p-800.jpg
            const jpgFilename = `${name}-p-${width}.jpg`;
            const jpgPath = path.join(dir, jpgFilename);

            const jpgBuffer = await image
                .clone()
                .resize(resizeOptions)
                .jpeg({ quality: QUALITY, mozjpeg: true })
                .toBuffer();

            await writeFileAtomic(jpgPath, jpgBuffer);
            results.push(jpgFilename);
        }

        return json({
            success: true,
            message: `Created optimized versions: ${results.join(', ')}`,
            files: results
        });

    } catch (e: any) {
        console.error('Image optimization failed:', e);
        return json({ error: `Optimization failed: ${e.message}` }, { status: 500 });
    }
};
