// ----------------------------
// FILENAME: src/routes/svelteframe/api/files/reconstruct-page/+server.ts
// ----------------------------

import { json, error } from '@sveltejs/kit';
import { writeFile } from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';
import { hasPermission } from '$routes/svelteframe/lib/client/access';

function reconstructSvelteFile(ast: any): string {
  const parts: string[] = [];

  // Reconstruct script tag
  if (
    ast.imports?.length > 0 ||
    ast.props?.length > 0 ||
    ast.unmanagedScript?.trim()
  ) {
    parts.push('<script lang="ts">');

    // Add managed imports
    ast.imports.forEach((imp: any) => {
      const typeKeyword = imp.kind === 'type' ? 'type ' : '';
      const defaultImport = imp.specifiers.find(
        (s: any) => s.type === 'ImportDefaultSpecifier',
      )?.name;
      const namedImports = imp.specifiers
        .filter((s: any) => s.type === 'ImportSpecifier')
        .map((s: any) => s.name);

      let importString = 'import ';
      if (typeKeyword) importString += typeKeyword;
      if (defaultImport) importString += defaultImport;
      if (defaultImport && namedImports.length > 0) importString += ', ';
      if (namedImports.length > 0)
        importString += `{ ${namedImports.join(', ')} }`;
      importString += ` from '${imp.source}';`;
      parts.push(`  ${importString}`);
    });

    if (ast.imports.length > 0) parts.push('');

    // Add unmanaged script content (logic, local vars, etc.)
    if (ast.unmanagedScript) {
      parts.push(ast.unmanagedScript);
    }

    // Add managed props (constants)
    ast.props.forEach((prop: any) => {
      const exportPrefix = prop.exported ? 'export ' : '';

      // --- FIX: Ensure the colon is present between the name and typeAnnotation ---
      // The typeAnnotation from parse-page typically contains the leading colon,
      // but we ensure a clean " : " transition if the annotation exists.
      let typePart = '';
      if (prop.typeAnnotation) {
        // If typeAnnotation doesn't already start with a colon, prepend one
        typePart = prop.typeAnnotation.trim().startsWith(':')
          ? prop.typeAnnotation
          : `: ${prop.typeAnnotation}`;
      }

      parts.push(
        `  ${exportPrefix}const ${prop.name}${typePart} = ${prop.value};`,
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
      case 'logic':
      case 'html':
        templateParts.push(block.content);
        break;
    }
  });

  if (templateParts.length > 0) {
    parts.push('\n' + templateParts.join(''));
  }

  if (ast.style) {
    parts.push(`\n<style>\n${ast.style}\n</style>`);
  }

  return parts.join('\n');
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
    const { createBackup } = await import(
      '$routes/svelteframe/lib/server/file-utils'
    );

    const backupPath = await createBackup(filePath);
    await writeFile(path.resolve(filePath), fileContent, 'utf-8');

    return json({
      success: true,
      message: `File saved to ${filePath}. Original backed up to ${backupPath || 'unknown'}`,
      savedPath: filePath,
      revisionPath: backupPath,
    });
  } catch (e: any) {
    console.error('Error reconstructing or saving Svelte page:', e);
    throw error(500, e.message || 'Failed to save file.');
  }
};