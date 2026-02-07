import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';
import { type UIMessage, type ModelMessage } from 'ai';

export type FlexibleMessage = UIMessage | ModelMessage;

/**
 * Ensures that assistant messages use 'content: string' instead of 'parts: array',
 * which is required by some models/providers to avoid validation errors.
 */
export function ensureFlexibleMessages(messages: any[]): FlexibleMessage[] {
    return messages.map(m => {
        if (m.role === 'assistant') {
            let textContent = '';
            if (typeof m.content === 'string') {
                textContent = m.content;
            } else if (Array.isArray(m.parts)) {
                textContent = m.parts.map((p: any) => p.text || '').join('\n');
            } else if (Array.isArray(m.content)) {
                textContent = m.content.map((c: any) => {
                    if (typeof c === 'string') return c;
                    if (c && typeof c === 'object' && 'text' in c) return (c as any).text;
                    return '';
                }).join('\n');
            }

            return {
                id: m.id || Math.random().toString(36).substring(7),
                role: 'assistant',
                content: textContent || '',
                // We deliberately omit 'parts' for assistant to satisfy model requirements
            } as any;
        }
        return m;
    });
}

export async function getImportedFiles(entry: string) {
    const projectRoot = process.cwd();
    const visited = new Set<string>();

    // Ensure entry is treated as a file path relative to project root.
    // If it's a SvelteKit route (starts with /), map it to src/routes/.../+page.svelte
    let startPath = entry;
    if (startPath.startsWith('/')) {
        // Strip leading slash and join with src/routes
        const routePath = startPath.slice(1);
        startPath = path.join('src', 'routes', routePath);

        // If it looks like a directory-style route, point to +page.svelte
        if (!startPath.endsWith('.svelte') && !startPath.endsWith('.ts') && !startPath.endsWith('.js')) {
            startPath = path.join(startPath, '+page.svelte');
        }
    } else if (startPath === '+layout.svelte' || startPath === 'src/routes/+layout.svelte') {
        startPath = 'src/routes/+layout.svelte';
    } else if (!startPath.startsWith('src/')) {
        startPath = path.join('src', startPath);
    }

    const absoluteEntry = path.resolve(projectRoot, startPath);
    const queue = [absoluteEntry];

    // Helper to resolve import paths including $lib aliases
    function resolveImportPath(importPath: string, currentFile: string): string | null {
        if (importPath.startsWith('.')) {
            return path.resolve(path.dirname(currentFile), importPath);
        }
        if (importPath.startsWith('$lib/')) {
            const libPath = importPath.replace('$lib/', '');
            return path.join(projectRoot, 'src', 'lib', libPath);
        }
        return null;
    }

    const importRegex = /import\s+(?:(?:[\w*\s{},]*)\s+from\s+)?['"]([^'"]+)['"]/g;

    while (queue.length > 0 && visited.size < 50) {
        const curr = queue.shift()!;
        if (visited.has(curr)) continue;
        visited.add(curr);

        if (!curr.includes('/src/') || !/\.(svelte|ts|js)$/.test(curr) || !existsSync(curr)) continue;

        try {
            const code = await fs.readFile(curr, 'utf-8');
            importRegex.lastIndex = 0;
            let match;
            while ((match = importRegex.exec(code)) !== null) {
                const importPath = match[1];
                const resolved = resolveImportPath(importPath, curr);
                if (resolved && !visited.has(resolved)) {
                    const extensions = ['', '.svelte', '.ts', '.js', '/index.ts', '/index.js'];
                    for (const ext of extensions) {
                        const fullPath = resolved + ext;
                        if (existsSync(fullPath) && !visited.has(fullPath)) {
                            queue.push(fullPath);
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`Failed to parse imports for ${curr}:`, e);
        }
    }

    return Array.from(visited);
}

export async function getRecursiveContext(entry: string, user: any) {
    const context: Record<string, string> = {};
    const filePaths = await getImportedFiles(entry);

    for (const filePath of filePaths) {
        try {
            console.log('gRC: ', filePath);
            const code = await fs.readFile(filePath, 'utf-8');
            context[filePath] = code;
        } catch (e) {
            console.warn(`Failed to read ${filePath}:`, e);
        }
    }

    return context;
}

/**
 * Enhanced context gatherer that includes both the target entry (e.g. current page)
 * and the root layout (+layout.svelte) along with their recursive imports.
 */
export async function getFullPageContext(entry: string, user: any) {
    // 1. Get context for the specific entry
    const pageContext = await getRecursiveContext(entry, user);

    // 2. Get context for the root layout
    // We assume the root layout is at src/routes/+layout.svelte
    const layoutContext = await getRecursiveContext('src/routes/+layout.svelte', user);

    // 3. Merge contexts (layout first, so page can overwrite in case of conflict, 
    // though paths should be absolute and distinct anyway)
    return { ...layoutContext, ...pageContext };
}

/**
 * Returns the full set of files associated with a page, including layout files.
 */
export async function getAllPageFiles(entry: string) {
    const pageFiles = await getImportedFiles(entry);
    const layoutFiles = await getImportedFiles('src/routes/+layout.svelte');
    return Array.from(new Set([...pageFiles, ...layoutFiles]));
}
