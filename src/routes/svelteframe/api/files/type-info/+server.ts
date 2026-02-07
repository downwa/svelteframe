// FILE: src/routes/svelteframe/api/files/type-info/+server.ts
import { json, error } from '@sveltejs/kit';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { parse } from '@typescript-eslint/parser';
import { walk } from 'estree-walker';

// --- FIX (Issue #7): Helper to find file with extension ---
async function findFileWithExtension(filePath: string): Promise<string | null> {
  const extensions = ['', '.ts', '.js', '.d.ts'];
  for (const ext of extensions) {
    try {
      const fullPath = filePath + ext;
      await stat(fullPath);
      return fullPath;
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return null;
}

export async function GET({ url }) {
  const sourcePath = url.searchParams.get('source');
  const typeName = url.searchParams.get('typeName');

  if (!sourcePath || !typeName) {
    throw error(400, 'source and typeName are required');
  }

  const partialPath = sourcePath.startsWith('$lib/')
    ? join(process.cwd(), 'src/lib', sourcePath.substring(5))
    : join(process.cwd(), sourcePath);

  const resolvedPath = await findFileWithExtension(partialPath);

  if (!resolvedPath) {
    throw error(404, `Could not find file for source: ${sourcePath}`);
  }

  try {
    const content = await readFile(resolvedPath, 'utf-8');
    const ast = parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });

    let typeInfo: { name: string; fields: { name: string; type: string }[] } | null = null;

    walk(ast, {
      enter(node: any) {
        if (
          node.type === 'ExportNamedDeclaration' &&
          node.declaration?.type === 'TSInterfaceDeclaration' &&
          node.declaration.id.name === typeName
        ) {
          const fields: { name: string; type: string }[] = [];
          for (const member of node.declaration.body.body) {
            if (member.type === 'TSPropertySignature') {
              const fieldName = member.key.name;
              const fieldType =
                member.typeAnnotation?.typeAnnotation?.type
                  .replace('TS', '')
                  .replace('Keyword', '')
                  .toLowerCase() || 'any';
              fields.push({ name: fieldName, type: fieldType });
            }
          }
          typeInfo = { name: typeName, fields };
          this.skip();
        }
      },
    });

    if (typeInfo) {
      return json(typeInfo);
    } else {
      throw error(
        404,
        `Type '${typeName}' not found or not exported in ${sourcePath}`,
      );
    }
  } catch (e: any) {
    console.error(`Error parsing type file ${resolvedPath}:`, e);
    throw error(500, `Failed to parse type file: ${e.message}`);
  }
}
