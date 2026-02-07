// FILE: src/routes/svelteframe/api/files/extract/+server.ts
import { json } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types';
//import { parse, HTMLElement, Node } from 'node-html-parser';
//import type { HTMLElement as HTMLElementType, Node as NodeType } from 'node-html-parser';

import { createRequire } from 'module'; // Import createRequire

// 1. Setup require for this file
const require = createRequire(import.meta.url);

// 2. Load the library using require (bypasses the "exports" error)
const { parse, HTMLElement, Node } = require('node-html-parser');

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

    // --- CORRUPTION FIX: Protect <svelte:body> and <svelte:head> ---
    // node-html-parser treats these as non-void elements and may incorrectly nest subsequent content inside them
    // if they are strictly self-closing or if the parser is confused.
    // We replace them with harmless void tags for parsing.
    // --- CORRUPTION FIX: Protect <svelte:body> and <svelte:head> ---
    // node-html-parser treats these as non-void elements. We replace them with void tags.
    // For <svelte:body />, which is void/self-closing, we use <img ... > to ensure the parser doesn't
    // treat it as an open container that swallows subsequent content.
    // We MUST preserve the exact string length for range validity.
    // '<svelte:body' (12 chars) -> '<img        ' (12 chars)
    // '<svelte:head' (12 chars) -> '<div        ' (12 chars)
    // '</svelte:head' (13 chars) -> '</div        ' (13 chars)

    const protectedContent = content
      .replace(/<svelte:body/g, '<img        ')
      .replace(/<svelte:head/g, '<div        ')
      .replace(/<\/svelte:head/g, '</div        ');

    const root = parse(protectedContent, { range: true });

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
    } else if (selector === 'STYLE_BLOCK') {
      const styleTag = root.querySelector('style');
      if (styleTag) {
        foundElement = styleTag as HTMLElement & { range: [number, number] };
        resolvedSelector = 'style';
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
        // Fallback: If no "innermost substantive" tag found, just find ANY displayable tag
        const fallbackSelector = 'img, p, h1, h2, h3, h4, h5, h6, div, span, li, section';
        const fallbackElement = root.querySelector(fallbackSelector);
        if (fallbackElement) {
          foundElement = fallbackElement as HTMLElement & {
            range: [number, number];
          };
          resolvedSelector = getSelector(foundElement);
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
      if (selector === 'STYLE_BLOCK') {
        // Return empty structure for style so we can create it
        return json({
          success: true,
          outerHTML: '<style></style>', // Valid empty style
          prefix: content, // Everything is prefix (append style)
          suffix: '',
          tagName: 'style',
          attributes: {},
          resolvedSelector: 'style',
          isNew: true
        });
      }
      return json({ error: 'Element not found in component' }, { status: 404 });
    }

    const [startIndex, endIndex] = foundElement.range;
    // For style block, we want the inner content, but consistency with "outerHTML" suggests sending the whole tag?
    // The current editor logic expects "outerHTML" to be the thing edited.
    // If we edit CSS, we usually just want the text content.
    // But `EditorPane` reconstruction logic replaces `elementPrefix + newContent + elementSuffix`.
    // So if we send `<style>...</style>` as outerHTML, the editor needs to handle `<style>` wrapping or we assume the user edits the whole block.
    // Let's stick to outerHTML for consistency, but for CSS editing UI we might strip tags.
    // Actually, for PropertyEditor 'Styles', we probably want raw CSS.
    // But `extract` is generic. Let's send the whole tag for now and handle "inner text" in the UI logic if needed.

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
