// FILE: src/routes/sveltepress/portal/+page.server.ts
import { fail } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import type { PageServerLoad, Actions } from './$types';
// --- FIX: Import the hasPermission function to perform granular checks ---
import { hasPermission } from '$routes/sveltepress/lib/AuthHelper';
import { debugWarn } from '$routes/sveltepress/lib/server/debug';

const protectedDir = path.resolve('protected_content');

// This helper is no longer needed here as we use the imported one.
// function normalizePath(p: string): string { ... }

export const load: PageServerLoad = async ({ locals, fetch }) => {
  const { user } = locals;

  // --- FIX: Use hasPermission for independent and accurate checks ---
  // A user can access the main editor if they have Write access to it.
  const canAccessEditor = hasPermission(
    user,
    'src/routes/sveltepress/',
    'W',
  );

  // A user can access user admin if they have Write access to it.
  const canAccessUserAdmin = hasPermission(
    user,
    'src/routes/sveltepress/useradmin/',
    'W',
  );

  // A user can upload files if they have Write access to the portal.
  const canUploadFiles = hasPermission(
    user,
    'src/routes/sveltepress/portal/',
    'W',
  );

  let protectedFiles: string[] = [];
  try {
    const res = await fetch('/sveltepress/api/protected-files');
    if (res.ok) {
      protectedFiles = await res.json();
    }
  } catch (e) {
    console.error('Could not fetch protected files list:', e);
  }

  return {
    displayName: user.displayName,
    canAccessEditor,
    canAccessUserAdmin,
    canUploadFiles,
    protectedFiles,
  };
};

export const actions: Actions = {
  uploadFile: async ({ request, locals }) => {
    const { user } = locals;
    // This check is now also more robust.
    const canUpload = hasPermission(
      user,
      'src/routes/sveltepress/portal/',
      'W',
    );

    if (!user || !canUpload) {
      debugWarn('Unauthorized upload attempt by user:', user?.username);
      // Return a 403 Forbidden response
      return fail(403, { error: 'You do not have permission to upload files.' });
    }

    const data = await request.formData();
    const file = data.get('file') as File;

    if (!file || file.size === 0) {
      return fail(400, { error: 'Please select a file to upload.' });
    }

    const sanitizedFilename = path.basename(file.name);
    const destinationPath = path.join(protectedDir, sanitizedFilename);

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(destinationPath, buffer);
    } catch (e: any) {
      console.error('File upload failed:', e);
      return fail(500, { error: `Could not save file: ${e.message}` });
    }

    return { success: true, message: `'${sanitizedFilename}' uploaded successfully.` };
  },

  // --- NEW: Action to securely delete a protected file ---
  deleteFile: async ({ request, locals }) => {
    // 1. Verify Permissions: User must have upload/write access to the portal.
    const { user } = locals;
    const canDelete = hasPermission(
      user,
      'src/routes/sveltepress/portal/',
      'W',
    );

    if (!user || !canDelete) {
      return fail(403, { error: 'You do not have permission to delete files.' });
    }

    const data = await request.formData();
    const filename = data.get('filename') as string;

    if (!filename) {
      return fail(400, { error: 'Filename was not provided.' });
    }

    // 2. Sanitize Filename: Prevent path traversal attacks.
    const sanitizedFilename = path.basename(filename);
    if (sanitizedFilename !== filename) {
      return fail(400, { error: 'Invalid filename.' });
    }

    const filePath = path.join(protectedDir, sanitizedFilename);

    try {
      // 3. Delete the File
      await fs.unlink(filePath);
    } catch (e: any) {
      // Handle cases where the file might not exist, etc.
      if (e.code === 'ENOENT') {
        return fail(404, { error: `'${sanitizedFilename}' not found.` });
      }
      console.error('File deletion failed:', e);
      return fail(500, { error: `Could not delete file: ${e.message}` });
    }

    return { success: true, message: `'${sanitizedFilename}' deleted successfully.` };
  },
  // --- NEW: Action to securely rename a protected file ---
  renameFile: async ({ request, locals }) => {
    const { user } = locals;

    // 1. Check user has permission to rename files
    const canRename = hasPermission(user, 'src/routes/sveltepress/portal/', 'W');
    if (!user || !canRename) {
      return fail(403, { error: 'You do not have permission to rename files.' });
    }

    // 2. Extract form data
    const data = await request.formData();
    const oldName = data.get('oldName') as string;
    const newName = data.get('newName') as string;

    if (!oldName || !newName) {
      return fail(400, { error: `Both old and new filenames must be provided.  oldName=${oldName}, newName=${newName}` });
    }

    // 3. Sanitize filenames to prevent path traversal
    const sanitizedOldName = path.basename(oldName);
    const sanitizedNewName = path.basename(newName);

    if (sanitizedOldName !== oldName || sanitizedNewName !== newName) {
      return fail(400, { error: 'Invalid filename.' });
    }

    const oldPath = path.join(protectedDir, sanitizedOldName);
    const newPath = path.join(protectedDir, sanitizedNewName);

    // 4. Attempt to rename the file
    try {
      await fs.rename(oldPath, newPath);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return fail(404, { error: `'${sanitizedOldName}' not found.` });
      }
      if (e.code === 'EEXIST') {
        return fail(409, { error: `'${sanitizedNewName}' already exists.` });
      }
      console.error('File rename failed:', e);
      return fail(500, { error: `Could not rename file: ${e.message}` });
    }

    return {
      success: true,
      message: `Successfully renamed '${sanitizedOldName}' to '${sanitizedNewName}'.`
    };
  },  
};