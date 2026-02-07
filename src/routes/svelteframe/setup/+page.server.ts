// +server.ts
import type { PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CONFIRMATION_FILE = '0-SvelteFrame-Admin.confirm';

export const load: PageServerLoad = async ({ cookies }) => {
  console.log('Generating admin confirmation key...');
  const key = crypto.randomBytes(24).toString('hex');
  const content = `Admin confirmation key: ${key}`;
  const filePath = path.resolve(CONFIRMATION_FILE);
  fs.writeFileSync(filePath, content);

  // Read existing .env for pre-filling
  const envPath = path.resolve('.env');
  const env: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w]+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match) {
        env[match[1]] = match[2];
      }
    }
  }

  // Check if session cookie exists
  const session = cookies.get('svelteframe_setup_session');

  return {
    key: JSON.stringify({ key }),
    env,
    isAuthenticated: !!session,
    projectRoot: process.cwd()
  };
};
