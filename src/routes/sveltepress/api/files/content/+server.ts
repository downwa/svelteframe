// FILE: src/routes/sveltepress/api/files/content/+server.ts
import { promises as fs } from 'fs';
import path from 'path';
import { json, error } from '@sveltejs/kit';
import { hasPermission } from '$routes/sveltepress/lib/AuthHelper';

// GET /sveltepress/api/files/content?path=<filepath>
export async function GET({ url, locals }) {
  const filePath = url.searchParams.get('path');
  if (!filePath) {
    throw error(400, 'File path is required');
  }

  if (!locals.user) {
    throw error(401, 'You must be logged in to view files.');
  }

  if (!hasPermission(locals.user, filePath, 'R')) {
    throw error(403, 'You do not have permission to read this file.');
  }

  try {
    const content = await fs.readFile(path.resolve(filePath), 'utf-8');
    return new Response(content, {
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (e) {
    throw error(404, 'File not found');
  }
}

// POST /sveltepress/api/files/content
export async function POST({ request, locals }) {
  const { path: filePath, content } = await request.json();
  if (!filePath || content === undefined) {
    throw error(400, 'File path and content are required');
  }

  if (!locals.user) {
    throw error(401, 'You must be logged in to save files.');
  }

  if (!hasPermission(locals.user, filePath, 'W')) {
    throw error(403, 'You do not have permission to write to this file.');
  }

  try {
    await fs.writeFile(path.resolve(filePath), content, 'utf-8');
    return json({ success: true });
  } catch (e) {
    throw error(500, 'Failed to save file');
  }
}