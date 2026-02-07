// FILE: src/routes/svelteframe/api/project-structure/+server.ts
import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
//import { dev } from '$app/environment';
//import { hasPermission } from '$routes/svelteframe/lib/client/access';
import mime from 'mime';
import os from 'os'; // Import the os module

const topLevelIgnoreList = [
  'node_modules',
  '.svelte-kit',
  '.git',
  '.vscode',
  'users',
  'data',
  'protected_content',
  'scripts',
  'build',
];

interface FileNode {
  name: string;
  path: string;
  children?: FileNode[];
}

function getExtensionsForMimes(mimeTypes: string[]): string[] {
  if (!mimeTypes || mimeTypes.length === 0) {
    return ['.svelte'];
  }

  const extensions: string[] = [];

  if (mimeTypes.includes('application/svelte') || mimeTypes.includes('text/svelte')) {
    extensions.push('.svelte');
  }

  mimeTypes.forEach((type) => {
    // Handle generic 'image/' wildcard
    if (type === 'image/') {
      ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'].forEach(
        (ext) => extensions.push(ext)
      );
    } else {
      const ext = mime.getExtension(type);
      if (ext) extensions.push(`.${ext}`);
      if (type === 'image/jpeg') extensions.push('.jpg');
    }
  });

  return extensions;
}

/**
 * @param dir The actual filesystem directory to scan
 * @param allowedExtensions List of extensions to include
 * @param relativePath The path prefix to show in the UI (e.g., "/" or "src/lib")
 * @param isRoot Whether this is the top level of the recursion
 */
// ... (imports remain)

// ... (getFileTree signature updated)
async function getFileTree(
  dir: string,
  allowedExtensions: string[],
  filter: (path: string) => boolean = () => true, // Keep filter param support but default true
  relativePath = '',
  isRoot = true
): Promise<FileNode[]> {
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    // console.log(`[API] readdir(${dir}) found ${dirents.length} items`);
    const nodes: FileNode[] = [];

    for (const dirent of dirents) {
      if (isRoot && topLevelIgnoreList.includes(dirent.name)) {
        continue;
      }

      // 2. HIDDEN FILE FILTER: Skip any file or directory starting with a dot
      // This covers .git, .vscode, .svelte-kit, .env, etc.
      if (dirent.name.startsWith('.')) {
        continue;
      }

      // (Legacy check just in case Thumbs.db/DS_Store are missed by the dot check)
      if (dirent.name === 'Thumbs.db') {
        continue;
      }

      const fullPath = path.join(dir, dirent.name);

      // Construct the web-accessible path
      const nextRelativePath = relativePath === '/'
        ? `/${dirent.name}`
        : path.join(relativePath, dirent.name);

      if (dirent.isDirectory()) {
        // Pass filter down
        const children = await getFileTree(fullPath, allowedExtensions, filter, nextRelativePath, false);
        // NEW: include folder if it has children OR if we are in "folder only" mode (empty allowedExtensions)
        if (children.length > 0 || allowedExtensions.length === 0) {
          const webPath = nextRelativePath.replace(/\\/g, '/');
          // console.log(`[API] pushing dir node: ${dirent.name} -> ${webPath}`);
          nodes.push({
            name: dirent.name,
            path: webPath,
            children,
          });
        }
      } else {
        const ext = path.extname(dirent.name).toLowerCase();
        if (allowedExtensions.includes(ext)) {
          // NEW: Check filter
          // normalize path for permission check? hasPermission expects relevant path.
          // fullPath is absolute system path. hasPermission usually takes project-relative path like 'src/routes/...'
          // We should pass the relative path (nextRelativePath) to hasPermission, but stripped of leading slash?
          // AuthHelper.ts normalizePath handles leading slash.
          // But let's verify what hasPermission expects. 
          // It expects a path that matches ACL entries (e.g. 'src/routes/foo').
          // nextRelativePath is '/src/routes/foo'.

          // Allow filter to handle path normalization if needed.
          // We pass 'nextRelativePath' which is web-style path.
          if (filter(nextRelativePath)) {
            nodes.push({
              name: dirent.name,
              path: nextRelativePath.replace(/\\/g, '/'),
            });
          }
        }
      }
    }
    return nodes;
  } catch (e) {
    console.warn(`Could not read directory ${dir}:`, e);
    return [];
  }
}

export async function GET({ url, cookies, locals }) {
  const typesParam = url.searchParams.get('types');
  const requestedMimes = typesParam ? typesParam.split(',') : [];
  const folderOnly = typesParam === '__FOLDER_ONLY__';

  let baseDirParam = url.searchParams.get('baseDir') || '.';
  const absolutePathParam = url.searchParams.get('absolutePath');

  // --- NEW PERMISSION CHECK ---
  // Security: only allow absolute path if:
  // 1. A setup session is active (initial installation)
  // 2. OR the user is authenticated as a SuperAdmin  const setupSession = cookies.get('svelteframe_setup_session');
  const setupSession = cookies.get('svelteframe_setup_session');
  const { hasPermission } = await import('$routes/svelteframe/lib/client/access');
  const isSuperAdmin = locals.user && hasPermission(locals.user, 'virtual:superadmin', 'W');
  console.log('[API] setupSession:', setupSession);
  if (absolutePathParam && !setupSession && !isSuperAdmin) {
    console.warn('[API] 401: Unauthorized absolute path access');
    return json(
      { error: 'Unauthorized absolute path access. Requires SuperAdmin permissions.' },
      { status: 401 }
    );
  }

  console.log('[API] baseDirParam:', baseDirParam, 'absolutePathParam:', absolutePathParam);

  if (baseDirParam.includes('..')) baseDirParam = '.';

  const allowedExtensions = folderOnly ? [] : getExtensionsForMimes(requestedMimes);

  // --- ACL Logic ---
  const isSvelteRequest = requestedMimes.length === 0 || requestedMimes.some(m => m.includes('svelte'));
  const isImageRequest = requestedMimes.some(m => m.startsWith('image/'));

  if (isSvelteRequest && !isImageRequest && !absolutePathParam) {
    if (!locals.user) {
      return json([]);
    }
  }

  try {
    let scanRoot;
    let webPrefix = '';

    if (absolutePathParam) {
      // If the client sends "~", resolve it to the OS home directory
      const rawPath = absolutePathParam === '~' ? os.homedir() : absolutePathParam;
      scanRoot = path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);
    } else {
      // Default project-relative logic
      const projectRoot = process.cwd();
      scanRoot = path.join(projectRoot, baseDirParam);
      if (baseDirParam === 'static' || baseDirParam === './static') webPrefix = '/';
    }

    const fileTree = await getFileTree(scanRoot, allowedExtensions, () => true, webPrefix);
    return json(fileTree);
  } catch (error) {
    return json([]);
  }
}
