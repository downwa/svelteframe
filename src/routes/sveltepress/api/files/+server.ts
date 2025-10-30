// FILE: src/routes/sveltepress/api/files/+server.ts
import { json, error } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';

type FileEntry = {
  path: string;
  name: string;
  type: 'page' | 'component';
  usedBy?: string[];
};

async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      dirents.map((dirent) => {
        const res = path.resolve(dir, dirent.name);
        const resWithPrefix = prefix
          ? path.join(prefix, dirent.name)
          : dirent.name;
        return dirent.isDirectory()
          ? listFiles(res, resWithPrefix)
          : resWithPrefix;
      }),
    );
    return Array.prototype.concat(...files);
  } catch (e) {
    return [];
  }
}

async function analyzeComponentUsage(
  componentPaths: string[],
  pagePaths: string[],
): Promise<Map<string, string[]>> {
  const usageMap = new Map<string, string[]>();
  const pageContents = await Promise.all(
    pagePaths.map((p) => fs.readFile(p, 'utf-8')),
  );

  for (const componentPath of componentPaths) {
    const componentImportPath = componentPath
      .replace('src/lib/', '$lib/')
      .replace(/\\/g, '/');
    const pagesThatUseIt: string[] = [];

    pagePaths.forEach((pagePath, index) => {
      const content = pageContents[index];
      if (content.includes(componentImportPath)) {
        pagesThatUseIt.push(pagePath);
      }
    });

    if (pagesThatUseIt.length > 0) {
      usageMap.set(componentPath, pagesThatUseIt);
    }
  }
  return usageMap;
}

export async function GET({ locals }) {
  const pagesDir = path.resolve('src/routes');
  const componentsDir = path.resolve('src/lib/components');

  const allRouteFiles = await listFiles(pagesDir, 'src/routes');
  const allLibComponents = await listFiles(
    componentsDir,
    'src/lib/components',
  );

  // POINT 14: Discover local components (starting with _)
  const localComponents: string[] = [];
  const pages: string[] = [];

  allRouteFiles.forEach((p) => {
    const isSveltepressFile = p.replace(/\\/g, '/').startsWith('src/routes/sveltepress');
    const isBackupFile = path.basename(p).startsWith('backup-');
    const isLocalComponent = path.basename(p).startsWith('_') && p.endsWith('.svelte');

    if (isSveltepressFile || isBackupFile) {
      return;
    }

    if (isLocalComponent) {
      localComponents.push(p);
    } else {
      pages.push(p);
    }
  });

  const filteredLibComponents = allLibComponents.filter(
    (p) => !path.basename(p).startsWith('backup-'),
  );

  const allComponents = [...filteredLibComponents, ...localComponents];

  const usageMap = await analyzeComponentUsage(allComponents, pages);

  const formattedComponents = formatFileEntries(
    allComponents,
    'component',
    usageMap,
  );
  const formattedPages = formatFileEntries(pages, 'page');

  return json({
    pages: formattedPages,
    components: formattedComponents,
  });
}

function formatFileEntries(
  paths: string[],
  type: 'page' | 'component',
  usageMap?: Map<string, string[]>,
): FileEntry[] {
  return paths
    .filter((p) => p.endsWith('.svelte'))
    .map((p) => {
      const normalizedPath = p.replace(/\\/g, '/');
      const entry: FileEntry = {
        path: normalizedPath,
        name: path.basename(normalizedPath),
        type,
      };
      if (type === 'component' && usageMap?.has(normalizedPath)) {
        entry.usedBy = usageMap.get(normalizedPath);
      }
      return entry;
    });
}

// POINT 11: Add a new POST handler for restoring backups
export async function POST({ request }) {
  const { action, filePath, backupFile } = await request.json();

  if (action === 'restore') {
    try {
      const fullPath = path.resolve(filePath);
      const dir = path.dirname(fullPath);
      const backupPath = path.resolve(dir, backupFile);

      // 1. Create a new backup of the current file
      const now = new Date();
      const timestamp = now
        .toISOString()
        .slice(0, 19)
        .replace('T', '_')
        .replace(/:/g, '-');
      const newBackupName = `backup-${timestamp}_${path.basename(filePath)}`;
      const newBackupPath = path.resolve(dir, newBackupName);

      await fs.rename(fullPath, newBackupPath);

      // 2. Copy the selected backup to the original filename
      await fs.copyFile(backupPath, fullPath);

      return json({ success: true, message: `Restored ${filePath} from ${backupFile}.` });
    } catch (e: any) {
      console.error('Restore error:', e);
      throw error(500, `Failed to restore file: ${e.message}`);
    }
  }

  return json({ success: false, message: 'Invalid action.' }, { status: 400 });
}