// FILE: src/routes/sveltepress/api/project-structure/+server.ts
import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';

const ignoreList = [
  'node_modules',
  '.svelte-kit',
  '.git',
  '.vscode',
  'users',
];

interface FileNode {
  name: string;
  path: string;
  children?: FileNode[];
}

async function getFileTree(dir: string, relativePath = ''): Promise<FileNode[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const dirent of dirents) {
    if (ignoreList.includes(dirent.name)) {
      continue;
    }

    const fullPath = path.join(dir, dirent.name);
    const newRelativePath = path.join(relativePath, dirent.name);

    if (dirent.isDirectory()) {
      const children = await getFileTree(fullPath, newRelativePath);
      // --- FIX: Only include directories that are not empty after filtering ---
      if (children.length > 0) {
        nodes.push({
          name: dirent.name,
          path: newRelativePath.replace(/\\/g, '/'),
          children,
        });
      }
    } else if (dirent.name.endsWith('.svelte')) {
      // --- FIX: Only include files with the .svelte extension ---
      nodes.push({
        name: dirent.name,
        path: newRelativePath.replace(/\\/g, '/'),
      });
    }
  }
  return nodes;
}

export async function GET() {
  const projectRoot = process.cwd();
  const fileTree = await getFileTree(projectRoot);
  return json(fileTree);
}