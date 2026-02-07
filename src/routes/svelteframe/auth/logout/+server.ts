// FILE: src/routes/svelteframe/auth/logout/+server.ts
import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {

    console.log('User requested logout');
  // Delete the session cookie
  cookies.delete('sessionId', { path: '/' });

  // Redirect the user to the login page after logging out
  throw redirect(303, '/svelteframe/auth/login');
};

export const GET: RequestHandler = POST;
