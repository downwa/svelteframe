// +server.ts
import type { PageServerLoad } from './$types';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CONFIRMATION_FILE = '0-SveltePress-Admin.confirm';

export const load: PageServerLoad = async () => {
  console.log('Generating admin confirmation key...');
  const key = crypto.randomBytes(24).toString('hex');
  const content = `Admin confirmation key: ${key}`;
  const filePath = path.resolve(CONFIRMATION_FILE);
  fs.writeFileSync(filePath, content);
  return {
    key: JSON.stringify({ key }),
  };
};