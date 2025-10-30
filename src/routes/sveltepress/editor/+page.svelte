<script lang="ts">
  import { page } from '$app/stores';
  import EditorPane from '../_components/EditorPane.svelte';
  import { onMount } from 'svelte';
  import { debugLog, debugWarn, debugError } from '../lib/server/debug';

  // --- State ---
  let allFiles: { pages: any[]; components: any[] } = {
    pages: [],
    components: [],
  };
  let isLoadingFiles = true;
  let activeEditingFile: { path: string; type: 'page' | 'component' } | null =
    null;
  let editMode = false;
  let sourceMode = false;
  let editorPane: EditorPane;
  // --- State for returning to the original page ---
  let returnToPath: string | null = null;
  // --- State for Component Navigation ---
  let pageComponents: { path: string; selector: string }[] = [];
  let currentComponentIndex = -1;
  // --- State for Tag Navigation on this page ---
  let availableTags: string[] = [];
  let currentTagIndex = -1;
  // A URL for the hidden iframe to scan
  let scanUrl: string | null = null;

  // --- Reactive properties for the navigation controls on this page ---
  $: canGoToPrevComponent = currentComponentIndex > 0;
  $: canGoToNextComponent =
    pageComponents.length > 0 &&
    currentComponentIndex < pageComponents.length - 1;
  $: canGoToPrevTag = currentTagIndex > 0;
  $: canGoToNextTag =
    availableTags.length > 0 && currentTagIndex < availableTags.length - 1;
  // --- Reactive block to handle the initial load ---
  $: {
    const componentFromUrl = $page.url.searchParams.get('component');
    if (componentFromUrl && !isLoadingFiles && editorPane) {
      handleEditRequest(
        componentFromUrl,
        $page.url.searchParams.get('selector') || undefined,
      );
    }
  }

  // --- MODIFIED: Save/Cancel handlers now post a message to the parent window ---
  async function handleSave() {
    if (editorPane) {
      await editorPane.saveFile();
      window.parent.postMessage(
        {
          type: 'SVELTEPRESS_EXIT_SURGICAL_EDIT',
          returnTo: returnToPath,
        },
        '*', // Use a specific origin in production
      );
    }
  }

  function handleCancel() {
    window.parent.postMessage(
      {
        type: 'SVELTEPRESS_EXIT_SURGICAL_EDIT',
        returnTo: returnToPath,
      },
      '*', // Use a specific origin in production
    );
  }

  // --- Navigation function for Components ---
  function navigateComponent(direction: 'next' | 'prev') {
    if (!activeEditingFile || !returnToPath) return;

    let newIndex = currentComponentIndex;
    if (currentComponentIndex === -1 && direction === 'next') newIndex = 0;
    else if (currentComponentIndex === -1 && direction === 'prev')
      newIndex = pageComponents.length - 1;
    else newIndex += direction === 'next' ? 1 : -1;

    if (newIndex >= 0 && newIndex < pageComponents.length) {
      currentComponentIndex = newIndex;
      const component = pageComponents[newIndex];
      // Reload the editor page for the new component
      const newUrl =
        `/sveltepress/editor?component=${encodeURIComponent(component.path)}` +
        `&selector=${encodeURIComponent(component.selector)}` +
        `&returnTo=${encodeURIComponent(returnToPath)}`;
      debugError(
        `[editor+P:111] Navigating to component: ${component.path} with selector: ${component.selector}`,
      );
      window.location.href = newUrl;
    }
  }

  /**
   * CORRECTED: Simplified navigation logic. It now assumes currentTagIndex is valid.
   * Also handles the edge case where there are no tags to navigate.
   */
  function navigateTag(direction: 'next' | 'prev') {
    if (!activeEditingFile || availableTags.length === 0) return;

    let newIndex = currentTagIndex + (direction === 'next' ? 1 : -1);

    if (newIndex >= 0 && newIndex < availableTags.length) {
      currentTagIndex = newIndex;
      const selector = availableTags[newIndex];
      editorPane.loadElementForEditing(activeEditingFile.path, selector);
    }
  }

  // --- Core Functions ---
  function handleEditRequest(componentPath: string, selector?: string) {
    const fileToEdit = allFiles.components.find((f) =>
      f.path.includes(componentPath),
    );
    if (fileToEdit) {
      activeEditingFile = fileToEdit;
      if (selector && editorPane) {
        editorPane.loadElementForEditing(fileToEdit.path, selector);
      }
      editMode = true;
    }
  }

  onMount(async () => {
    returnToPath = $page.url.searchParams.get('returnTo');
    // If we have a page to return to, set up the scanner URL
    if (returnToPath) {
      scanUrl = `${returnToPath}?sp_scan=true`;
    }

    // fetch('/sveltepress/api/files')
    //   .then((res) => res.json())
    //   .then((data) => {
    //     allFiles = data;
    //     isLoadingFiles = false;
    //   });

    try {
      const res = await fetch('/sveltepress/api/files');
      if (!res.ok) { // Check if the response is successful (status code 200-299)
        throw new Error(`HTTP error! Status: ${res.status}`); // Throw an error for non-successful responses
      }
      const data = await res.json();

      allFiles = data;
      isLoadingFiles = false;
    } catch (error) {
      console.error('Error fetching files:', error);
      // if(alert) {
      //   alert('1Error fetching files. Please try again later.');
      // }
      document.location.href = '/sveltepress'; // Retry for login
      return;
      // You can handle the error here, for example:
      // - Display an error message to the user
      // - Set a state variable to indicate an error
      // - Re-throw the error if you want it to be handled further up the call stack
    }    

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleSave();
      }
      // Keyboard shortcuts for component and tag navigation
      if (event.ctrlKey && event.altKey) {
        switch (event.key) {
          case 'PageDown':
            event.preventDefault();
            if (canGoToNextComponent) navigateComponent('next');
            break;
          case 'PageUp':
            event.preventDefault();
            if (canGoToPrevComponent) navigateComponent('prev');
            break;
          case 'ArrowRight':
            event.preventDefault();
            if (canGoToNextTag) navigateTag('next');
            break;
          case 'ArrowLeft':
            event.preventDefault();
            if (canGoToPrevTag) navigateTag('prev');
            break;
        }
      }
    };

    // Listen for messages from BOTH the component preview and page scanner iframes
    const handleMessage = (event: MessageEvent) => {
      const { type, tags, components, path } = event.data;

      if (type === 'SVELTEPRESS_CONTENT_DISCOVERED') {
        availableTags = tags || [];
        // YOUR FIX: Set the index to 0 immediately if we have tags.
        currentTagIndex = availableTags.length > 0 ? 0 : -1;

        const initialSelector = $page.url.searchParams.get('selector');

        if (initialSelector) {
          let index = -1;
          const initialParts = initialSelector.split(' > ');

          for (let i = 0; i < initialParts.length; i++) {
            const partialSelector = initialParts.slice(i).join(' > ');

            if (!partialSelector) continue;

            const foundIndex = availableTags.findIndex((tagSelector) =>
              tagSelector.endsWith(partialSelector),
            );

            if (foundIndex !== -1) {
              index = foundIndex;
              break;
            }
          }

          if (index !== -1) {
            currentTagIndex = index;
          }
        }
      } else if (type === 'SVELTEPRESS_PAGE_COMPONENTS') {
        debugError('[editor+P:250] Received page components:', components);
        pageComponents = components || [];
        const currentComponentPath = $page.url.searchParams.get('component');
        if (currentComponentPath) {
          const index = pageComponents.findIndex((c) =>
            c.path.includes(currentComponentPath),
          );
          if (index !== -1) {
            currentComponentIndex = index;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('message', handleMessage);
    };
  });
</script>

<div class="sveltepress-ide">
  <main class="main-content" style="padding-top:0px;">
    <div class="editor-container">
      <EditorPane
        bind:this={editorPane}
        selectedFile={activeEditingFile}
        {editMode}
        {sourceMode}
        isLoading={isLoadingFiles}
        on:save={handleSave}
        on:cancel={handleCancel}
        showNavControls={editMode}
        {canGoToPrevComponent}
        {canGoToNextComponent}
        {canGoToPrevTag}
        {canGoToNextTag}
        on:prevComponent={() => navigateComponent('prev')}
        on:nextComponent={() => navigateComponent('next')}
        on:prevTag={() => navigateTag('prev')}
        on:nextTag={() => navigateTag('next')}
        {currentTagIndex}
      />
    </div>
  </main>
</div>

{#if scanUrl}
  <iframe
    src={scanUrl}
    class="hidden-scanner-iframe"
    title="SveltePress Page Scanner"
    sandbox="allow-scripts allow-same-origin allow-popups"
  ></iframe>
{/if}

<style>
  .hidden-scanner-iframe {
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: 1px;
    height: 1px;
    border: none;
    opacity: 0;
    pointer-events: none;
  }
</style>