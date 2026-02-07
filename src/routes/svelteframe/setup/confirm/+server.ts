import { json, type RequestHandler } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { mergeFile } from '../merge-helper';

const CONFIRMATION_FILE = '0-SvelteFrame-Admin.confirm';

// Helper to copy directory recursively
async function copyDir(src: string, dest: string) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

function ensureEnvVar(env: string, key: string, value: string): string {
  if (value === undefined || value === null) return env;

  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const newLine = `${key}="${value}"`;

  if (env.match(pattern)) {
    // Replace existing variable
    return env.replace(pattern, newLine);
  }

  // Append new variable
  if (env.length && !env.endsWith('\n')) env += '\n';
  env += `${newLine}\n`;
  return env;
}

function addValuesToEnv(vars: Record<string, string>) {
  const envPath = path.resolve('.env');
  let env = '';
  if (fs.existsSync(envPath)) {
    env = fs.readFileSync(envPath, 'utf-8');
  }

  for (const [key, value] of Object.entries(vars)) {
    env = ensureEnvVar(env, key, value);
  }

  // Atomic write to prevent corruption
  const { writeFileAtomicSync } = require(path.resolve('site/src/routes/svelteframe/lib/server/file-utils.ts'));
  writeFileAtomicSync(envPath, env, 'utf-8');
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  const data = await request.formData();
  const action = data.get('action')?.toString() || 'legacy';

  if (action === 'auth') {
    const uploaded = data.get('file');
    if (!uploaded || !(uploaded instanceof File)) {
      return json({ message: 'Missing or invalid confirmation file' }, { status: 400 });
    }

    const confirmationPath = path.resolve(CONFIRMATION_FILE);
    if (!fs.existsSync(confirmationPath)) {
      return json({ message: 'Confirmation file not found on server' }, { status: 500 });
    }

    const uploadedBuffer = Buffer.from(await uploaded.arrayBuffer());
    const originalBuffer = fs.readFileSync(confirmationPath);

    if (!uploadedBuffer.equals(originalBuffer)) {
      return json({ message: 'File does not match!' }, { status: 400 });
    }

    // Auth successful, set session cookie
    cookies.set('svelteframe_setup_session', 'authenticated', {
      path: '/svelteframe',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 2 // 2 hours
    });

    return json({ success: true, message: 'Authenticated' });
  }

  // Actions below require authentication
  const session = cookies.get('svelteframe_setup_session');
  if (!session && action !== 'legacy') {
    return json({ message: 'Session expired or unauthorized' }, { status: 401 });
  }

  if (action === 'save' || action === 'legacy') {
    const varsToAdd: Record<string, string> = {};
    const keys = [
      'ADMINUSER',
      'MAIL_SERVER',
      'MAIL_PORT',
      'MAIL_USER',
      'MAIL_PASS',
      'EMAIL_FROM_ADDRESS',
      'ADMIN_DISPLAY_NAME',
      'RPID',
      'ORIGINPORT',
      'ORIGIN',
      'PUBLIC_CKEDITOR_LICENSE_KEY',
      'NODE_ENV',
      'PUBLIC_TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
      'BREVO_API_KEY',
      'BREVO_SMTP_KEY',
      'MSGRAPH_SECRET',
      'MSGRAPH_APPID',
      'MSGRAPH_TENID',
      'OPENROUTER_API_KEY',
      'PUBLIC_SITE_URL',
      'PUBLIC_SITE_NAME'
    ];

    for (const key of keys) {
      const val = data.get(key);
      if (val !== null) {
        varsToAdd[key] = val.toString().trim();
      }
    }

    addValuesToEnv(varsToAdd);

    return json({
      success: true,
      message: 'Configuration saved to .env'
    });
  }

  if (action === 'integrate') {
    const targetPath = data.get('targetPath')?.toString();
    if (!targetPath) return json({ message: 'Target path required' }, { status: 400 });

    const absoluteTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(targetPath);
    if (!fs.existsSync(absoluteTarget))
      return json({ message: 'Target directory not found' }, { status: 404 });

    // Preview changes for root files
    const rootFiles = [
      'package.json',
      'hooks.server.ts',
      'tsconfig.json',
      'vite.config.ts',
      'tailwind.config.js'
    ];
    const results = [];

    for (const file of rootFiles) {
      const srcPath = path.resolve(file);
      if (fs.existsSync(srcPath)) {
        const res = await mergeFile(srcPath, absoluteTarget, file);
        results.push(res);
      }
    }

    const routesPath = path.join(absoluteTarget, 'src/routes');
    const otherRoutes: string[] = [];
    if (fs.existsSync(routesPath)) {
      const entries = fs.readdirSync(routesPath);
      for (const entry of entries) {
        if (entry !== 'svelteframe' && fs.statSync(path.join(routesPath, entry)).isDirectory()) {
          otherRoutes.push(entry);
        }
      }
    }

    return json({ success: true, results, otherRoutes });
  }

  if (action === 'apply-integration') {
    const targetPath = data.get('targetPath')?.toString();
    const approvedFiles = JSON.parse(data.get('approvedFiles')?.toString() || '[]');

    if (!targetPath) return json({ message: 'Target path required' }, { status: 400 });
    const absoluteTarget = path.isAbsolute(targetPath) ? targetPath : path.resolve(targetPath);
    const cleanInstall = data.get('cleanInstall') === 'true';

    if (cleanInstall) {
      console.log(`[API] Cleaning target directory (protecting .git): ${absoluteTarget}`);
      const entries = fs.readdirSync(absoluteTarget);
      for (const entry of entries) {
        if (entry === '.git') {
          console.log(`[API] Skipping protected path: ${entry}`);
          continue;
        }
        const entryPath = path.join(absoluteTarget, entry);
        try {
          if (fs.statSync(entryPath).isDirectory()) {
            console.log(`[API] Deleting directory: ${entry}`);
            fs.rmSync(entryPath, { recursive: true, force: true });
          } else {
            console.log(`[API] Deleting file: ${entry}`);
            fs.unlinkSync(entryPath);
          }
        } catch (e) {
          console.warn(`[API] Error removing ${entry}:`, e);
        }
      }
    }

    // 1. Copy routes/svelteframe
    await copyDir('src/routes/svelteframe', path.join(absoluteTarget, 'src/routes/svelteframe'));

    // 2. Copy shared libs
    await copyDir('src/lib/portal-actions', path.join(absoluteTarget, 'src/lib/portal-actions'));

    // 3. Apply approved merges
    for (const fileResult of approvedFiles) {
      if (fileResult.diff && fileResult.status === 'merged') {
        fs.writeFileSync(path.join(absoluteTarget, fileResult.file), fileResult.diff);
      } else if (fileResult.status === 'new') {
        const srcPath = path.resolve(fileResult.file);
        fs.copyFileSync(srcPath, path.join(absoluteTarget, fileResult.file));
      }
    }

    return json({ success: true, message: 'Integration complete!' });
  }

  return json({ message: 'Invalid action' }, { status: 400 });
};
