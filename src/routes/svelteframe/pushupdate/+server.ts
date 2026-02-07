// src/routes/svelteframe/pushupdate/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os'; // Import os to resolve home directory

/**
 * Recursively copies a directory using fs/promises
 */
async function copyDir(src: string, dest: string) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

export const POST: RequestHandler = async ({ request, locals }) => {
    // 1. Verify specific virtual SuperAdmin permission
    const { hasPermission } = await import('$routes/svelteframe/lib/client/access');
    if (!locals.user || !hasPermission(locals.user, 'virtual:superadmin', 'W')) {
        return json({ message: 'Unauthorized: Requires virtual:superadmin access' }, { status: 403 });
    }

    const data = await request.formData();
    let targetPath = data.get('targetPath')?.toString();
    const cleanRepo = data.get('cleanRepo') === 'true';

    if (!targetPath) {
        return json({ message: 'Target path is required.' }, { status: 400 });
    }

    // --- NEW: Resolve Path segments like ~ or relative paths ---
    if (targetPath.startsWith('~')) {
        targetPath = path.join(os.homedir(), targetPath.slice(1));
    }

    // Convert to absolute path based on project root if not already absolute
    const absoluteTarget = path.isAbsolute(targetPath)
        ? targetPath
        : path.resolve(process.cwd(), targetPath);

    // Final validation check
    if (!absoluteTarget || absoluteTarget === '/') {
        return json({ message: 'A valid specific absolute target path is required.' }, { status: 400 });
    }

    try {
        // 2. Safety Verification
        // IMPORTANT: Use absoluteTarget from here on, NOT targetPath
        if (existsSync(absoluteTarget) && !cleanRepo) {
            const files = await fs.readdir(absoluteTarget);
            if (files.length > 0) {
                const hasSF = existsSync(path.join(absoluteTarget, 'src/routes/svelteframe'));
                const mainPagePath = path.join(absoluteTarget, 'src/routes/+page.svelte');
                let looksLikeSF = hasSF;

                if (existsSync(mainPagePath)) {
                    const content = await fs.readFile(mainPagePath, 'utf-8');
                    if (!content.includes('/svelteframe/setup')) looksLikeSF = false;
                }

                if (!looksLikeSF) {
                    return json({
                        needsConfirmation: true,
                        message: 'Target directory is not empty and does not appear to be SvelteFrame. Wipe anyway?'
                    });
                } else {
                    return json({
                        needsConfirmation: true,
                        message: 'Existing SvelteFrame standalone repo detected. Wipe and update?'
                    });
                }
            }
        }

        // 3. Execution - Clean target (preserving .git)
        if (existsSync(absoluteTarget) && cleanRepo) {
            const entries = await fs.readdir(absoluteTarget);
            for (const entry of entries) {
                // Protect Git history and environment config of the target
                if (entry === '.git' || entry === '.gitignore' || entry === '.env') continue;
                await fs.rm(path.join(absoluteTarget, entry), { recursive: true, force: true });
            }
        }

        // 4. Copy Core Framework Files
        // Note: src/lib/portal-actions is intentionally excluded as it is user-land data
        await copyDir('src/routes/svelteframe', path.join(absoluteTarget, 'src/routes/svelteframe'));

        // 5. Copy specific source tree components
        const srcTreeFiles = ['hooks.server.ts', 'app.d.ts', 'app.html'];
        for (const file of srcTreeFiles) {
            const p = path.join('src', file);
            if (existsSync(p)) {
                const destFile = path.join(absoluteTarget, 'src', file);
                await fs.mkdir(path.dirname(destFile), { recursive: true });
                await fs.copyFile(p, destFile);
            }
        }

        // 6. Copy root configuration files
        const rootConfigs = [
            'Dockerfile', 'Makefile', 'README.md', 'bun.lock', 'eslint.config.js',
            'package.json', 'playwright.config.ts', 'postcss.config.js',
            'svelte.config.js', 'tailwind.config.js', 'tsconfig.json', 'vite.config.ts'
        ];

        for (const file of rootConfigs) {
            if (existsSync(file)) {
                const destFile = path.join(absoluteTarget, file);
                if (file === 'package.json') {
                    const pkg = JSON.parse(await fs.readFile(file, 'utf-8'));
                    pkg.name = 'svelteframe';
                    await fs.writeFile(destFile, JSON.stringify(pkg, null, 2));
                } else {
                    await fs.copyFile(file, destFile);
                }
            }
        }

        // 7. Create/Verify Redirect Page
        const routesDir = path.join(absoluteTarget, 'src/routes');
        await fs.mkdir(routesDir, { recursive: true });
        await fs.writeFile(path.join(routesDir, '+page.svelte'),
            `<script lang="ts">\n  import { onMount } from 'svelte';\n  onMount(() => window.location.href = '/svelteframe/setup');\n</script>\n\n<p>Redirecting to SvelteFrame Setup...</p>`
        );

        return json({ success: true, message: 'Successfully updated standalone repository.' });

    } catch (err: any) {
        console.error('[PushUpdate] Error:', err);
        return json({ message: err.message }, { status: 500 });
    }
};