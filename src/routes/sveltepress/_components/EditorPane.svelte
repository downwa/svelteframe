<!-- FILE: src/routes/sveltepress/_components/EditorPane.svelte -->
<script lang="ts">
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import ManualCKEditor from './ManualCKEditor.svelte';
  import path from 'path-browserify';
  import { debugLog, debugWarn, debugError } from '../lib/server/debug';

  export let selectedFile: { path: string; type: 'page' | 'component' } | null;
  export let editMode = false;
  export let sourceMode = false;
  export let showPreviewWarning = false;
  export let isLoading = true;
  export let showNavControls = false;
  export let canGoToPrevComponent = false;
  export let canGoToNextComponent = false;
  export let canGoToPrevTag = false;
  export let canGoToNextTag = false;
  export let currentTagIndex = 0;
  // --- FIX: Expose hasChanges state ---
  export let hasChanges = false;

  const dispatch = createEventDispatcher();

  let isContentLoading = false;
  let displayPath = '';
  let previewUrl = '';
  let isWarningVisible = false;
  let wysiwygContent = '';
  let fullFileSource = '';
  let originalWysiwygContent = '';
  let originalFullSource = '';
  let showCancelDialog = false;
  export let isElementEdit = false;
  let elementPrefix = '';
  let elementSuffix = '';
  let elementAttributes: Record<string, string> = {};
  let showPlaceholder = false;
  let componentDisplayName = '';
  let iframe: HTMLIFrameElement;
  let iframeSrc = '';

  // --- FIX: Calculate hasChanges based on current mode ---
  $: if (sourceMode) {
    hasChanges = fullFileSource !== originalFullSource;
  } else if (isElementEdit) {
    hasChanges = wysiwygContent !== originalWysiwygContent;
  } else {
    hasChanges = false; // Block editor manages its own changes
  }

  $: if (selectedFile && !isElementEdit) {
    loadPreviewContent(selectedFile);
  }

  $: if (sourceMode && selectedFile) {
    loadSourceContent(selectedFile.path);
  }

  $: if (selectedFile) {
    iframeSrc =
      editMode && selectedFile.type === 'page'
        ? `/sveltepress/editor/block?path=${encodeURIComponent(
            selectedFile.path,
          )}`
        : previewUrl;
  } else {
    iframeSrc = '';
  }

  $: if (showPreviewWarning) {
    isWarningVisible = true;
    setTimeout(() => {
      isWarningVisible = false;
    }, 3000);
  }

  $: if (selectedFile && selectedFile.type === 'component') {
    componentDisplayName = path.basename(selectedFile.path, '.svelte');
  } else {
    componentDisplayName = '';
  }

  onMount(() => {
		const handleMessage = (event: MessageEvent) => {
			if (
				iframe &&
				event.source === iframe.contentWindow &&
				event.data.type === 'SVELTEPRESS_BLOCK_EDITOR_CHANGES'
			) {
				hasChanges = event.data.hasChanges;
			} else if (event.data.type === 'SVELTEPRESS_SAVE_PAGE_EDIT') {
				hasChanges = false;
			}
		};    
    const placeholderTimer = setTimeout(() => {
      if (!isLoading && !selectedFile) {
        showPlaceholder = true;
      }
    }, 200);

    return () => {
      clearTimeout(placeholderTimer);
    };
  });

  export async function loadElementForEditing(
    filePath: string,
    selector: string,
  ) {
    isContentLoading = true;
    isElementEdit = true;
    try {
      const res = await fetch('/sveltepress/api/files/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, selector }),
      });
      if (!res.ok) throw new Error('Failed to extract element');
      const data = await res.json();

      wysiwygContent = data.outerHTML;
      originalWysiwygContent = data.outerHTML;
      elementPrefix = data.prefix;
      elementSuffix = data.suffix;
      elementAttributes = data.attributes;

      if (data.resolvedSelector) {
        dispatch('tagloaded', { selector: data.resolvedSelector });
      }
    } catch (e) {
      debugError(e);
    } finally {
      isContentLoading = false;
    }
  }

  async function loadSourceContent(filePath: string) {
    isContentLoading = true;
    try {
      const res = await fetch(
        `/sveltepress/api/files/content?path=${encodeURIComponent(filePath)}`,
      );
      if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
      fullFileSource = await res.text();
      originalFullSource = fullFileSource;
    } catch (e: any) {
      debugError(e);
      fullFileSource = `Error loading file content: ${e.message}`;
    } finally {
      isContentLoading = false;
    }
  }

  async function loadPreviewContent(file: {
    path: string;
    type: 'page' | 'component';
  }) {
    deriveUrls(file);
    fullFileSource = '';
    originalFullSource = '';
    wysiwygContent = '';
    originalWysiwygContent = '';
  }

  function deriveUrls(file: { path: string; type: 'page' | 'component' }) {
    const srcIndex = file.path.indexOf('src/');
    displayPath = srcIndex !== -1 ? file.path.substring(srcIndex) : file.path;

    let baseUrl = '';
    if (file.type === 'page') {
      const routesIndex = file.path.indexOf('src/routes');
      if (routesIndex !== -1) {
        baseUrl =
          file.path
            .substring(routesIndex + 'src/routes'.length)
            .replace('/+page.svelte', '')
            .replace('//', '/') || '/';
      }
    } else {
      baseUrl = `/sveltepress/preview/${displayPath}`;
    }
    previewUrl = `${baseUrl}?preview=true`;
  }

  function onSaveClick() {
    dispatch('save');
  }

  export async function saveFile() {
    if (!selectedFile) return;
    let fullContentToSave;
    if (isElementEdit) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(wysiwygContent, 'text/html');
      const newElement = doc.body.firstChild as HTMLElement;

      if (!newElement) {
        debugError('Could not parse edited content from CKEditor.');
        return;
      }

      const newTagName = newElement.tagName.toLowerCase();
      const newInnerHTML = newElement.innerHTML;

      let attrsString = '';
      for (const [key, value] of Object.entries(elementAttributes)) {
        attrsString += ` ${key}="${value}"`;
      }

      const reconstructedTag = `<${newTagName}${attrsString}>${newInnerHTML}</${newTagName}>`;
      fullContentToSave = `${elementPrefix}${reconstructedTag}${elementSuffix}`;
    } else {
      fullContentToSave = fullFileSource;
    }

    try {
      await fetch('/sveltepress/api/files/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFile.path,
          content: fullContentToSave,
        }),
      });
      if (isElementEdit) {
        isElementEdit = false;
        dispatch('cancel');
      } else {
        originalFullSource = fullFileSource;
      }
    } catch (e) {
      debugError(e);
    }
  }

  function requestCancel() {
    if (hasChanges) {
      showCancelDialog = true;
    } else {
      if (isElementEdit) {
        isElementEdit = false;
      }
      dispatch('cancel');
    }
  }

  function confirmCancel() {
    showCancelDialog = false;
    if (isElementEdit) {
      isElementEdit = false;
    }
    dispatch('cancel');
  }

  function abortCancel() {
    showCancelDialog = false;
  }

  function handleTabKey(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newContent =
        target.value.substring(0, start) + '\t' + target.value.substring(end);
      fullFileSource = newContent;
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 1;
      }, 0);
    }
  }
</script>

<div class="editor-pane">
  {#if isWarningVisible}
    <div class="warning-overlay">
      <p>This file type cannot be previewed. Starting in edit mode.</p>
    </div>
  {/if}

  {#if showCancelDialog}
    <div class="modal-backdrop">
      <div class="modal-content">
        <h2>Discard Changes?</h2>
        <p>You have unsaved changes. Are you sure you want to discard them?</p>
        <div class="actions">
          <button class="button-secondary" on:click={abortCancel}>No</button>
          <button class="button-danger" on:click={confirmCancel}>
            Yes, Discard
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div class="editor-actions">
    <div class="nav-controls">
      {#if showNavControls}
        <div class="nav-group">
          <button
            class="icon-button"
            title="Previous Component (Ctrl+Alt+PgUp)"
            aria-label="Previous Component"
            disabled={!canGoToPrevComponent}
            on:click|stopPropagation={() => dispatch('prevComponent')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24"
              ><path
                fill="currentColor"
                d="m14 17l-5-5l5-5v10Z"
              ></path></svg
            >
          </button>
          <span class="nav-label">Component</span>
          <button
            class="icon-button"
            title="Next Component (Ctrl+Alt+PgDn)"
            aria-label="Next Component"
            disabled={!canGoToNextComponent}
            on:click|stopPropagation={() => dispatch('nextComponent')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24"
              ><path
                fill="currentColor"
                d="m10 17l5-5l-5-5v10Z"
              ></path></svg
            >
          </button>
        </div>
        <div class="nav-group">
          <button
            class="icon-button"
            title="Previous Tag (Ctrl+Alt+Left)"
            aria-label="Previous Tag"
            disabled={!canGoToPrevTag}
            on:click|stopPropagation={() => dispatch('prevTag')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24"
              ><path
                fill="currentColor"
                d="m14 17l-5-5l5-5v10Z"
              ></path></svg
            >
          </button>
          <span class="nav-label">Tag</span>
          <button
            class="icon-button"
            title="Next Tag (Ctrl+Alt+Right)"
            aria-label="Next Tag"
            disabled={!canGoToNextTag}
            on:click|stopPropagation={() => dispatch('nextTag')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24"
              ><path
                fill="currentColor"
                d="m10 17l5-5l-5-5v10Z"
              ></path></svg
            >
          </button>
        </div>
      {/if}
    </div>

    {#if showNavControls && componentDisplayName}
      <div class="component-display-name" title={selectedFile?.path}>
        {componentDisplayName}
        {#if currentTagIndex > -1}
          <span class="tag-index">: {currentTagIndex + 1}</span>
        {/if}
      </div>
    {/if}

    <div class="action-buttons">
      {#if (editMode || sourceMode) && !(editMode && selectedFile?.type === 'page')}
        <button class="button-secondary" on:click={requestCancel}>
          Cancel
        </button>
        <button class="button-primary" on:click={onSaveClick}>
          Save & Preview
        </button>
      {/if}
    </div>
  </div>

  {#if isLoading}
    <div class="placeholder">
      <p>Loading file list...</p>
    </div>
  {:else if selectedFile}
    <div class="content-area">
      {#if isContentLoading}
        <p>Loading...</p>
      {:else}
        {#key selectedFile.path + editMode + sourceMode + isElementEdit}
          {#if sourceMode}
            <div class="source-mode-warning">
              <strong>Warning:</strong> You are editing the full source code.
            </div>
            <textarea
              class="source-editor"
              bind:value={fullFileSource}
              on:keydown={handleTabKey}
            ></textarea>
          {:else if editMode && selectedFile.type === 'component'}
            {#if isElementEdit}
              <div
                class="source-mode-warning"
                style="background-color: #007acc; color: white;"
              >
                <strong>Surgical Edit Mode:</strong> Editing a single element.
              </div>
            {/if}
            <ManualCKEditor bind:data={wysiwygContent} />
          {:else}
            <iframe
              bind:this={iframe}
              src={iframeSrc}
              title="SveltePress Content"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
            ></iframe>
          {/if}
        {/key}
      {/if}
    </div>
  {:else if showPlaceholder}
    <div class="placeholder">
      <p>
        Use the sidebar to select a file, or the control bar at the top of the
        screen, File menu to create a new file or toggle the file explorer
        sidebar.
      </p>
    </div>
  {/if}
</div>

<style>
  .editor-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    position: relative;
  }
  .content-area {
    flex: 1;
    background: #1e1e1e;
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
    background: white;
  }
  .placeholder {
    display: grid;
    place-content: center;
    text-align: center;
    height: 100%;
    color: #888;
    font-size: 1.2rem;
    padding: 2rem;
  }
  .warning-overlay {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(255, 235, 59, 0.9);
    color: #333;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    z-index: 10;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    pointer-events: none;
    white-space: nowrap;
  }
  .editor-actions {
    background-color: #333;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #444;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
  }
  .nav-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-shrink: 0;
  }
  .action-buttons {
    display: flex;
    gap: 0.75rem;
    flex-shrink: 0;
  }
  .action-buttons button {
    padding: 6px 14px;
    border-radius: 5px;
    border: none;
    font-weight: bold;
    cursor: pointer;
  }
  .button-primary {
    background-color: #3a9a3a;
    color: white;
  }
  .button-secondary {
    background-color: #6c757d;
    color: white;
  }
  .source-mode-warning {
    background: #f0ad4e;
    color: #111;
    padding: 0.5rem 1rem;
    text-align: center;
    font-size: 0.9rem;
    flex-shrink: 0;
  }
  .source-editor {
    flex-grow: 1;
    width: 100%;
    border: none;
    background: #1e1e1e;
    color: #d4d4d4;
    font-family: 'Fira Code', 'Courier New', monospace;
    font-size: 1rem;
    padding: 0.5rem;
    box-sizing: border-box;
    resize: none;
    min-height: 0;
  }
  .modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: grid;
    place-items: center;
    z-index: 1001;
  }
  .modal-content {
    background: #4f4f4f;
    color: #e0e0e0;
    padding: 2rem;
    border-radius: 8px;
    width: min(90%, 450px);
    border: 1px solid #666;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
  }
  .modal-content h2 {
    margin-top: 0;
  }
  .modal-content .actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .modal-content .actions button {
    padding: 8px 16px;
    border-radius: 5px;
    border: none;
    font-weight: bold;
    cursor: pointer;
  }
  .button-danger {
    background-color: #dc3545;
    color: white;
  }
  .nav-group {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: #3c3c3c;
    border-radius: 4px;
    padding: 2px;
    border: 1px solid #555;
  }
  .nav-label {
    font-size: 0.8rem;
    color: #aaa;
    padding: 0 4px;
    font-weight: bold;
    user-select: none;
  }
  .icon-button {
    background: none;
    border: none;
    color: #ccc;
    padding: 4px;
    border-radius: 3px;
    cursor: pointer;
  }
  .icon-button:hover {
    background-color: #4f4f4f;
  }
  .icon-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .icon-button:disabled:hover {
    background: none;
  }
  .component-display-name {
    flex-grow: 1;
    text-align: center;
    color: #ccc;
    font-family: monospace;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 1rem;
  }
  .tag-index {
    color: #888;
  }
</style>