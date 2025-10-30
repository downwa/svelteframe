// FILE: src/routes/sveltepress/lib/AuthHelper.ts
import { error, redirect, type Handle } from '@sveltejs/kit';
import {
  getSession,
  getUserByUsername,
  type User,
} from '$routes/sveltepress/lib/server/auth';
import { debugLog } from '$routes/sveltepress/lib/server/debug';
import { env } from '$env/dynamic/private';
import fs from 'fs/promises';
import { initializeSveltePress } from '$routes/sveltepress/lib/server/startup';

const SVELTEPRESS_PATH = '/sveltepress';
const LOGIN_PATH = '/sveltepress/auth/login';
const AUTH_PATH_PREFIX = '/sveltepress/auth/';
const LOGOUT_PATH = '/sveltepress/auth/logout';
const CONFIRMATION_FILE = '0-SveltePress-Admin.confirm';

const SVELTEPRESS_EXCEPTIONS = [
  '/sveltepress/portal',
  '/sveltepress/api/protected-files',
  LOGOUT_PATH,
];

// --- NEW: Define which auth routes are "public" for anonymous users ---
const ANONYMOUS_AUTH_ROUTES = [
  LOGIN_PATH, // The login page and its API endpoints
  '/sveltepress/auth/register', // The main registration page
  '/sveltepress/auth/verify-email', // The target of the verification link
];

function normalizePath(p: string): string {
  let norm = p.replace(/\\/g, '/');
  if (norm.startsWith('src/')) {
    norm = norm.substring(3);
  }
  if (!norm.startsWith('/')) {
    norm = '/' + norm;
  }
  return norm;
}

export function hasPermission(
  user: User,
  targetPath: string,
  requiredPermission: 'R' | 'W',
): boolean {
  if (!user?.acl) return false;
  const normalizedTargetPath = normalizePath(targetPath);
  let hasRead = false;
  let hasWrite = false;

  for (const acl of user.acl) {
    if (acl.permission !== 'D') continue;
    const normalizedAclPath = normalizePath(acl.path);
    const isDirectoryRule = normalizedAclPath.endsWith('/');
    if (isDirectoryRule) {
      if (normalizedTargetPath.startsWith(normalizedAclPath)) return false;
    } else {
      if (normalizedTargetPath === normalizedAclPath) return false;
    }
  }

  debugLog('Checking user acl:', user.acl,'required permission:', requiredPermission, 'for path:', normalizedTargetPath);
  for (const acl of user.acl) {
    const normalizedAclPath = normalizePath(acl.path);
    const isDirectoryRule = normalizedAclPath.endsWith('/');
    let match = false;
    if (isDirectoryRule) {
      if (normalizedTargetPath.startsWith(normalizedAclPath)) match = true;
    } else {
      if (normalizedTargetPath === normalizedAclPath) match = true;
    }
    if (match) {
      if (acl.permission === 'W') hasWrite = true;
      if (acl.permission === 'R') hasRead = true;
    }
  }

  if (requiredPermission === 'W') return hasWrite;
  if (requiredPermission === 'R') return hasWrite || hasRead;
  return false;
}

export const handleAuth: Handle = async ({ event, resolve }) => {
  const { url, cookies, locals } = event;

  debugLog('Handling request for:', url.pathname, env.ADMINUSER ? '; has admin user' : '; no admin user');
  if (!env.ADMINUSER) {
    if (!event.url.pathname.startsWith(SVELTEPRESS_PATH+'/setup')) {
      debugLog('No admin user found, redirecting to setup page.');
      throw redirect(303, SVELTEPRESS_PATH+'/setup');
    }
    debugLog('No admin user found, resolving event.');
    return resolve(event);
  }
  else { // Admin user exists, but if confirmation file exists we should inform the user of confirmation, and delete it
    try {
      await fs.access(CONFIRMATION_FILE);
      debugLog('Confirmation file found, deleting it.');
      await fs.unlink(CONFIRMATION_FILE);
      await initializeSveltePress();
      return new Response('<h1>Confirmation file validated and removed.<br>Please check your email for activation link.</h1>', 
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html'
          }
        }
      );
    } catch (err) { // No error if file does not exist
      //debugLog('Confirmation file not found or could not be deleted.',err);
    }
  }

  if (!url.pathname.startsWith(SVELTEPRESS_PATH)) {
    return resolve(event);
  }

  const sessionId = cookies.get('sessionId');
  const session = sessionId ? getSession(sessionId) : null;
  const isAuthPage = url.pathname.startsWith(AUTH_PATH_PREFIX);

  // --- STATE 1: AUTHENTICATED USER (has a session) ---
  if (session) {
    if (isAuthPage) {
      // A logged-in user should not be on any auth pages, except to log out.
      if (url.pathname !== LOGOUT_PATH) {
        debugLog('Redirecting authenticated user from auth page to portal.');
        throw redirect(303, '/sveltepress/portal');
      }
    }

    const user = await getUserByUsername(session.username);
    if (!user) {
      cookies.delete('sessionId', { path: '/' });
      debugLog('Session user not found, redirecting to login.');
      throw redirect(303, LOGIN_PATH);
    }
    locals.user = user;

    const routePathForAcl = url.pathname.endsWith('/')
      ? `src/routes${url.pathname}+page.svelte`
      : `src/routes${url.pathname}/+page.svelte`;

    const isDenied = user.acl.some((acl) => {
      if (acl.permission !== 'D') return false;
      const normalizedAclPath = normalizePath(acl.path);
      const normalizedCheckPath = normalizePath(routePathForAcl);
      const isDirectoryRule = normalizedAclPath.endsWith('/');
      if (isDirectoryRule) {
        return normalizedCheckPath.startsWith(normalizedAclPath);
      } else {
        return normalizedCheckPath === normalizedAclPath;
      }
    });

    if (isDenied) {
      debugLog('DENIED: User ACL:', user.acl);
      throw error(403, 'Access to this page is explicitly denied.');
    }

    const isException = SVELTEPRESS_EXCEPTIONS.some((p) =>
      url.pathname.startsWith(p),
    );

    if (!isException) {
      if (!hasPermission(user, routePathForAcl, 'W')) {
        debugLog(
          'DENIED: User does not have write permission for path:',
          routePathForAcl,
        );
        throw error(
          403,
          'Access to this part of SveltePress requires administrative write permissions.',
        );
      }
    }

    cookies.set('sessionId', sessionId!, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24,
    });

    return resolve(event);
  }

  // --- STATE 2 & 3: ANONYMOUS or REGISTERING USER (no session) ---

  // If the user is trying to access a protected page that ISN'T an auth page,
  // they must log in.
  if (!isAuthPage) {
    debugLog('Redirecting anonymous user to login page.');
    throw redirect(303, LOGIN_PATH);
  }

  // The user IS on an auth page. Now we must enforce the ticket rule.
  const isAllowedAnonymousRoute = ANONYMOUS_AUTH_ROUTES.some((p) =>
    url.pathname.startsWith(p),
  );

  // If the route is NOT one of the "public" auth routes...
  if (!isAllowedAnonymousRoute) {
    // ...then it MUST be a sensitive registration API endpoint.
    // It requires the registration ticket.
    const registrationTicket = cookies.get('registration-ticket');
    if (!registrationTicket) {
      debugLog('No registration ticket found, redirecting to login.');
      // No session, no ticket, trying to hit a sensitive API. FORBIDDEN.
      throw error(403, 'Access denied. A valid registration session is required.');
    }
  }

  // If we get here, the user is either:
  // 1. On an allowed anonymous page (login, register page, verify link).
  // 2. On a sensitive registration API but HAS the required ticket.
  // In either case, we let the request proceed to the endpoint for further validation.
  debugLog('RESOLVE: Handling request for:', url.pathname);
  return resolve(event);
};