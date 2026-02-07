// FILE: src/routes/svelteframe/lib/AuthHelper.ts
import { error, redirect, type Handle } from '@sveltejs/kit';
import {
  getSession,
  getUserByUsername,
  type User
} from '$routes/svelteframe/lib/server/auth';
import { hasPermission, normalizePath } from '$routes/svelteframe/lib/client/access';
import { debugLog } from '$routes/svelteframe/lib/server/debug';
import { initializeSvelteFrame } from '$routes/svelteframe/lib/server/startup';

const svelteframe_PATH = '/svelteframe';
const LOGIN_PATH = '/svelteframe/auth/login';
const AUTH_PATH_PREFIX = '/svelteframe/auth/';
const LOGOUT_PATH = '/svelteframe/auth/logout';
const API_ROUTE_PREFIX = '/svelteframe/api/';
const TESTPRF_PREFIX = '/svelteframe/testprf';

const svelteframe_EXCEPTIONS = [
  '/svelteframe/portal',
  '/svelteframe/api/protected-files',
  LOGOUT_PATH
];

const ANONYMOUS_AUTH_ROUTES = [
  LOGIN_PATH,
  '/svelteframe/auth/register',
  '/svelteframe/auth/verify-email',
  '/svelteframe/auth/add-device'
];

const ANONYMOUS_API_ROUTES = [
  '/svelteframe/api/user/device-token',
  '/svelteframe/testprf',
  '/svelteframe/testprf/login',
  '/svelteframe/testprf/login/verify',
  '/svelteframe/testprf/register',
  '/svelteframe/testprf/register/verify'
];

function logHeaderSizes(response: Response, event: any) {
  //console.log('Headers:', response.headers);

  // Calculate approximate header size
  let headerSize = 0;
  response.headers.forEach((value, key) => {
    headerSize += key.length + value.length + 4; // 4 for ": " and CRLF
  });

  if (headerSize > 4000) { // 4KB is a common default limit
    console.warn(`⚠️ Large Headers Detected for ${event.url.pathname}: ${headerSize} bytes`);
    // Optional: Log which header is the biggest
    response.headers.forEach((value, key) => {
      if (value.length > 1000) console.warn(`  - ${key}: ${value.length} bytes`);
    });
  }

  return response;
}

const SETUP_PATH = '/svelteframe/setup';
const SETUP_API_PATH = '/svelteframe/setup/confirm';

export const handleAuth: Handle = async ({ event, resolve }) => {
  const { url, cookies, locals } = event;

  console.log('url.pathname:', url.pathname);

  await initializeSvelteFrame();
  const sessionId = cookies.get('sessionId');
  const session = sessionId ? await getSession(sessionId) : null;
  const user = session ? await getUserByUsername(session.username) : null;

  if (
    !url.pathname.startsWith(svelteframe_PATH) &&
    !url.pathname.startsWith('/portal')
  ) {
    if (user) locals.user = user;
    return logHeaderSizes(await resolve(event), event);
  }

  const isAuthPage = url.pathname.startsWith(AUTH_PATH_PREFIX);
  const isSetupPage = url.pathname.startsWith(SETUP_PATH);

  if (isSetupPage) {
    return logHeaderSizes(await resolve(event), event);
  }

  if (session) {
    if (isAuthPage) {
      const isApiEndpoint =
        url.pathname.includes('/generate-options') ||
        url.pathname.includes('/verify-authentication');

      if (url.pathname !== LOGOUT_PATH && !isApiEndpoint) {
        throw redirect(303, '/svelteframe/portal');
      }
    }

    if (!user) {
      cookies.delete('sessionId', { path: '/' });
      if (url.pathname.startsWith(API_ROUTE_PREFIX)) {
        return logHeaderSizes(new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }), event);
      }
      throw redirect(303, LOGIN_PATH);
    }
    const canEditAny = hasPermission(user, 'src/routes/svelteframe/', 'W');
    user.permissions = {
      canEditHtml: canEditAny || hasPermission(user, 'virtual:svelteframe/edit/html', 'W'),
      canEditProps: canEditAny || hasPermission(user, 'virtual:svelteframe/edit/script-props', 'W'),
      canEditStyle: canEditAny || hasPermission(user, 'virtual:svelteframe/edit/style', 'W'),
      // Check if they have general write access to the svelteframe source tree
      canEditSource: canEditAny
    }
    locals.user = user;

    const isApiRoute = url.pathname.startsWith(API_ROUTE_PREFIX);

    if (!isApiRoute) {
      // Determine the type of route we are accessing
      const isPreviewRoute = url.pathname.startsWith('/svelteframe/preview/');
      const isEditorRoute =
        url.pathname === '/svelteframe' ||
        url.pathname === '/svelteframe/' ||
        url.pathname.startsWith('/svelteframe/editor');

      // 1. Determine the logical path for ACL checks (Subject)
      let routePathForAcl = '';

      if (isPreviewRoute) {
        // For preview, the URL contains the target file path after the prefix
        routePathForAcl = url.pathname.substring(
          '/svelteframe/preview/'.length
        );
      } else if (isEditorRoute) {
        // For the editor shell, we check the route file itself initially
        routePathForAcl = `src/routes${url.pathname}/+page.svelte`.replace(
          '//',
          '/'
        );
      } else {
        // Standard Site Route
        routePathForAcl = url.pathname.endsWith('/')
          ? `src/routes${url.pathname}+page.svelte`
          : `src/routes${url.pathname}/+page.svelte`;
      }

      // 2. Check explicit Deny rules on the target path
      const isDenied = user.acl?.some((acl) => {
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

      const isException = svelteframe_EXCEPTIONS.some((p) =>
        url.pathname.startsWith(p)
      );

      // 3. Check for partial access (Granular Editor Modes)
      let isPartialAccessAllowed = false;

      if (isEditorRoute) {
        // Access to the Editor Shell requires ANY of the virtual permissions
        const hasVirtualAccess =
          hasPermission(user, 'virtual:svelteframe/edit/html', 'W') ||
          hasPermission(user, 'virtual:svelteframe/edit/script-props', 'W') ||
          hasPermission(user, 'virtual:svelteframe/edit/style', 'W');

        if (hasVirtualAccess) {
          isPartialAccessAllowed = true;
        }
      } else if (isPreviewRoute) {
        // Access to the Preview requires:
        // 1. ANY of the virtual editing permissions (to allow using the tool)
        // 2. AND Write permission to the SPECIFIC file being previewed

        const hasVirtualAccess =
          hasPermission(user, 'virtual:svelteframe/edit/html', 'W') ||
          hasPermission(user, 'virtual:svelteframe/edit/script-props', 'W') ||
          hasPermission(user, 'virtual:svelteframe/edit/style', 'W');

        if (hasVirtualAccess) {
          // Check if user has permission to the underlying file
          // routePathForAcl was set to the target file path earlier
          if (routePathForAcl && hasPermission(user, routePathForAcl, 'W')) {
            isPartialAccessAllowed = true;
          } else {
            debugLog(
              'DENIED: Preview access denied. User has virtual tools but lacks Write permission for target:',
              routePathForAcl
            );
          }
        }
      }

      if (!isException && !isPartialAccessAllowed) {
        // Fallback: User must have full write access to the route path
        if (!hasPermission(user, routePathForAcl, 'W')) {
          debugLog(
            'DENIED: User does not have write permission for path:',
            routePathForAcl
          );
          throw error(
            403,
            'Access to this part of SvelteFrame requires administrative write permissions.'
          );
        }
      }
    }

    cookies.set('sessionId', sessionId!, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24
    });

    const response = await resolve(event, {
      preloadStrategy: url.pathname.startsWith('/svelteframe/portal') ? 'none' : 'metadata'
    });

    // if (url.pathname.startsWith('/svelteframe/portal')) {
    //   console.log('preloadStrategy:none');
    //   // Generate a dummy string of ~5000 characters
    //   const dummyLink = '<https://example.com/style.css>; rel="preload"; as="style"';
    //   const oversizedHeader = Array(80).fill(dummyLink).join(', ');

    //   response.headers.set('Link', oversizedHeader);
    //   response.headers.set('X-Debug-Header-Size', oversizedHeader.length.toString());
    // }

    // 2. Check if this is the portal route (or apply globally)
    if (event.url.pathname.includes('/svelteframe/portal')) {
      // 3. Create a new Headers object to modify (headers are sometimes immutable)
      const newHeaders = new Headers(response.headers);

      // 4. Delete the offending header
      if (newHeaders.has('link')) {
        console.log(`[Hooks] Stripping Link header of size: ${newHeaders.get('link')?.length}`);
        newHeaders.delete('link');
      }

      // 5. Return the response with the modified headers
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }

    return logHeaderSizes(response, event);
  }

  if (!isAuthPage) {
    if (
      url.pathname.startsWith(API_ROUTE_PREFIX) ||
      url.pathname.startsWith(TESTPRF_PREFIX)
    ) {
      const isAllowedAnonymousApi =
        ANONYMOUS_API_ROUTES.some((p) => url.pathname.startsWith(p)) ||
        (url.pathname === '/svelteframe/api/project-structure' &&
          cookies.get('svelteframe_setup_session'));

      if (isAllowedAnonymousApi) {
        return logHeaderSizes(await resolve(event), event);
      }
      return logHeaderSizes(new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }), event);
    }
    throw redirect(303, LOGIN_PATH);
  }

  const isAllowedAnonymousRoute = ANONYMOUS_AUTH_ROUTES.some((p) =>
    url.pathname.startsWith(p)
  );

  if (!isAllowedAnonymousRoute) {
    const registrationTicket = cookies.get('registration-ticket');
    if (!registrationTicket) {
      throw error(
        403,
        'Access denied. A valid registration session is required.'
      );
    }
  }
  return resolve(event);
};
