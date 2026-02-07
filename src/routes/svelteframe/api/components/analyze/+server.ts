import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types';
import * as svelte from 'svelte/compiler';
import { createHash } from 'crypto';

// Basic list of tags that constitute "Logic" or "Control Flow" in Svelte (or special elements)
const LOGIC_TYPES = ['IfBlock', 'EachBlock', 'AwaitBlock', 'KeyBlock', 'SnippetBlock'];
const SPECIAL_TAGS = ['svelte:component', 'svelte:element', 'svelte:window', 'svelte:body', 'svelte:head', 'svelte:options', 'svelte:fragment'];

function getExcerpt(content: string, start: number, end: number, maxLength = 100): string {
    const raw = content.substring(start, end).replace(/\s+/g, ' ').trim();
    if (raw.length > maxLength) return raw.substring(0, maxLength) + '...';
    return raw;
}

function analyzeNode(node: any, content: string, depth: number, segments: any[]) {
    // Skip empty text nodes
    if (node.type === 'Text') {
        if (!node.data.trim()) return;
        // Treat significant text as HTML segment if singular? 
        // Usually text exists inside Element. If we are at root or direct child of If, it's a segment.
        segments.push({
            type: 'html',
            subtype: 'text',
            start: node.start,
            end: node.end,
            depth,
            content: content.substring(node.start, node.end),
            preview: getExcerpt(content, node.start, node.end)
        });
        return;
    }

    if (node.type === 'Element') {
        // Additional check for Svelte special elements which parse as "Element" but have special names sometimes?
        // No, <svelte:component> is InlineComponent usually.
        // Plain HTML Element.
        segments.push({
            type: 'html',
            subtype: 'element',
            tagName: node.name,
            start: node.start,
            end: node.end,
            depth,
            // For elements, we usually want to edit the Whole Thing if it's a container,
            // OR recursively list children?
            // The user wants "HTML parsed into segments".
            // If I have <div class="footer">...</div>, that is ONE segment?
            // User said: "portion on line 41 ... would be the first editable HTML portion".
            // That portion CONTAINS children.
            // If we treat it as one giant block, the WYSIWYG editor loads the whole footer.
            // That matches the requirement.

            // However, if the element contains Logic Blocks (If/Each), we can't easily edit it as a single HTML string
            // without breaking the Logic blocks or requiring the WYSIWYG to protect them (complex).
            // User said: "HTML block... until... Svelte code... Then second editable HTML block inside".
            // This implies splitting the parent HTML if it contains logic?
            // OR: The "Segment" is the "Content Sequence" at a particular level.

            // Let's refine:
            // "Segments" are the top-level children of the component (or the current block).
            // If an Element contains ONLY text/html children, it is a "Leaf HTML Segment" (editable).
            // If an Element contains Logic Blocks, it is a "Container" (maybe not directly editable in one go?).
            // Actually, CKEditor can handle "Protected Regions" but it's hard.

            // User's specific request: "parse to separate the pure HTML from the Svelte code".
            // "1. HTML block starting ... until line 204".
            // This implies: "Contiguous run of HTML/Text nodes".
            // So if we have: <div> <h1>Hi</h1> {#if x} </div>
            // The "<div> <h1>Hi</h1>" part is valid HTML? No, closing div is missing.
            // Wait, the User's example `Footer.svelte` line 41 is a `div`. Line 204 is `{#if}`.
            // Are they siblings?
            // Let's assume they are siblings in the Svelte AST.
            // If they are siblings, then yes:
            // Segment 1: Element (div).
            // Segment 2: IfBlock.

            // But wait, if the `{#if}` is INSIDE the div?
            // Then the DIV contains the IfBlock.
            // Should we report the DIV as one segment?
            // If we do, editing it in CKEditor will show the `{#if}` code? Or hide it?
            // Ideally, we treat the DIV as a container, and we recurse into it.

            // Let's check `Footer.svelte` structure implicitly via logic: 
            // "HTML block starting on line 41... until line 204 ... {#if} ... Svelte block ends line 259".
            // If the `{#if}` ends, and then we are back to... what?
            // This structure implies `div` (line 41) CLOSES after line 259? Or before?
            // If `{#if}` is a child of `div`, then `div` is the parent.
            // If the user wants to see the `{#if}` as a SEPARATE structure item, we MUST dive into the `div`.

            // Logic:
            // Always Recurse into Elements?
            // If we always recurse, we get a tree. We want a "Structure Sidebar" (Tree View).
            // If we select a node in the tree, we edit IT.
            // If I select `div`, and it has `{#if}` inside:
            // Can I edit `div`'s attributes? Yes.
            // Can I edit its content? Only the text parts?

            // The User's "HTML Block" concept seems to mean: "Safe HTML Subtree".
            // Logic:
            // - Iterate children of current scope (Root or Element or Block).
            // - Group contiguous "Safe HTML" nodes (Text, Elements without logic children?)
            // - Report "Logic" nodes separately.

            // Implementation:
            // Just traverse the tree.
            // Report every "Child" of the Template Root?
            // And if a Child is an Element, do we verify if it has logic inside?
            // If it has logic inside, we DO NOT report it as an "HTML Editor Segment" (because editing it breaks logic).
            // We report it as a "Structural Element" (Container).
            // And we recurse.

            // If it DOES NOT have logic inside (pure HTML subtree), we report it as an "Editable HTML Block".
            // And we STOP recursion (treat as leaf).

            // This seems like the "Smart" approach.
            // Pure HTML Subtree -> "Editable HTML Segment".
            // Element with Logic -> "Container" (Show loop/if icons inside).
            // Logic Block -> "Logic Segment" (Show nested HTML inside).

            preview: getExcerpt(content, node.start, node.end)
        });

        // We need to know if we should Recurse (Container) or Stop (Leaf Editable).
        // I will add a `hasLogicChildren` flag helper.
        return;
    }

    if (LOGIC_TYPES.includes(node.type) || SPECIAL_TAGS.includes(node.type) || node.type === 'InlineComponent') {
        segments.push({
            type: 'logic',
            subtype: node.type,
            tagName: node.name || node.type,
            start: node.start,
            end: node.end,
            depth,
            preview: getExcerpt(content, node.start, node.end, 50)
        });
        // Recurse into logic blocks to find deeper HTML
        if (node.children) {
            node.children.forEach((c: any) => analyzeNode(c, content, depth + 1, segments));
        } else if (node.else) {
            analyzeNode(node.else, content, depth + 1, segments);
        }
        return;
    }
}

function hasLogicDescendants(node: any): boolean {
    if (!node.children || node.children.length === 0) return false;
    for (const child of node.children) {
        // Check if child is logic/component
        if (LOGIC_TYPES.includes(child.type) || SPECIAL_TAGS.includes(child.type) || child.type === 'InlineComponent') {
            return true;
        }
        // Check if child has event handlers
        if (child.type === 'Element' && child.attributes) {
            const hasEventHandlers = child.attributes.some((attr: any) =>
                attr.type === 'EventHandler' || (attr.name && attr.name.startsWith('on:'))
            );
            if (hasEventHandlers) return true;
        }
        // Recursively check grandchildren
        if (child.type === 'Element' && hasLogicDescendants(child)) {
            return true;
        }
    }
    return false;
}

function generateStableId(path: string, type: string, start: number, end: number, extra: string = ''): string {
    const input = `${path}:${type}:${start}:${end}:${extra}`;
    return createHash('md5').update(input).digest('hex');
}

export const POST: RequestHandler = async ({ request }: any) => {
    try {
        const { filePath } = await request.json();
        const content = await readFile(join(process.cwd(), filePath), 'utf-8');
        const ast = svelte.parse(content);

        // Resolve Imports
        const imports: Record<string, string> = {}; // ComponentName -> ResolvedPath
        const dir = join(process.cwd(), filePath, '..'); // Directory of current file

        if (ast.instance && ast.instance.content && ast.instance.content.body) {
            ast.instance.content.body.forEach((node: any) => {
                if (node.type === 'ImportDeclaration') {
                    const source = node.source.value;
                    // Resolve source
                    let resolvedSrc = source;
                    if (source.startsWith('.')) {
                        resolvedSrc = join(dir, source);
                    } else if (source.startsWith('$lib')) {
                        resolvedSrc = source.replace('$lib', join(process.cwd(), 'src/lib'));
                    } else if (source.startsWith('src')) {
                        resolvedSrc = join(process.cwd(), source);
                    }

                    // Ensure extension
                    if (!resolvedSrc.endsWith('.svelte')) resolvedSrc += '.svelte';

                    // Map specifiers
                    node.specifiers.forEach((spec: any) => {
                        imports[spec.local.name] = resolvedSrc;
                    });
                }
            });
        }

        const segments: any[] = [];

        // Helper to process a list of nodes
        function processNodes(nodes: any[], depth: number) {
            nodes.forEach(node => {
                if (node.type === 'Element') {
                    // Check if element has Svelte event handlers (on:click, on:keydown, etc.)
                    const hasEventHandlers = node.attributes && node.attributes.some((attr: any) =>
                        attr.type === 'EventHandler' || (attr.name && attr.name.startsWith('on:'))
                    );

                    // Interactive elements (button, a, input, etc.) should be treated as containers
                    // Their attributes (including Svelte event handlers) should be preserved
                    // Only their text content should be editable
                    const interactiveElements = ['button', 'a', 'input', 'select', 'textarea', 'label'];
                    const isInteractive = interactiveElements.includes(node.name.toLowerCase());

                    // Check purity
                    if (hasLogicDescendants(node) || isInteractive || hasEventHandlers) {
                        // It's a Container. Add it as a structural node but recurse.
                        let preview = `<${node.name}`;
                        if (isInteractive) preview += ' [interactive]';
                        if (hasEventHandlers) preview += ' [has events]';
                        preview += ' ...>';

                        segments.push({
                            id: generateStableId(filePath, 'container', node.start, node.end, node.name),
                            type: 'container', // Structural only
                            tagName: node.name,
                            start: node.start,
                            end: node.end,
                            depth,
                            preview,
                            isInteractive, // Flag for UI
                            hasEventHandlers,
                            sourceFile: filePath
                        });
                        if (node.children) {
                            processNodes(node.children, depth + 1);
                        }
                    } else {
                        // Pure HTML Block. Editable!
                        segments.push({
                            id: generateStableId(filePath, 'html', node.start, node.end, node.name || 'text'),
                            type: 'html',
                            tagName: node.name,
                            start: node.start,
                            end: node.end,
                            depth,
                            content: content.substring(node.start, node.end), // Send full content for editing
                            preview: getExcerpt(content, node.start, node.end),
                            sourceFile: filePath
                        });
                    }
                } else if (node.type === 'Text') {
                    const text = node.data.trim();
                    if (text) {
                        segments.push({
                            id: generateStableId(filePath, 'html', node.start, node.end, 'text'),
                            type: 'html', // Text is also HTML content
                            subtype: 'text',
                            start: node.start,
                            end: node.end,
                            depth,
                            content: content.substring(node.start, node.end), // FIX: Send content!
                            preview: text.length > 30 ? text.substring(0, 30) + '...' : text,
                            sourceFile: filePath
                        });
                    }
                } else {
                    // Logic / Component
                    let name = node.type;
                    let resolvedPath = null;
                    if (node.type === 'InlineComponent') {
                        name = node.name;
                        // Check if we have a resolved path for this component
                        if (imports[name]) {
                            resolvedPath = imports[name];
                            // Make relative to CWD for client usage? Or absolute?
                            // Client expects 'src/...' usually.
                            // Let's verify format.
                            // EditorPane uses `src/`.
                            const cwd = process.cwd();
                            if (resolvedPath.startsWith(cwd)) {
                                resolvedPath = resolvedPath.substring(cwd.length + 1).replace(/\\/g, '/');
                            }
                        }
                    }
                    if (node.type === 'IfBlock') {
                        const raw = content.substring(node.start, node.end);
                        const match = raw.match(/^{#if\s+([^}]+)}/);
                        name = match ? `{#if ${match[1].trim()}}` : '{#if ...}';
                    }
                    if (node.type === 'EachBlock') {
                        const raw = content.substring(node.start, node.end);
                        const match = raw.match(/^{#each\s+([^}]+)}/);
                        name = match ? `{#each ${match[1].trim()}}` : '{#each ...}';
                    }
                    if (node.type === 'AwaitBlock') name = '{#await ...}';
                    if (node.type === 'KeyBlock') name = '{#key ...}';
                    if (node.type === 'SnippetBlock') name = '{#snippet ...}';

                    const idType = node.type === 'InlineComponent' ? 'component' : 'logic';
                    segments.push({
                        id: generateStableId(filePath, idType, node.start, node.end, name),
                        type: 'logic',
                        subtype: node.type, // Store subtype
                        tagName: name,
                        start: node.start,
                        end: node.end,
                        depth,
                        preview: name,
                        resolvedPath, // Attach path if available
                        sourceFile: filePath
                    });

                    // Recurse
                    if (node.children) processNodes(node.children, depth + 1);
                    if (node.else) processNodes(node.else.children, depth + 1);
                }
            });
        }

        processNodes(ast.html.children, 0);

        console.log(`[ComponentAnalyzer] Analyzed ${filePath}: found ${segments.length} segments`);
        segments.forEach((s, idx) => {
            // Limit log spam
            if (s.type === 'html') {
                console.log(`  [${idx}] depth:${s.depth} [HTML] ${s.subtype || s.tagName} "${s.preview}"`);
            } else if (s.type === 'container') {
                console.log(`  [${idx}] depth:${s.depth} [CONTAINER] ${s.tagName} - interactive:${s.isInteractive} events:${s.hasEventHandlers}`);
            } else if (s.type === 'logic') {
                console.log(`  [${idx}] depth:${s.depth} [LOGIC] ${s.tagName}`);
            }
        });

        return json({
            success: true,
            segments
        });
    } catch (e: any) {
        console.error('Error analyzing component:', e);
        return json({ success: false, error: e.message }, { status: 500 });
    }
};
