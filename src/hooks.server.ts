// FILE: src/hooks.server.ts
import { handleAuth } from '$routes/sveltepress/lib/AuthHelper';
import '$routes/sveltepress/lib/server/startup'; // This line runs the startup check

/**
 * This handle function delegates all SveltePress-related authentication
 * and authorization to the AuthHelper library.
 */
export const handle = handleAuth;