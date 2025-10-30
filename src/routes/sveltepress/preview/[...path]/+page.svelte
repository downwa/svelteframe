<!-- FILE: src/routes/sveltepress/preview/[...path]/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import Footer from '$lib/components/Footer.svelte';
  import { debugLog, debugWarn, debugError } from '../../lib/server/debug';

  let component: any = null;
  let error: string | null = null;
  const componentPath = $page.params.path;
  let hasScanned = false;

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

  function handleClick(event: MouseEvent) {
    if (!event.ctrlKey || !event.altKey) return;

    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const wrapper = target.closest('[data-sp-component]');
    const editableEl = target.closest(
      'p, h1, h2, h3, h4, h5, h6, div, li, td, th, section, article',
    );
    if (wrapper && editableEl instanceof HTMLElement) {
      const componentPathAttr = wrapper.getAttribute('data-sp-component');
      if (!componentPathAttr) return;
      const selector = getSelector(editableEl);

      window.parent.postMessage(
        {
          type: 'SVELTEPRESS_EDIT_COMPONENT',
          path: componentPathAttr,
          selector: selector,
          outerHTML: editableEl.outerHTML,
        },
        '*',
      );
    }
  }

  function reportDomContent() {
    if (!browser || !componentPath) return;

    const parts = componentPath.split('/');
    const fileNameWithExt = parts[parts.length - 1];
    const componentName = fileNameWithExt.replace('.svelte', '');
    const componentSelector = `[data-sp-component="${componentName}"]`;

    const tryScan = () => {
      if (hasScanned) return;

      const componentWrapper = document.querySelector(componentSelector);

      if (!componentWrapper) {
        requestAnimationFrame(tryScan);
        return;
      }

      hasScanned = true;
      debugLog(
        `[[...path]+P:130] Found component wrapper "${componentSelector}". Scanning...`,
      );

      const path = componentWrapper.getAttribute('data-sp-component');
      const components: { path: string; selector: string }[] = path
        ? [{ path, selector: getSelector(componentWrapper as HTMLElement) }]
        : [];

      const containerSelector =
        'p, h1, h2, h3, h4, h5, h6, div, li, td, th, section, article';
      const allContainerElements =
        componentWrapper.querySelectorAll(containerSelector);

      const innermostTags: Element[] = [];

      allContainerElements.forEach((el) => {
        if (el.querySelector(containerSelector) === null) {
          if (el.textContent?.trim() || el.querySelector('img')) {
            innermostTags.push(el);
          }
        }
      });

      debugLog(
        '[[...path]+P:156] Found qualifying innermost tags:',
        innermostTags.map((t) => ({ tag: t.tagName, content: t.outerHTML })),
      );

      const tagSelectors = innermostTags.map((el) =>
        getSelector(el as HTMLElement),
      );

      window.parent.postMessage(
        {
          type: 'SVELTEPRESS_CONTENT_DISCOVERED',
          components,
          tags: tagSelectors,
        },
        '*',
      );
    };

    requestAnimationFrame(tryScan);
  }

  onMount(async () => {
    hasScanned = false;
    document.body.addEventListener('click', handleClick, true);

    try {
      if (componentPath) {
        // --- FIX (Item 4): Correct the dynamic import path ---
        // The path from the URL is already relative to the project root (e.g., 'src/lib/components/...')
        // We need to prepend '/' to make it a root-relative path for Vite's dynamic import.
        const module = await import(
          /* @vite-ignore */ `/${componentPath}`
        );
        component = module.default;

        reportDomContent();
      }
    } catch (err) {
      debugError('Failed to load component:', err);
      error = `Failed to load component: ${componentPath}`;
    }
  });
  onDestroy(() => {
    if (browser) {
      document.body.removeEventListener('click', handleClick, true);
    }
  });
</script>

<div class="preview-wrapper">
  {#if error}
    <p class="error-message">{error}</p>
  {:else if component}
    <div data-sp-thumbnail-capture>
      <svelte:component this={component} />
    </div>
  {:else}
    <p>Loading component preview...</p>
  {/if}
  <Footer />
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
  }

  :global([data-sp-component]) {
    position: relative;
    border: 1px dashed transparent;
    transition: border-color 0.2s ease-in-out;
  }

  :global([data-sp-component]:hover) {
    border-color: #007acc;
    cursor: cell;
  }

  .preview-wrapper {
    height: 100vh;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 2rem;
    font-family: sans-serif;
    display: flex;
    flex-direction: column;
  }

  .preview-wrapper > :global(*:first-child) {
    flex-grow: 1;
  }

  .error-message {
    color: red;
    font-weight: bold;
  }
</style>