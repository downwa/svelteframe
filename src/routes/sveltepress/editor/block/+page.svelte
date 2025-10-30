<!-- FILE: src/routes/sveltepress/editor/block/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import path from 'path-browserify';
	import { debugLog, debugError } from '../../lib/server/debug';
	import PropertyEditor from '../../_components/PropertyEditor.svelte';
	import BlockCanvas from '../../_components/BlockCanvas.svelte';
	import ManualCKEditor from '../../_components/ManualCKEditor.svelte';
	import html2canvas from 'html2canvas';

	let isLoading = true;
	let parsedData: any = null;
	let originalParsedData: any = null;
	let error: string | null = null;
	let selectedObject: any = null;
	let activeEditor: 'properties' | 'ckeditor' | 'none' = 'none';
	let ckEditorContent = '';
	let showCancelConfirmDialog = false;
	let hasChanges = false;
	let propertyEditorRef: PropertyEditor;

	$: componentsInTemplate = parsedData
		? parsedData.template.filter((b: any) => b.type === 'component')
		: [];

	function handlePropReorder(event: CustomEvent) {
		debugLog('[block/+page] Received reorderprops event', event.detail);
		parsedData.props = event.detail;
		checkForChanges();
	}

	function handleBlockCanvasReorder(event: CustomEvent) {
		debugLog(
			'[block/+page] Received reorder event from BlockCanvas',
			event.detail,
		);
		parsedData.template = event.detail;
		checkForChanges();
	}

	// --- FIX: Handler for component reordering from PropertyEditor ---
	function handleComponentReorder(event: CustomEvent) {
		const reorderedComponentIds = event.detail.map((c: any) => c.id);
		const newTemplate = [...parsedData.template];
		const componentsFromTemplate = newTemplate.filter(
			(b) => b.type === 'component',
		);

		// Create a map for quick lookup
		const componentMap = new Map(
			componentsFromTemplate.map((c) => [c.id, c]),
		);

		// Get the reordered components in their new order
		const reorderedComponents = reorderedComponentIds
			.map((id: string) => componentMap.get(id))
			.filter(Boolean); // filter out undefined if any mismatch

		// Replace the old components in the template with the reordered ones
		let componentIndex = 0;
		for (let i = 0; i < newTemplate.length; i++) {
			if (newTemplate[i].type === 'component') {
				if (reorderedComponents[componentIndex]) {
					newTemplate[i] = reorderedComponents[componentIndex];
					componentIndex++;
				}
			}
		}

		parsedData.template = newTemplate;
		checkForChanges();
	}

	function handlePreviewComponent(event: CustomEvent) {
		const componentToPreview = event.detail;
		if (componentToPreview?.type !== 'component') return;

		const componentImport = parsedData.imports.find((imp: any) =>
			imp.specifiers.some((s: any) => s.name === componentToPreview.name),
		);

		if (componentImport) {
			const path = componentImport.source
				.replace('$lib/', 'src/lib/')
				.replace(/^\//, '');
			const previewUrl = `/sveltepress/preview/${path}`;
			window.open(previewUrl, '_blank');
		} else {
			debugError(
				`Could not find import for component "${componentToPreview.name}" to preview.`,
			);
		}
	}

	function computeDiff(original: any, modified: any) {
		// This function remains the same
		return JSON.stringify(original) !== JSON.stringify(modified);
	}

	function checkForChanges() {
		if (!parsedData || !originalParsedData) {
			hasChanges = false;
			return;
		}
		const newHasChanges = computeDiff(originalParsedData, parsedData);

		// --- FIX: Communicate change status to the parent window (EditorPane) ---
		if (newHasChanges !== hasChanges) {
			hasChanges = newHasChanges;
			window.parent.postMessage(
				{ type: 'SVELTEPRESS_BLOCK_EDITOR_CHANGES', hasChanges },
				'*', // Use a specific origin in production
			);
		}
	}

	$: if (selectedObject) {
		if (selectedObject.type === 'html') {
			activeEditor = 'ckeditor';
			ckEditorContent = selectedObject.content;
		} else {
			activeEditor = 'properties';
		}
		if (propertyEditorRef) {
			propertyEditorRef.scrollToSelected(selectedObject);
		}
	} else {
		activeEditor = 'none';
	}

	$: if (activeEditor === 'ckeditor' && selectedObject) {
		selectedObject.content = ckEditorContent;
		checkForChanges();
	}

	function handleSelect(event: CustomEvent) {
		selectedObject = event.detail;
	}

	function handleDelete(event: CustomEvent) {
		const objectToDelete = event.detail;
		let wasDeleted = false;

		if (parsedData.template.some((b: any) => b.id === objectToDelete.id)) {
			parsedData.template = parsedData.template.filter(
				(b: any) => b.id !== objectToDelete.id,
			);
			wasDeleted = true;
		}

		if (
			objectToDelete.name &&
			parsedData.props.some((p: any) => p.name === objectToDelete.name)
		) {
			parsedData.props = parsedData.props.filter(
				(p: any) => p.name !== objectToDelete.name,
			);
			wasDeleted = true;
		}

		if (objectToDelete.parentProp && objectToDelete.arrayIndex !== undefined) {
			const parent = parsedData.props.find(
				(p: any) => p.name === objectToDelete.parentProp.name,
			);
			if (parent) {
				try {
					const arr = JSON.parse(parent.value);
					if (Array.isArray(arr)) {
						arr.splice(objectToDelete.arrayIndex, 1);
						parent.value = JSON.stringify(arr, null, 2);
						wasDeleted = true;
					}
				} catch (e) {
					debugError('Could not delete from script property array', e);
				}
			}
		}

		if (wasDeleted && selectedObject?.id === objectToDelete.id) {
			selectedObject =
				parsedData.head ||
				parsedData.template[0] ||
				parsedData.props[0] ||
				null;
		}

		parsedData = { ...parsedData };
		checkForChanges();
	}

	async function handleComponentDrop(event: CustomEvent) {
		const { file, index } = event.detail;
		const componentName = path.basename(file.path, '.svelte');
		const importSource = file.path.replace('src/lib/', '$lib/');

		const newBlock: any = {
			id: crypto.randomUUID(),
			type: 'component',
			name: componentName,
			props: {},
		};

		try {
			const res = await fetch(
				`/sveltepress/api/files/component-props?path=${encodeURIComponent(
					file.path,
				)}`,
			);
			if (res.ok) {
				const props = await res.json();
				for (const prop of props) {
					try {
						newBlock.props[prop.name] = JSON.parse(prop.defaultValue);
					} catch {
						newBlock.props[prop.name] = prop.defaultValue.replace(
							/^['"]|['"]$/g,
							'',
						);
					}
				}
			}
		} catch (e) {
			debugError(`Could not fetch default props for ${componentName}`, e);
		}

		if (index !== null) {
			parsedData.template.splice(index, 0, newBlock);
		} else {
			parsedData.template.push(newBlock);
		}
		parsedData.template = [...parsedData.template];

		const importExists = parsedData.imports.some(
			(imp: any) => imp.source === importSource,
		);
		if (!importExists) {
			parsedData.imports.push({
				specifiers: [{ name: componentName, type: 'ImportDefaultSpecifier' }],
				source: importSource,
				kind: 'value',
			});
			parsedData.imports = [...parsedData.imports];
		}
		selectedObject = newBlock;
		checkForChanges();
	}

	async function handleSave() {
		debugLog('Attempting to save changes...');
		try {
			const res = await fetch('/sveltepress/api/files/reconstruct-page', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePath: $page.url.searchParams.get('path'),
					ast: parsedData,
				}),
			});
			const result = await res.json();
			if (!res.ok) {
				throw new Error(result.message || 'Failed to save file.');
			}
			debugLog('Save successful:', result.message);
			originalParsedData = JSON.parse(JSON.stringify(parsedData));
			checkForChanges();
			window.parent.postMessage({ type: 'SVELTEPRESS_SAVE_PAGE_EDIT' }, '*');
		} catch (err: any) {
			debugError('Save failed:', err);
			alert(`Error saving file: ${err.message}`);
		}
	}

	function handleCancel() {
		if (hasChanges) {
			showCancelConfirmDialog = true;
		} else {
			window.parent.postMessage({ type: 'SVELTEPRESS_CANCEL_PAGE_EDIT' }, '*');
		}
	}

	function confirmCancel() {
		showCancelConfirmDialog = false;
		window.parent.postMessage({ type: 'SVELTEPRESS_CANCEL_PAGE_EDIT' }, '*');
	}

	function abortCancel() {
		showCancelConfirmDialog = false;
	}

  async function generateThumbnails() {
    if (!parsedData?.template) return;
    const componentsToRender = parsedData.template.filter(
      (b: any) => b.type === 'component' && !b.thumbnail,
    );
    if (componentsToRender.length === 0) return;

    const rendererContainer = document.getElementById('thumbnail-renderer');
    if (!rendererContainer) return;

    for (const block of componentsToRender) {
      const componentImport = parsedData.imports.find((imp: any) =>
        imp.specifiers.some((s: any) => s.name === block.name),
      );
      if (!componentImport) continue;

      const componentPath = componentImport.source
        .replace('$lib/', 'src/lib/')
        .replace(/^\//, '');
      const previewUrl = `/sveltepress/preview/${componentPath}`;

      const iframe = document.createElement('iframe');
      iframe.src = previewUrl;
      iframe.style.width = '400px';
      iframe.style.height = '300px';
      iframe.style.border = 'none';

      try {
        await new Promise<void>((resolve, reject) => {
          iframe.onload = async () => {
            try {
              const targetElement =
                iframe.contentDocument?.querySelector(
                  '[data-sp-thumbnail-capture]',
                ) || iframe.contentDocument?.body;

              if (targetElement) {
                const canvas = await html2canvas(targetElement as HTMLElement, {
                  useCORS: true,
                  backgroundColor: null,
                });
                block.thumbnail = canvas.toDataURL('image/png');
                parsedData.template = [...parsedData.template];
              }
              resolve();
            } catch (e) {
              reject(e);
            } finally {
              rendererContainer.removeChild(iframe);
            }
          };
          iframe.onerror = reject;
          rendererContainer.appendChild(iframe);
        });
      } catch (e) {
        debugError(`Failed to generate thumbnail for ${block.name}`, e);
      }
    }
  }

  onMount(async () => {
    const filePath = $page.url.searchParams.get('path');
    if (!filePath) {
      error = 'No file path provided in URL.';
      isLoading = false;
      return;
    }
    try {
      const res = await fetch('/sveltepress/api/files/parse-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to parse page.');
      }
      const data = await res.json();
      if (data.success) {
        originalParsedData = JSON.parse(JSON.stringify(data.ast));
        parsedData = JSON.parse(JSON.stringify(data.ast));
        if (parsedData.head) {
          parsedData.head.type = 'head';
          parsedData.head.id = 'page-head';
        }
        if (originalParsedData.head) {
          originalParsedData.head.type = 'head';
          originalParsedData.head.id = 'page-head';
        }
        if (parsedData.template) {
          parsedData.template.forEach(
            (block: any) => (block.id = crypto.randomUUID()),
          );
        }
        if (originalParsedData.template) {
          originalParsedData.template.forEach(
            (block: any, i: number) =>
              (block.id = parsedData.template[i].id),
          );
        }
        if (
          parsedData.head &&
          (parsedData.head.title || parsedData.head.meta.length > 0)
        ) {
          selectedObject = parsedData.head;
        } else {
          selectedObject = parsedData.template[0] || parsedData.props[0];
        }
        checkForChanges();
        setTimeout(generateThumbnails, 500);
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      debugError('Failed to load or parse page:', e);
      error = e.message;
    } finally {
      isLoading = false;
    }
  });
</script>

<div
  id="thumbnail-renderer"
  style="position: absolute; left: -9999px; top: -9999px;"
></div>

{#if showCancelConfirmDialog}
  <div class="modal-backdrop">
    <div class="modal-content">
      <h2>Discard Changes?</h2>
      <p>You have unsaved changes. Are you sure you want to discard them?</p>
      <div class="modal-actions">
        <button class="button-secondary" on:click={abortCancel}>
          No, Keep Editing
        </button>
        <button class="button-danger" on:click={confirmCancel}>
          Yes, Discard
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="block-editor-layout">
  <header class="editor-header">
    <div class="file-info">
      Editing Page: {$page.url.searchParams.get('path')?.split('/').pop()}
    </div>
    <div class="actions">
      <button class="button-add" on:click={handleAddHtmlBlock}>
        + Add HTML Block
      </button>
      <button class="button-secondary" on:click={handleCancel}>Cancel</button>
      <button class="button-primary" on:click={handleSave}>
        Save & Preview
      </button>
    </div>
  </header>

  <div class="editor-panes">
    {#if isLoading}
      <p>Loading page data...</p>
    {:else if error}
      <p class="error-message">{error}</p>
    {:else if parsedData}
      <div class="top-pane">
        {#if activeEditor === 'properties'}
          <PropertyEditor
            bind:this={propertyEditorRef}
            bind:head={parsedData.head}
            bind:props={parsedData.props}
            components={componentsInTemplate}
            imports={parsedData.imports}
            {selectedObject}
            on:select={handleSelect}
            on:change={checkForChanges}
            on:dropcomponent={handleComponentDrop}
            on:delete={handleDelete}
            on:reorderprops={handlePropReorder}
            on:reordercomponents={handleComponentReorder}
            on:previewcomponent={handlePreviewComponent}
          />        
        {:else if activeEditor === 'ckeditor'}
          <ManualCKEditor bind:data={ckEditorContent} />
        {:else}
          <div class="no-selection-pane">
            <p>Select an item to edit its properties.</p>
          </div>
        {/if}
      </div>
      <div
        class="bottom-pane"
        title="Drag components from the File Explorer here"
      >
        <BlockCanvas
          template={parsedData.template}
          {selectedObject}
          on:select={handleSelect}
          on:delete={handleDelete}
          on:reorder={handleBlockCanvasReorder}
          on:dropnew={handleComponentDrop}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .block-editor-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    position: relative;
  }
  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    background-color: #333;
    border-bottom: 1px solid #444;
    flex-shrink: 0;
  }
  .file-info {
    font-family: monospace;
    flex-grow: 1;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .actions button {
    padding: 6px 14px;
    border-radius: 5px;
    border: none;
    font-weight: bold;
    cursor: pointer;
    white-space: nowrap;
  }
  .button-primary {
    background-color: #3a9a3a;
    color: white;
  }
  .button-secondary {
    background-color: #6c757d;
    color: white;
  }
  .button-danger {
    background-color: #dc3545;
    color: white;
  }
  .button-add {
    background-color: #007acc;
    color: white;
  }
  .editor-panes {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-height: 0;
  }
  .top-pane {
    height: 40%;
    min-height: 200px;
    flex-shrink: 0;
    display: flex;
  }
  .top-pane > :global(*) {
    flex-grow: 1;
  }
  .bottom-pane {
    height: 60%;
    flex-grow: 1;
  }
  .error-message {
    color: #f44336;
    padding: 2rem;
  }
  .no-selection-pane {
    display: grid;
    place-content: center;
    color: #888;
    width: 100%;
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
  .modal-content .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .modal-content .modal-actions button {
    padding: 8px 16px;
    border-radius: 5px;
    border: none;
    font-weight: bold;
    cursor: pointer;
  }
</style>