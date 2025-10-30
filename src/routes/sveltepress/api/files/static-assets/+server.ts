// FILE: src/routes/sveltepress/api/files/static-assets/+server.ts
import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';

const staticDir = path.resolve('static');

async function getFiles(dir: string, prefix = ''): Promise<string[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      const resWithPrefix = path.join(prefix, dirent.name);
      return dirent.isDirectory() ? getFiles(res, resWithPrefix) : resWithPrefix;
    }),
  );
  return Array.prototype.concat(...files).map(f => f.replace(/\\/g, '/'));
}

export async function GET() {
  try {
    const files = await getFiles(staticDir);
    return json(files);
  } catch (e) {
    // If static dir doesn't exist, return empty array
    return json([]);
  }
}