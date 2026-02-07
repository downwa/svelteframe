// FILE: src/routes/svelteframe/api/files/update-import/+server.ts
import { json, error } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { hasPermission } from '$routes/svelteframe/lib/client/access';
import * as svelte from 'svelte/compiler';
import { parse } from '@typescript-eslint/parser';
import { generate } from 'astring';
import { walk } from 'estree-walker';

// Helper to convert JS value back to AST node (simplified)
function valueToNode(value: any): any {
    if (value === null) return { type: 'Literal', value: null, raw: 'null' };
    if (typeof value === 'string') return { type: 'Literal', value, raw: JSON.stringify(value) };
    if (typeof value === 'number') return { type: 'Literal', value, raw: String(value) };
    if (typeof value === 'boolean') return { type: 'Literal', value, raw: String(value) };
    if (Array.isArray(value)) {
        return {
            type: 'ArrayExpression',
            elements: value.map(valueToNode)
        };
    }
    if (typeof value === 'object') {
        return {
            type: 'ObjectExpression',
            properties: Object.entries(value).map(([key, val]) => ({
                type: 'Property',
                key: { type: 'Identifier', name: key },
                value: valueToNode(val),
                kind: 'init',
                method: false,
                shorthand: false,
                computed: false
            }))
        };
    }
    return { type: 'Literal', value: null, raw: 'null' };
}

export const POST: RequestHandler = async ({ request, locals }: any) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { filePath, exportName, newValue } = await request.json();
    if (!filePath || !exportName || newValue === undefined) {
        throw error(400, 'Missing required fields (filePath, exportName, newValue)');
    }

    if (!hasPermission(locals.user, filePath, 'W')) {
        throw error(403, 'Forbidden');
    }

    try {
        const fullPath = join(process.cwd(), filePath);
        const content = await readFile(fullPath, 'utf-8');

        let result = '';

        if (filePath.endsWith('.svelte')) {
            const svelteAst = svelte.parse(content);
            if (!svelteAst.instance) throw new Error('No <script> tag found in Svelte file');

            const scriptStart = svelteAst.instance.content.start;
            const scriptEnd = svelteAst.instance.content.end;
            const scriptContent = content.substring(scriptStart, scriptEnd);

            const scriptAst = parse(scriptContent, {
                ecmaVersion: 'latest',
                sourceType: 'module',
                range: true
            });

            let replaced = false;
            const newScriptContent = (walk as any)(scriptAst as any, {
                enter(node: any, parent: any) {
                    if (node.type === 'VariableDeclaration') {
                        const dec = node.declarations.find((d: any) => d.id.name === exportName);
                        if (dec) {
                            dec.init = valueToNode(newValue);
                            replaced = true;
                        }
                    }
                }
            });

            if (!replaced) throw new Error(`Export ${exportName} not found in script`);

            const updatedScriptCode = generate(scriptAst as any);
            result = content.substring(0, scriptStart) + updatedScriptCode + content.substring(scriptEnd);

        } else {
            // TS or JS file
            const scriptAst = parse(content, {
                ecmaVersion: 'latest',
                sourceType: 'module',
                range: true
            });

            let range: [number, number] | null = null;
            let replaced = false;
            walk(scriptAst as any, {
                enter(node: any, parent: any) {
                    if (node.type === 'VariableDeclaration') {
                        const dec = node.declarations.find((d: any) => d.id.name === exportName);
                        if (dec && dec.init) {
                            // We use the range of the init expression to replace just that part
                            range = (dec.init as any).range;
                            replaced = true;
                        }
                    }
                }
            });

            if (!replaced || !range) throw new Error(`Export ${exportName} not found in file`);

            // Generate the new value snippet
            const newValueCode = generate(valueToNode(newValue));

            // Reconstruct the file by splicing the new value into the original source
            result = content.substring(0, range[0]) + newValueCode + content.substring(range[1]);
        }

        // Atomic Write
        const { writeFileAtomic, withFileLock, createBackup } = await import(
            '$routes/svelteframe/lib/server/file-utils'
        );
        await withFileLock(`file:${fullPath}`, async () => {
            await createBackup(fullPath);
            await writeFileAtomic(fullPath, result, 'utf-8');
        });

        return json({ success: true });
    } catch (e: any) {
        console.error('Error updating imported object:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
