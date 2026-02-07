// FILE: src/routes/svelteframe/api/protected-files/[...filepath]/+server.ts
import { error } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

const protectedDir = path.resolve('data/protected_content');

// A simple map for common file types.
const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
};

export const GET: RequestHandler = async ({ params }) => {
  const filename = params.filepath;
  const fullPath = path.join(protectedDir, filename);

  // --- SECURITY CHECK: Prevent Path Traversal ---
  // Ensure the resolved path is still within the protected directory.
  if (!path.resolve(fullPath).startsWith(protectedDir)) {
    throw error(403, 'Forbidden');
  }

  try {
    const stats = await fs.stat(fullPath);
    const fileBuffer = await fs.readFile(fullPath);
    const fileExtension = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[fileExtension] || 'application/octet-stream';

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
        // This header prompts the browser to download the file
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    // If fs.stat or fs.readFile fails, the file likely doesn't exist.
    throw error(404, 'File not found');
  }
};
