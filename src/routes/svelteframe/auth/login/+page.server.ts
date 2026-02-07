// FILE: src/routes/svelteframe/auth/login/+page.server.ts
import path from 'path';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const cwd = process.cwd();
  const siteName = path.basename(cwd);
  return {
    siteName,
  };
};
