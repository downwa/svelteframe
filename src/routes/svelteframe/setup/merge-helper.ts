import fs from 'fs';
import path from 'path';

export interface MergeResult {
    file: string;
    status: 'new' | 'merged' | 'conflict' | 'skipped';
    diff?: string;
}

export async function mergeFile(src: string, dest: string, fileName: string): Promise<MergeResult> {
    const destPath = path.join(dest, fileName);

    if (!fs.existsSync(destPath)) {
        // Simple copy if doesn't exist
        return { file: fileName, status: 'new' };
    }

    const srcContent = fs.readFileSync(src, 'utf-8');
    const destContent = fs.readFileSync(destPath, 'utf-8');

    if (srcContent === destContent) {
        return { file: fileName, status: 'skipped' };
    }

    if (fileName === 'package.json') {
        const srcPkg = JSON.parse(srcContent);
        const destPkg = JSON.parse(destContent);

        // Merge dependencies
        destPkg.dependencies = { ...destPkg.dependencies, ...srcPkg.dependencies };
        destPkg.devDependencies = { ...destPkg.devDependencies, ...srcPkg.devDependencies };

        return {
            file: fileName,
            status: 'merged',
            diff: JSON.stringify(destPkg, null, 2)
        };
    }

    if (fileName === 'hooks.server.ts') {
        // Heuristic: Check if AuthHelper is already there
        if (destContent.includes('AuthHelper')) {
            return { file: fileName, status: 'skipped' };
        }

        // Very basic merge: prepend import and wrap handle
        // In real world, this needs better parsing
        let newContent = `import { handleAuth } from './routes/svelteframe/lib/AuthHelper';\n` + destContent;
        if (newContent.includes('export const handle')) {
            newContent = newContent.replace('export const handle', 'const originalHandle');
            newContent += `\nexport const handle = handleAuth(originalHandle);\n`;
        } else {
            newContent += `\nexport const handle = handleAuth();\n`;
        }

        return { file: fileName, status: 'merged', diff: newContent };
    }

    // For other files, if they exist and are different, mark as conflict for manual review
    return { file: fileName, status: 'conflict' };
}
