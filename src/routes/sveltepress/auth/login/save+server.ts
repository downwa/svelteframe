// src/routes/sveltepress/auth/login/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  console.log(process.cwd()); // Prints the server's current working directory
  return new Response('Check the server logs for the working directory.');
};
