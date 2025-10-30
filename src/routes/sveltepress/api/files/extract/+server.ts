// FILE: src/routes/sveltepress/api/files/extract/+server.ts
import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parse, HTMLElement, Node } from 'node-html-parser';
import type { RequestHandler } from './$types';

/**
 * CORRECTED: Server-side implementation of getSelector. This version safely handles
 * elements that do not have a class attribute, preventing the TypeError.
 */
function getSelector(el: HTMLElement | null): string {
  if (!el) {
    return '';
  }

  const path: string[] = [];
  let currentEl: HTMLElement | null = el;

  while (currentEl && currentEl.parentNode) {
    if (!currentEl.tagName) {
      break;
    }

    let selector = currentEl.tagName.toLowerCase();

    // --- THIS IS THE FIX ---
    // Instead of assuming .classNames is an array, we safely get the class string,
    // check if it exists, and then split and filter it. This mirrors the robust
    // client-side logic and prevents the crash.
    const classString = currentEl.getAttribute('class');
    if (classString) {
      const classes = classString
        .split(' ')
        .filter((c) => c.trim() && !c.startsWith('s-'));
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }
    // --- END OF FIX ---

    const parent = currentEl.parentNode as HTMLElement;
    if (parent && parent.nodeType === 1 && parent.childNodes) {
      const siblings = parent.childNodes.filter(
        (node: Node): node is HTMLElement => node.nodeType === 1,
      );
      const sameTagSiblings = siblings.filter(
        (sibling) => sibling.tagName === currentEl.tagName,
      );

      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(currentEl) + 1;
        if (index > 0) {
          selector += `:nth-of-type(${index})`;
        }
      }
    }

    path.unshift(selector);
    currentEl = parent.nodeType === 1 ? (parent as HTMLElement) : null;
  }
  return path.join(' > ');
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { filePath, selector } = await request.json();
    const content = await readFile(join(process.cwd(), filePath), 'utf-8');
    const root = parse(content, { range: true });

    let foundElement: (HTMLElement & { range: [number, number] }) | null = null;
    let resolvedSelector: string | undefined = undefined;

    if (selector === 'FIRST_SUBSTANTIVE') {
      const containerSelector =
        'p, h1, h2, h3, h4, h5, h6, div, li, td, th, section, article';
      const allContainerTags = root.querySelectorAll(containerSelector);

      const firstInnermostSubstantiveTag = allContainerTags.find((tag) => {
        const hasContent =
          tag.innerText.trim() !== '' || tag.querySelector('img');
        const isInnermost = tag.querySelector(containerSelector) === null;
        return hasContent && isInnermost;
      });

      if (firstInnermostSubstantiveTag) {
        foundElement = firstInnermostSubstantiveTag as HTMLElement & {
          range: [number, number];
        };
        resolvedSelector = getSelector(foundElement);
      }
    } else {
      const selectorParts = selector.split(' > ');
      for (let i = selectorParts.length; i > 0; i--) {
        const subSelector = selectorParts.slice(i - 1).join(' > ');
        try {
          const element = root.querySelector(subSelector);
          if (element) {
            foundElement = element as HTMLElement & { range: [number, number] };
            resolvedSelector = getSelector(foundElement);
            break;
          }
        } catch (e) {
          /* ignore */
        }
      }
    }

    if (!foundElement || !foundElement.range) {
      if (selector === 'FIRST_SUBSTANTIVE') {
        return json(
          {
            error:
              'No editable content (text or images in a container) found in the component.',
          },
          { status: 404 },
        );
      }
      return json({ error: 'Element not found in component' }, { status: 404 });
    }

    const [startIndex, endIndex] = foundElement.range;
    const elementOuterHTML = content.substring(startIndex, endIndex);
    const prefix = content.substring(0, startIndex);
    const suffix = content.substring(endIndex);

    return json({
      success: true,
      outerHTML: elementOuterHTML,
      prefix,
      suffix,
      tagName: foundElement.tagName.toLowerCase(),
      attributes: foundElement.attributes,
      resolvedSelector: resolvedSelector,
    });
  } catch (e: any) {
    console.error('Error in /api/files/extract:', e);
    return json(
      { error: 'Failed to extract element: ' + e.message },
      { status: 500 },
    );
  }
};