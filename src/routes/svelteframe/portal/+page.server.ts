// FILE: src/routes/svelteframe/portal/+page.server.ts
import { fail } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import type { PageServerLoad, Actions } from './$types';
import { hasPermission } from '$routes/svelteframe/lib/client/access';
import { debugWarn } from '$routes/svelteframe/lib/server/debug';
import { getUserByUsername, saveUser } from '$routes/svelteframe/lib/server/auth';

// --- FIX: Corrected the path to the protected files directory ---
const protectedDir = path.resolve('data/protected_content');

export const load: PageServerLoad = async ({ locals, fetch, depends }) => {
  // This tells SvelteKit that this data depends on the 'app:portal' identifier.
  // Calling invalidate('app:portal') on the client will now re-run this function.
  depends('app:portal');

  const { user } = locals;
  const canEditHtml = hasPermission(user, 'virtual:svelteframe/edit/html', 'W');
  const canEditProps = hasPermission(user, 'virtual:svelteframe/edit/script-props', 'W');
  const canEditStyle = hasPermission(user, 'virtual:svelteframe/edit/style', 'W');

  const canAccessEditor =
    hasPermission(user, 'src/routes/svelteframe/', 'W') ||
    canEditHtml ||
    canEditProps ||
    canEditStyle;
  const canAccessUserAdmin = hasPermission(user, 'src/routes/svelteframe/useradmin/', 'W');
  const canUploadFiles = hasPermission(user, 'src/routes/svelteframe/portal/', 'W');
  const canAccessMessages = hasPermission(user, 'src/routes/portal/messages/', 'W');
  const canAccessPermits = hasPermission(user, 'src/routes/portal/permits/', 'W');

  let protectedFiles: string[] = [];
  try {
    const res = await fetch('/svelteframe/api/protected-files');
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
    canAccessMessages,
    canAccessPermits,
    protectedFiles,
    user
  };
};

export const actions: Actions = {
  uploadFile: async ({ request, locals }) => {
    const { user } = locals;
    const canUpload = hasPermission(user, 'src/routes/svelteframe/portal/', 'W');

    if (!user || !canUpload) {
      debugWarn('Unauthorized upload attempt by user:', user?.username);
      return fail(403, { error: 'You do not have permission to upload files.' });
    }

    const data = await request.formData();
    const file = data.get('file') as File;

    if (!file || file.size === 0) {
      return fail(400, { error: 'Please select a file to upload.' });
    }

    try {
      // --- FIX: Ensure the directory exists before trying to write to it. ---
      // The { recursive: true } option prevents an error if the directory
      // already exists, making this operation safe to run every time.
      await fs.mkdir(protectedDir, { recursive: true });

      const sanitizedFilename = path.basename(file.name);
      const destinationPath = path.join(protectedDir, sanitizedFilename);
      const buffer = Buffer.from(await file.arrayBuffer());

      // Use atomic write to prevent corruption during upload
      const { writeFileAtomic } = await import('$routes/svelteframe/lib/server/file-utils');
      await writeFileAtomic(destinationPath, buffer);
    } catch (e: any) {
      console.error('File upload failed:', e);
      return fail(500, { error: `Could not save file: ${e.message}` });
    }

    return { success: true, message: `'${file.name}' uploaded successfully.` };
  },

  deleteFile: async ({ request, locals }) => {
    const { user } = locals;
    const canDelete = hasPermission(user, 'src/routes/svelteframe/portal/', 'W');

    if (!user || !canDelete) {
      return fail(403, { error: 'You do not have permission to delete files.' });
    }

    const data = await request.formData();
    const filename = data.get('filename') as string;

    if (!filename) {
      return fail(400, { error: 'Filename was not provided.' });
    }

    const sanitizedFilename = path.basename(filename);
    if (sanitizedFilename !== filename) {
      return fail(400, { error: 'Invalid filename.' });
    }

    const filePath = path.join(protectedDir, sanitizedFilename);

    try {
      await fs.unlink(filePath);
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return fail(404, { error: `'${sanitizedFilename}' not found.` });
      }
      console.error('File deletion failed:', e);
      return fail(500, { error: `Could not delete file: ${e.message}` });
    }

    return { success: true, message: `'${sanitizedFilename}' deleted successfully.` };
  },

  renameFile: async ({ request, locals }) => {
    const { user } = locals;

    const canRename = hasPermission(user, 'src/routes/svelteframe/portal/', 'W');
    if (!user || !canRename) {
      return fail(403, { error: 'You do not have permission to rename files.' });
    }

    const data = await request.formData();
    const oldName = data.get('oldName') as string;
    const newName = data.get('newName') as string;

    if (!oldName || !newName) {
      return fail(400, {
        error: `Both old and new filenames must be provided.  oldName=${oldName}, newName=${newName}`
      });
    }

    const sanitizedOldName = path.basename(oldName);
    const sanitizedNewName = path.basename(newName);

    if (sanitizedOldName !== oldName || sanitizedNewName !== newName) {
      return fail(400, { error: 'Invalid filename.' });
    }

    const oldPath = path.join(protectedDir, sanitizedOldName);
    const newPath = path.join(protectedDir, sanitizedNewName);

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

  updateProfile: async ({ request, locals }) => {
    const { user } = locals;
    if (!user) {
      return fail(401, { error: 'You must be logged in to update your profile.' });
    }

    const data = await request.formData();
    const displayName = data.get('displayName') as string;
    const username = data.get('username') as string;
    const encryptedDataBlob = data.get('encryptedDataBlob') as string | null;
    const encryptedDataIV = data.get('encryptedDataIV') as string | null;

    if (username !== user.username) {
      debugWarn(
        `Profile update mismatch: Session user ${user.username} tried to update ${username}`
      );
      return fail(403, { error: 'You can only update your own profile.' });
    }

    if (!displayName || displayName.trim() === '') {
      return fail(400, { error: 'Display Name cannot be empty.' });
    }

    try {
      const fullUser = await getUserByUsername(user.username);
      if (!fullUser) {
        return fail(404, { error: 'User record not found.' });
      }

      fullUser.displayName = displayName;

      // Store encrypted data if provided
      if (encryptedDataBlob && encryptedDataIV) {
        fullUser.encryptedDataBlob = encryptedDataBlob;
        fullUser.encryptedDataIV = encryptedDataIV;
      }

      await saveUser(fullUser);

      return { success: true, message: 'Profile updated successfully.' };
    } catch (e: any) {
      console.error('Profile update failed:', e);
      return fail(500, { error: `Failed to update profile: ${e.message}` });
    }
  }
};
