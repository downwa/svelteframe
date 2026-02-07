// FILE: src/routes/svelteframe/api/protected-files/+server.ts
import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';

const protectedDir = path.resolve('data/protected_content');

export async function GET() {
  // Access to this API is already protected by the hook in AuthHelper.ts
  try {
    const dirents = await fs.readdir(protectedDir, { withFileTypes: true });
    const files = dirents
      .filter((dirent) => dirent.isFile() && !dirent.name.startsWith('.'))
      .map((dirent) => dirent.name);
    return json(files);
  } catch (e) {
    // If the directory doesn't exist, return an empty array.
    return json([]);
  }
}
