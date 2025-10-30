// FILE: src/routes/sveltepress/api/files/reconstruct-page/+server.ts
import { json, error } from '@sveltejs/kit';
import { writeFile, rename } from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';
import { hasPermission } from '$routes/sveltepress/lib/AuthHelper';

function reconstructSvelteFile(ast: any): string {
  const parts: string[] = [];
  if (ast.imports?.length > 0 || ast.props?.length > 0) {
    parts.push('<script lang="ts">');
    ast.imports.forEach((imp: any) => {
      const typeKeyword = imp.kind === 'type' ? 'type ' : '';
      const defaultImport = imp.specifiers.find(
        (s: any) => s.type === 'ImportDefaultSpecifier',
      )?.name;
      const namedImports = imp.specifiers
        .filter((s: any) => s.type === 'ImportSpecifier')
        .map((s: any) => s.name);
      let importString = 'import ';
      if (typeKeyword) {
        importString += typeKeyword;
      }
      if (defaultImport) {
        importString += defaultImport;
      }
      if (defaultImport && namedImports.length > 0) {
        importString += ', ';
      }
      if (namedImports.length > 0) {
        importString += `{ ${namedImports.join(', ')} }`;
      }
      importString += ` from '${imp.source}';`;
      parts.push(`  ${importString}`);
    });
    if (ast.imports.length > 0) parts.push('');
    ast.props.forEach((prop: any) => {
      const typeAnnotation = prop.typeAnnotation || '';
      parts.push(
        `  export const ${prop.name}${typeAnnotation} = ${prop.value};`,
      );
    });
    parts.push('</script>');
  }
  const templateParts: string[] = [];
  if (ast.head && (ast.head.title || ast.head.meta?.length > 0)) {
    templateParts.push('<svelte:head>');
    if (ast.head.title) {
      templateParts.push(`  <title>${ast.head.title}</title>`);
    }
    ast.head.meta.forEach((meta: any) => {
      templateParts.push(
        `  <meta name="${meta.name}" content="${meta.content}" />`,
      );
    });
    templateParts.push('</svelte:head>');
  }
  ast.template?.forEach((block: any) => {
    switch (block.type) {
      case 'component':
        const propsString = Object.entries(block.props)
          .map(([key, value]) => {
            const valStr = String(value);
            return valStr.startsWith('{') && valStr.endsWith('}')
              ? `${key}=${valStr}`
              : `${key}="${valStr}"`;
          })
          .join(' ');
        templateParts.push(`<${block.name} ${propsString} />`);
        break;
      case 'html':
        templateParts.push(block.content);
        break;
    }
  });
  if (templateParts.length > 0) {
    parts.push('\n' + templateParts.join('\n\n'));
  }
  if (ast.style) {
    parts.push(`\n<style>\n${ast.style}\n</style>`);
  }
  return parts.join('\n');
}

function getLocalTimestamp(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const { filePath, ast } = await request.json();

    if (!filePath || !ast) {
      throw error(400, 'filePath and ast are required.');
    }

    if (!locals.user) {
      throw error(401, 'You must be logged in to save files.');
    }

    if (!hasPermission(locals.user, filePath, 'W')) {
      throw error(403, 'You do not have permission to write to this file.');
    }

    const fileContent = reconstructSvelteFile(ast);
    const dir = path.dirname(filePath);
    const originalFileName = path.basename(filePath);

    const timestamp = getLocalTimestamp(new Date());

    const revisionFileName = `backup-${timestamp}_${originalFileName}`;
    const revisionFilePath = path.join(dir, revisionFileName);

    await rename(path.resolve(filePath), path.resolve(revisionFilePath));
    await writeFile(path.resolve(filePath), fileContent, 'utf-8');

    return json({
      success: true,
      message: `File saved to ${filePath}. Original backed up to ${revisionFilePath}`,
      savedPath: filePath,
      revisionPath: revisionFilePath,
    });
  } catch (e: any) {
    console.error('Error reconstructing or saving Svelte page:', e);
    throw error(500, e.message || 'Failed to save file.');
  }
};