// FILE: src/routes/svelteframe/lib/LayoutHelper.ts
// Updated rebranding
import { browser } from '$app/environment';
import { page } from '$app/stores';
import { get } from 'svelte/store';
import { debugLog, debugWarn, debugError } from './server/debug';

const CONTAINER_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, div, li, td, th, section, article'; // Not to the depth of span

interface LayoutState {
  showHeader: boolean;
  showFooter: boolean;
}

// MODIFIED: The function now accepts arguments
export function svelteframeLayoutHelper(
  routeId: string | undefined | null,
  url: URL
): LayoutState {

  if (routeId === undefined || routeId === null) {
    if (browser) {
      //document.URL.href = '/'; // Redirect to the top level if routeId is not defined
      //alert(JSON.stringify(page));
      //window.location.href = '/'; // Redirect to the top level if routeId is not defined
    }
    debugWarn('[SvelteFrame] routeId is undefined or null, returning default layout state.');
    return {
      showHeader: true,
      showFooter: true,
    };
  }

  const state: LayoutState = {
    showHeader: true,
    showFooter: true,
  };
  // REMOVED: The `if (!browser)` check is gone. This logic now runs on both server and client.
  const isPreviewRoute =
    routeId?.includes('/svelteframe/preview') || url.searchParams.has('preview');

  const isEditorRoute = routeId?.includes('/svelteframe/editor');
  if (isPreviewRoute || isEditorRoute) {
    state.showHeader = false;
    // Hide footer in editor so we can render an editable one.
    if (isEditorRoute) {
      state.showFooter = false;
    }
  }

  return state;
}

/**
 * CORRECTED: Scan the page for all components and report a single, representative selector for each.
 * This is used to build the "Next/Prev Component" navigation list. It now finds the
 * first "innermost" container within each component to act as its primary target.
 */
export function scanAndReportComponents() {
  // Use a timeout to ensure the DOM is fully painted, especially on complex pages.
  setTimeout(() => {
    const wrappers = document.querySelectorAll('[data-sp-component]');
    const components: { path: string; selector: string }[] = [];

    wrappers.forEach((wrapper) => {
      const path = wrapper.getAttribute('data-sp-component');
      // Ensure we have a path and the wrapper is a proper element
      if (!path || !(wrapper instanceof HTMLElement)) return;

      // Find all the deepest, most specific editable elements within this component.
      const innermostCandidates = findInnermostContainers(wrapper);

      let targetElement: Element;

      if (innermostCandidates.length > 0) {
        // We have candidates. Use the first one as the representative target for the whole component.
        // This provides a sensible default starting point for editing.
        targetElement = innermostCandidates[0];
      } else {
        // Fallback: if no specific inner tags are found (e.g., an empty component),
        // target the component wrapper itself.
        targetElement = wrapper;
      }

      const selector = getSelector(targetElement);

      components.push({
        path,
        selector,
      });
    });

    debugLog(
      `[SvelteFrame] Scanned page and found ${components.length} components for navigation.`,
      components,
    );

    // Post the list to the parent window (the editor)
    window.parent.postMessage(
      {
        type: 'svelteframe_PAGE_COMPONENTS',
        components,
      },
      '*', // In a real app, you might restrict this to the editor's origin
    );
  }, 100); // 100ms delay as a starting point
}

/**
 * For a given element (like a component wrapper), find all innermost qualifying container tags.
 * An "innermost" tag is one that does not contain any other qualifying container tags.
 */
function findInnermostContainers(wrapper: Element): Element[] {
  const allContainers = wrapper.querySelectorAll(CONTAINER_SELECTOR);
  const innermost: Element[] = [];
  allContainers.forEach((el) => {
    // Only include if it does not contain any other qualifying container
    if (el.querySelector(CONTAINER_SELECTOR) === null) {
      // And only include if it has some actual content (text or an image)
      if (el.textContent?.trim() || el.querySelector('img')) {
        innermost.push(el);
      }
    }
  });
  return innermost;
}

/**
 * MODIFIED: Renamed from initializeClickToEdit to reflect its broader role.
 * Initializes client-side SvelteFrame functionality like click-to-edit
 * and page scanning for the editor.
 */
export function initializeSvelteFrameClient() {
  if (!browser) return;
  const currentPage = get(page);

  // If we're on a SvelteFrame admin route, do nothing.
  if (currentPage.route.id?.startsWith('/svelteframe')) {
    return;
  }

  // NEW: Check if this page is being loaded in a hidden iframe for scanning.
  if (currentPage.url.searchParams.get('sp_scan') === 'true') {
    scanAndReportComponents();
    return; // Don't attach click listeners in scan mode.
  }

  const handleEditClick = (event: MouseEvent) => {
    if (!event.ctrlKey || !event.altKey) return;

    event.preventDefault();
    event.stopPropagation();
    const target = event.target as Node; // Treat as a generic Node first

    debugLog(
      `[SvelteFrame] Ctrl+Alt+click detected. Initial target nodeType: ${target.nodeType}`,
    );
    // BUG FIX: Handle clicks on text nodes (nodeType 3) vs element nodes (nodeType 1)
    let searchStartElement: HTMLElement | null;
    if (target.nodeType === 3) {
      // It's a text node, get its parent element.
      searchStartElement = target.parentElement;
      debugLog(
        '[SvelteFrame] Target was a text node. Using parent element to start search:',
        searchStartElement,
      );
    } else if (target.nodeType === 1) {
      // It's already an element.
      searchStartElement = target as HTMLElement;
      debugLog(
        '[SvelteFrame] Target was an element. Starting search from:',
        searchStartElement,
      );
    } else {
      // Not a target we can work with.
      searchStartElement = null;
    }

    if (!searchStartElement) {
      debugError(
        '[SvelteFrame] Could not determine a valid starting element for search.',
      );
      return;
    }

    const wrapper = searchStartElement.closest('[data-sp-component]');

    if (wrapper) {
      const componentPath = wrapper.getAttribute('data-sp-component');
      if (componentPath) {
        debugLog(`[SvelteFrame] Found component wrapper: ${componentPath}`);
        const editableEl = searchStartElement.closest(
          'p, h1, h2, h3, h4, h5, h6, div, li, td, th, section, article, span',
        );
        if (editableEl instanceof HTMLElement) {
          debugLog('[SvelteFrame] Found editable element:', editableEl);
          const selector = getSelector(editableEl);
          debugLog(`[SvelteFrame] Generated selector: "${selector}"`);

          const returnToPath = window.location.pathname;
          const finalUrl = `/svelteframe/editor?component=${encodeURIComponent(
            componentPath,
          )}&selector=${encodeURIComponent(
            selector,
          )}&returnTo=${encodeURIComponent(returnToPath)}`;
          debugLog(`[SvelteFrame] Redirecting to: ${finalUrl}`);
          window.location.href = finalUrl;
        } else {
          debugError(
            '[SvelteFrame] Could not find a valid editable container element (p, h1, etc.).',
          );
        }
      }
    } else {
      debugLog(
        '[SvelteFrame] Click was not inside a data-sp-component wrapper.',
      );
    }
  };

  document.addEventListener('click', handleEditClick, true);

  return () => {
    document.removeEventListener('click', handleEditClick, true);
  };
}

/**
 * Generates a unique CSS selector path, ignoring Svelte's internal classes.
 */
function getSelector(el: Element | null): string {
  if (!(el instanceof Element)) {
    return '';
  }

  const path: string[] = [];
  let currentEl: Element | null = el;
  while (currentEl && currentEl.nodeName.toLowerCase() !== 'body') {
    let selector = currentEl.nodeName.toLowerCase();
    if (currentEl.className && typeof currentEl.className === 'string') {
      const classes = currentEl.className
        .split(' ')
        .filter((c) => c.trim() && !c.startsWith('s-'));
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }

    const parent = currentEl.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const sameTagSiblings = siblings.filter(
        (sibling) => sibling.nodeName === currentEl.nodeName,
      );
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(currentEl) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    currentEl = currentEl.parentElement;
  }
  return path.join(' > ');
}
