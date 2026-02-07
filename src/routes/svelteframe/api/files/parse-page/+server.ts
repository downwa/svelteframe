// src/routes/svelteframe/api/files/parse-page/+server.ts
import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import type { RequestHandler } from './$types';
import * as svelte from 'svelte/compiler';
import { walk } from 'estree-walker';
import { createHash } from 'crypto';
// Using a robust parser instead of the brittle vm module
import { parse } from '@typescript-eslint/parser';
import { generate } from 'astring';

function getNodeText(node: any, source: string): string {
  if (!node || node.start === undefined || node.end === undefined) return '';
  return source.substring(node.start, node.end);
}

// Helper to convert an ESTree node back to a JS object/value
function nodeToValue(node: any): any {
  if (!node) return null;
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'ObjectExpression':
      const obj: Record<string, any> = {};
      for (const prop of node.properties) {
        if (prop.type === 'Property') {
          const key = prop.key.name || prop.key.value;
          obj[key] = nodeToValue(prop.value);
        }
      }
      return obj;
    case 'ArrayExpression':
      return node.elements.map(nodeToValue);
    case 'Identifier':
      return `{${node.name}}`; // We can't easily resolve local identifiers without a full scope analysis
    default:
      // Fallback for complex expressions we can't evaluate to a literal
      // This will return the code as a string.
      try {
        return generate(node);
      } catch {
        return null;
      }
  }
}

async function resolveImportedValues(
  imports: any[],
  currentFilePath: string
): Promise<any[]> {
  const importedObjects: any[] = [];
  const projectRoot = process.cwd();

  for (const imp of imports) {
    let targetPath = '';
    if (imp.source.startsWith('$lib/')) {
      targetPath = join(projectRoot, 'src/lib', imp.source.substring(5));
    } else if (imp.source.startsWith('$routes/')) {
      targetPath = join(projectRoot, 'src/routes', imp.source.substring(8));
    } else if (imp.source.startsWith('./') || imp.source.startsWith('../')) {
      targetPath = join(projectRoot, dirname(currentFilePath), imp.source);
    } else {
      continue;
    }

    // Append extension if missing
    if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js') && !targetPath.endsWith('.svelte')) {
      // Try both .ts and .js
      try {
        await readFile(targetPath + '.ts');
        targetPath += '.ts';
      } catch {
        try {
          await readFile(targetPath + '.js');
          targetPath += '.js';
        } catch {
          continue;
        }
      }
    }

    try {
      const content = await readFile(targetPath, 'utf-8');
      let scriptContent = content;

      if (targetPath.endsWith('.svelte')) {
        const svelteAst = svelte.parse(content);
        if (svelteAst.instance) {
          scriptContent = content.substring(
            svelteAst.instance.content.start,
            svelteAst.instance.content.end
          );
        } else {
          continue;
        }
      }

      const scriptAst = parse(scriptContent, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        range: true
      });

      walk(scriptAst as any, {
        enter(node: any, parent: any) {
          if (
            (node.type === 'VariableDeclaration' && parent?.type === 'ExportNamedDeclaration') ||
            (node.type === 'VariableDeclaration' && node.kind === 'const') // Check local if we want to be thorough, but usually we import exported ones
          ) {
            const isExported = parent?.type === 'ExportNamedDeclaration';
            for (const dec of node.declarations) {
              const name = dec.id.name;
              // Check if this specifier is in our imports list for this source
              const isDesired = imp.specifiers.some((s: any) => s.name === name);
              if (isDesired) {
                const valueObject = nodeToValue(dec.init);
                importedObjects.push({
                  name,
                  value: JSON.stringify(valueObject, null, 2),
                  path: targetPath.replace(projectRoot + '/', '').replace(/\\/g, '/'),
                  fullPath: targetPath.replace(/\\/g, '/'),
                  id: `import-${targetPath}-${name}`
                });
              }
            }
          }
        }
      });
    } catch (e) {
      console.error(`Failed to resolve imported values from ${targetPath}:`, e);
    }
  }

  return importedObjects;
}

export const POST: RequestHandler = async ({ request }: any) => {
  try {
    const { filePath } = await request.json();
    const projectRoot = process.cwd();
    const content = await readFile(join(projectRoot, filePath), 'utf-8');
    const svelteAst = svelte.parse(content);

    const imports: {
      specifiers: { name: string; type: string }[];
      source: string;
      kind: 'value' | 'type';
    }[] = [];
    const props: {
      name: string;
      value: string;
      type?: string;
      typeAnnotation?: string;
      exported: boolean;
      isInternal?: boolean;
    }[] = [];
    const template: any[] = [];
    let style = '';
    let unmanagedScript = '';
    const head = {
      title: '',
      meta: [] as { name: string; content: string }[],
    };

    if (svelteAst.instance) {
      const scriptContent = getNodeText(svelteAst.instance.content, content);
      const scriptAst = parse(scriptContent, {
        ecmaVersion: 'latest',
        sourceType: 'module',
      });

      const managedIndices: { start: number; end: number }[] = [];

      walk(scriptAst as any, {
        enter(node: any, parent: any) {
          if (node.type === 'ImportDeclaration') {
            const specifiers = node.specifiers.map((spec: any) => ({
              name: spec.local.name,
              type: spec.type,
            }));
            imports.push({
              specifiers,
              source: node.source.value,
              kind: node.importKind || 'value',
            });
            managedIndices.push({ start: node.range[0], end: node.range[1] });
          } else if (
            node.type === 'VariableDeclaration' &&
            node.kind === 'const' &&
            (parent?.type === 'Program' || parent?.type === 'ExportNamedDeclaration')
          ) {
            const isExported = parent?.type === 'ExportNamedDeclaration';
            for (const declaration of node.declarations) {
              if (declaration.id.type === 'Identifier') { // Ensure it's an identifier for name extraction
                const name = declaration.id.name;
                const typeAnnotation = declaration.id.typeAnnotation
                  ? scriptContent.substring(
                    declaration.id.typeAnnotation.range[0],
                    declaration.id.typeAnnotation.range[1],
                  ).replace(/^:\s*/, '').trim()
                  : '';

                const valueObject = nodeToValue(declaration.init);
                const valueJsonString = JSON.stringify(valueObject, null, 2);

                // Detect number type
                let finalType = typeof valueObject;
                if (declaration.id.typeAnnotation?.typeAnnotation?.type === 'TSNumberKeyword') {
                  finalType = 'number';
                }

                props.push({
                  name,
                  value: valueJsonString,
                  type: finalType, // Add explicit type
                  typeAnnotation,
                  exported: isExported,
                });
              }
            }
            // If exported, the entire ExportNamedDeclaration should be managed
            const rangeNode = isExported ? parent : node;
            managedIndices.push({
              start: rangeNode.range[0],
              end: rangeNode.range[1],
            });
          } else if (node.type === 'VariableDeclaration' && node.kind === 'const' && parent?.type === 'Program') {
            // ALSO capture non-exported constants for logic block resolution!
            for (const declaration of node.declarations) {
              if (declaration.id.type === 'Identifier') {
                const name = declaration.id.name;
                const valueObject = nodeToValue(declaration.init);
                props.push({
                  name,
                  value: JSON.stringify(valueObject, null, 2),
                  exported: false,
                  isInternal: true // Mark as internal constant
                });
              }
            }
            managedIndices.push({
              start: node.range[0],
              end: node.range[1],
            });
          }
        },
      });

      // Extract unmanaged script content by excluding managed parts
      let lastIndex = 0;
      managedIndices.sort((a, b) => a.start - b.start);
      for (const range of managedIndices) {
        unmanagedScript += scriptContent.substring(lastIndex, range.start);
        lastIndex = range.end;
      }
      unmanagedScript += scriptContent.substring(lastIndex);
      unmanagedScript = unmanagedScript.trim();
    }

    function hasNestedComponent(node: any): boolean {
      if (node.type === 'InlineComponent') return true;
      if (node.children) {
        return node.children.some((child: any) => hasNestedComponent(child));
      }
      return false;
    }

    // Improve "Surgical Edit Mode" for components:
    // If we are parsing a library component (not a route page), we want granular editing of HTML tags.
    // This allows editing <h2>, <p> etc. independently without CLS or corruption.
    const isComponentLibraryFile = filePath.includes('src/lib/');

    function notEmpty(node: any): boolean {
      return node && node.trim().length > 0;
    }

    function isContainerTag(name: string): boolean {
      return ['div', 'section', 'main', 'header', 'footer', 'article', 'aside', 'nav', 'ul', 'ol', 'li'].includes(name);
    }

    function generateStableId(path: string, type: string, start: number, end: number, extra: string = ''): string {
      const input = `${path}:${type}:${start}:${end}:${extra}`;
      return createHash('md5').update(input).digest('hex');
    }

    function processNodes(nodes: any[]) {
      let currentHtmlBlock = '';
      // We need to track the start/end of the accumulated HTML block for stable IDs.
      // Ideally, we'd use the start of the first node and end of the last node in the block.
      let currentBlockStart = -1;
      let currentBlockEnd = -1;

      function pushHtmlBlock() {
        // Only push if there is actual content or it's a meaningful whitespace?
        // Actually, we should preserve everything.
        if (currentHtmlBlock.length > 0) {
          // Use 0,-1 if we somehow missed tracking, but we should track.
          // If it's pure text accumulation, exact bounds might be fuzzy if we blindly concat strings, 
          // but we can try to rely on the node loop to set start/end.
          if (currentBlockStart === -1) currentBlockStart = 0; // Fallback
          if (currentBlockEnd === -1) currentBlockEnd = 0; // Fallback

          template.push({
            id: generateStableId(filePath, 'html', currentBlockStart, currentBlockEnd, currentHtmlBlock.length.toString()),
            type: 'html',
            content: currentHtmlBlock,
            sourceFile: filePath
          });
        }
        currentHtmlBlock = '';
        currentBlockStart = -1;
        currentBlockEnd = -1;
      }

      for (const node of nodes) {
        // Track start/end for HTML blocks
        if (node.type !== 'InlineComponent' && node.type !== 'Comment' && node.type !== 'Element') {
          // This logic needs refinement: 'Element' might NOT spit, so it might contribute to currentHtmlBlock.
          // But let's look at the cases below.
        }

        switch (node.type) {
          case 'Head':
            // ... (Head handling remains the same)
            node.children?.forEach((child: any) => {
              if (child.type === 'Title') {
                const textNode = child.children?.find(
                  (c: any) => c.type === 'Text',
                );
                head.title = textNode?.data.trim() || '';
              } else if (child.type === 'Element' && child.name === 'meta') {
                let nameAttr: string | undefined;
                let contentAttr: string | undefined;
                child.attributes.forEach((attr: any) => {
                  if (attr.name === 'name' && attr.value[0]?.type === 'Text') {
                    nameAttr = attr.value[0].data;
                  }
                  if (
                    attr.name === 'content' &&
                    attr.value[0]?.type === 'Text'
                  ) {
                    contentAttr = attr.value[0].data;
                  }
                });
                if (nameAttr && contentAttr) {
                  head.meta.push({ name: nameAttr, content: contentAttr });
                }
              }
            });
            break;

          case 'InlineComponent':
            // ... (InlineComponent handling remains the same)
            const isImportedComponent = imports.some((imp) =>
              imp.specifiers.some((s) => s.name === node.name),
            );

            if (isImportedComponent) {
              pushHtmlBlock();
              const componentProps: Record<string, string> = {};
              node.attributes.forEach((attr: any) => {
                if (attr.type === 'Attribute' && Array.isArray(attr.value)) {
                  const valueNode = attr.value[0];
                  if (valueNode?.type === 'Text') {
                    componentProps[attr.name] = valueNode.data;
                  } else if (valueNode?.type === 'MustacheTag') {
                    componentProps[attr.name] = `{${getNodeText(
                      valueNode.expression,
                      content,
                    )}}`;
                  }
                }
              });
              let resolvedPath = null;
              const imp = imports.find((i) => i.specifiers.some((s) => s.name === node.name));
              if (imp) {
                let src = imp.source;
                if (src.startsWith('$lib/')) {
                  resolvedPath = join(projectRoot, 'src/lib', src.substring(5));
                } else if (src.startsWith('$routes/')) {
                  resolvedPath = join(projectRoot, 'src/routes', src.substring(8));
                } else if (src.startsWith('./') || src.startsWith('../')) {
                  resolvedPath = join(process.cwd(), dirname(filePath), src);
                }

                if (resolvedPath) {
                  // Ensure extension
                  if (!resolvedPath.endsWith('.svelte')) resolvedPath += '.svelte';
                  // Make relative to CWD for client usage
                  resolvedPath = resolvedPath.replace(projectRoot + '/', '').replace(/\\/g, '/');
                }
              }

              template.push({
                id: generateStableId(filePath, 'component', node.start, node.end, node.name),
                type: 'component',
                name: node.name,
                props: componentProps,
                sourceFile: filePath,
                path: resolvedPath
              });
            } else {
              if (currentBlockStart === -1) currentBlockStart = node.start;
              currentBlockEnd = node.end;
              currentHtmlBlock += getNodeText(node, content);
            }
            break;

          case 'Comment':
            pushHtmlBlock();
            const commentContent = `<!--${node.data}-->`;
            template.push({
              id: generateStableId(filePath, 'comment', node.start, node.end),
              type: 'html',
              content: commentContent,
              isComment: true,
              sourceFile: filePath
            });
            break;

          case 'Element':
            // Granular Logic:
            // 1. If it has a nested component, we MUST split (existing logic).
            // 2. If it's a Component Library File AND it's a container tag, we should split to allow editing children.
            const shouldSplit = hasNestedComponent(node) || (isComponentLibraryFile && isContainerTag(node.name));

            if (shouldSplit) {
              pushHtmlBlock();
              // Extract opening tag
              const tagText = getNodeText(node, content);

              // Simple extraction of opening tag relies on finding first '>'
              // This is brittle if attributes contain '>' (e.g. arrow function in event handler)
              // But for standard HTML/Svelte it's usually okay.
              // A safer way is using node.children[0].start if children exist, or end if not.
              // Let's stick to existing logic but maybe make it safer later if needed.

              let openingTagEndIndex = tagText.indexOf('>') + 1;
              // Safety check: if no children, the opening tag might be the whole thing (self closing)
              if (node.children && node.children.length > 0) {
                const firstChildStart = node.children[0].start - node.start;
                if (firstChildStart > 0 && firstChildStart < tagText.length) {
                  // Actually, 'tagText' is the WHOLE node text.
                  // We want just the opening tag.
                  // If we have children, opening tag ends before first child.
                  openingTagEndIndex = firstChildStart;
                }
              }

              const openingTag = tagText.substring(0, openingTagEndIndex);
              // Closing tag
              const closingTag = `</${node.name}>`;

              template.push({
                id: generateStableId(filePath, 'wrapper_open', node.start, node.start + openingTagEndIndex),
                type: 'html',
                content: openingTag,
                isWrapper: true,
                sourceFile: filePath
              });
              processNodes(node.children || []);
              pushHtmlBlock();
              template.push({
                id: generateStableId(filePath, 'wrapper_close', node.end - closingTag.length, node.end),
                type: 'html',
                content: closingTag,
                isWrapper: true,
                sourceFile: filePath
              });
            }
            break;

          case 'EachBlock':
          case 'IfBlock':
          case 'AwaitBlock':
          case 'KeyBlock':
          case 'Slot':
            pushHtmlBlock();
            template.push({
              id: generateStableId(filePath, 'logic', node.start, node.end, node.type),
              type: 'logic',
              subtype: node.type,
              tagName: node.type, // For sidebar label
              content: getNodeText(node, content),
              sourceFile: filePath
            });
            break;

          default:
            if (currentBlockStart === -1) currentBlockStart = node.start;
            currentBlockEnd = node.end;
            currentHtmlBlock += getNodeText(node, content);
            break;
        }
      }
      pushHtmlBlock();
    }

    processNodes(svelteAst.html.children);

    if (svelteAst.css) {
      style = getNodeText(svelteAst.css.content, content);
    }

    const resolvedImports = await resolveImportedValues(imports, filePath);

    return json({
      success: true,
      ast: {
        imports,
        importedObjects: resolvedImports,
        props,
        head,
        template,
        style,
        unmanagedScript,
      },
    });
  } catch (e: any) {
    console.error('Error parsing Svelte page:', e);
    return json(
      { success: false, error: 'Failed to parse Svelte page: ' + e.message },
      { status: 500 },
    );
  }
};
