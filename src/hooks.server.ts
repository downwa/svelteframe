// FILE: src/hooks.server.ts
//
import 'reflect-metadata';
import { handleAuth } from '$routes/svelteframe/lib/AuthHelper';
import '$routes/svelteframe/lib/server/startup'; // This line runs the startup check
import { startCleanupProcess } from '$lib/server/permitCleanup'; // Import named export

console.log('svelteframe: hooks.server.ts module loaded.');

// This code runs once when the server starts up.
startCleanupProcess();

/**
 * This handle function delegates all SvelteFrame-related authentication
 * and authorization to the AuthHelper library.
 */
export const handle = handleAuth;
