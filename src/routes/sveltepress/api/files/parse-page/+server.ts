// FILE: src/routes/sveltepress/api/files/parse-page/+server.ts
import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as svelte from 'svelte/compiler';
import { walk } from 'estree-walker';
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

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { filePath } = await request.json();
    const content = await readFile(join(process.cwd(), filePath), 'utf-8');
    const svelteAst = svelte.parse(content);

    const imports: {
      specifiers: { name: string; type: string }[];
      source: string;
      kind: 'value' | 'type';
    }[] = [];
    const props: { name:string; value: string; typeAnnotation: string }[] = [];
    const template: any[] = [];
    let style = '';
    const head = {
      title: '',
      meta: [] as { name: string; content: string }[],
    };

    if (svelteAst.instance) {
      // --- FIX (Issue #3, #6): Use a robust AST parser for script content ---
      const scriptContent = getNodeText(svelteAst.instance.content, content);
      const scriptAst = parse(scriptContent, {
        ecmaVersion: 'latest',
        sourceType: 'module',
      });

      walk(scriptAst, {
        enter(node: any) {
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
          } else if (
            node.type === 'VariableDeclaration' &&
            node.kind === 'const'
          ) {
            for (const declaration of node.declarations) {
              const name = declaration.id.name;
              const typeAnnotation = declaration.id.typeAnnotation
                ? scriptContent.substring(
                    declaration.id.typeAnnotation.range[0],
                    declaration.id.typeAnnotation.range[1],
                  )
                : '';

              // Convert the AST node for the value into a real JS object
              const valueObject = nodeToValue(declaration.init);
              // Now stringify it into clean JSON for the client
              const valueJsonString = JSON.stringify(valueObject, null, 2);

              props.push({ name, value: valueJsonString, typeAnnotation });
            }
          }
        },
      });
    }

    let currentHtmlBlock = '';

    function pushHtmlBlock() {
      if (currentHtmlBlock.trim()) {
        template.push({ type: 'html', content: currentHtmlBlock.trim() });
      }
      currentHtmlBlock = '';
    }

    for (const node of svelteAst.html.children) {
      switch (node.type) {
        case 'Head':
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
                if (attr.name === 'content' && attr.value[0]?.type === 'Text') {
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
            template.push({
              type: 'component',
              name: node.name,
              props: componentProps,
            });
          } else {
            currentHtmlBlock += getNodeText(node, content);
          }
          break;

        default:
          currentHtmlBlock += getNodeText(node, content);
          break;
      }
    }

    pushHtmlBlock();

    if (svelteAst.css) {
      style = getNodeText(svelteAst.css.content, content);
    }

    return json({
      success: true,
      ast: {
        imports,
        props,
        head,
        template,
        style,
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