// FILE: src/routes/svelteframe/api/files/component-props/+server.ts
import { json, error } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as svelte from 'svelte/compiler';
import { walk } from 'estree-walker';

function getNodeText(node: any, source: string): string {
  if (!node || node.start === undefined || node.end === undefined) return '';
  return source.substring(node.start, node.end);
}

export async function GET({ url }) {
  const filePath = url.searchParams.get('path');
  if (!filePath) {
    throw error(400, 'File path is required');
  }

  try {
    const content = await readFile(join(process.cwd(), filePath), 'utf-8');
    const ast = svelte.parse(content);
    const props: { name: string; type: string; defaultValue: any }[] = [];

    if (ast.instance) {
      walk(ast.instance.content, {
        enter(node: any) {
          if (
            node.type === 'ExportNamedDeclaration' &&
            node.declaration?.type === 'VariableDeclaration'
          ) {
            for (const declaration of node.declaration.declarations) {
              if (declaration.id.type === 'Identifier') {
                const name = declaration.id.name;
                const typeAnnotation = declaration.id.typeAnnotation
                  ? getNodeText(declaration.id.typeAnnotation.typeAnnotation, content)
                  : 'any';
                const defaultValue = declaration.init
                  ? getNodeText(declaration.init, content)
                  : 'undefined';
                
                props.push({ name, type: typeAnnotation, defaultValue });
              }
            }
          }
        },
      });
    }
    return json(props);
  } catch (e: any) {
    console.error(`Error parsing component ${filePath}:`, e);
    throw error(500, `Failed to parse component: ${e.message}`);
  }
}
