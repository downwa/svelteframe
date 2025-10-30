// FILE: src/routes/sveltepress/lib/server/debug.ts
// Debug utility for SveltePress routes (client-side usage only)
const DEBUG = true;

function getTimestamp(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * An internal helper function to get the caller's file and line number from the stack trace.
 * @returns A formatted string like `[MyComponent.svelte:42]` or `[unknown]` if it can't be determined.
 */
function getCallerInfo(): string {
  const err = new Error();
  if (!err.stack) {
    return '[unknown]';
  }

  const stackLines = err.stack.split('\n');
  const callerLine = stackLines[4];

  if (!callerLine) {
    return '[unknown]';
  }

  // Extract the path, which is usually inside parentheses or after "at "
  const pathMatch = callerLine.match(/\((.*?)\)| at (.*?)$/);
  if (!pathMatch) {
    return '[unknown]';
  }

  // The actual path is in one of the capture groups
  const fullPath = (pathMatch[1] || pathMatch[2] || '').replace(/\?.*$/, '');

  // Extract the line number
  const lineMatch = fullPath.match(/:(\d+):\d+\)$/);
  const line = lineMatch ? lineMatch[1] : '';

  // Split the path to analyze the filename and parent directory
  const pathParts = fullPath.split('/');
  const fileName = pathParts[pathParts.length - 1].split(':')[0];
  const parentDir = pathParts[pathParts.length - 2] || 'root';

  let display = fileName;

  // --- NEW SVELTEKIT-SPECIFIC FORMATTING ---
  switch (fileName) {
    case '+page.svelte':
      display = `${parentDir}+P`;
      break;
    case '+server.ts':
      display = `${parentDir}+S`;
      break;
    case '+layout.svelte':
      display = `${parentDir}+L`;
      break;
    // Default case is handled by the initial `display = fileName`
  }

  return `[${display}:${line}]`;
}

function getLogPrefix(): string {
  return `${getTimestamp()} ${getCallerInfo()}`;
}

export function isDebug(): boolean {
  if (typeof window === 'undefined') return DEBUG;
  return (
    new URLSearchParams(window.location.search).get('debug') === 'true' || DEBUG
  );
}

export function debugLog(...args: any[]) {
  if (isDebug()) {
    console.log(getLogPrefix(), ...args);
  }
}

export function debugWarn(...args: any[]) {
  if (isDebug()) {
    console.warn(getLogPrefix(), ...args);
  }
}

export function debugError(...args: any[]) {
  // Always log errors, but only add the detailed caller info when in debug mode.
  if (isDebug()) {
    console.error(getLogPrefix(), ...args);
  } else {
    console.error(...args);
  }
}